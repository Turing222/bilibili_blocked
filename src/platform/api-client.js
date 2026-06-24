// == B 站 API 适配层 =========================================================
//
// 职责：
// - 集中管理所有 B 站 API URL。
// - 处理请求频率限制。
// - 记录 API 请求健康状态。
// - 写入 videoStore，而不是直接操作全局对象。
//
// 不负责：
// - 不判断规则是否命中。
// - 不操作 DOM。
// - 不决定功能是否启用；启用判断在 feature 文件。

import {
    API_ENDPOINT_IDS,
    CAPABILITY_IDS,
    getCapability as getCapabilityMetadata,
    listCapabilities,
} from "../capabilities/registry.js";
import {
    API_DATA_KEYS,
    API_DATA_STATUS,
    createApiHealthStore,
} from "./api-health.js";
import { consoleLogOutput } from "../utils/log.js";

const API_RETRY_DELAY_MS = 3000;

let getApiSettings = () => ({ accumulateBlockedRules_Switch: false });

function shouldSkipApiWhenBlocked(videoBv, videoStore) {
    const videoInfo = videoStore.getVideoInfo(videoBv);
    if (!videoInfo?.blockedTarget) {
        return false;
    }

    return !getApiSettings().accumulateBlockedRules_Switch;
}

export function createBilibiliApiClient() {
    let apiRequestDelayTime = 0;
    let refreshCallback = () => {};
    const apiHealth = createApiHealthStore();
    const regionNameCache = {};
    const inFlightViewFetches = new Map();
    const inFlightTagFetches = new Map();
    const inFlightCommentFetches = new Map();
    const inFlightUpInfoFetches = new Map();

    function getFallbackRegionName(regionId) {
        return regionId ? `rid:${regionId}` : "";
    }

    function requestRegionNameIfNeeded(regionId, videoStore, videoBv) {
        const cached = regionNameCache[regionId];
        if (cached?.name) {
            videoStore.mergeVideoInfo(videoBv, {
                videoPartitions: cached.name,
            });
            refreshCallback();
            return;
        }

        if (cached?.pending) {
            return;
        }

        regionNameCache[regionId] = {
            name: "",
            pending: true,
        };

        requestApiJson({
            capabilityId: CAPABILITY_IDS.VIDEO_REGION_FALLBACK_API,
            endpointId: API_ENDPOINT_IDS.REGION_NAME,
            url: `https://api.bilibili.com/x/web-interface/dynamic/region?ps=1&rid=${regionId}`,
            emptyWhen: (json) => !json.data?.archives?.[0]?.tname,
        }).then((result) => {
            const regionName = result.json?.data?.archives?.[0]?.tname || "";
            regionNameCache[regionId] = {
                name: regionName || getFallbackRegionName(regionId),
                pending: false,
            };

            videoStore.mergeVideoInfo(videoBv, {
                videoPartitions: regionNameCache[regionId].name,
            });

            if (!result.ok) {
                consoleLogOutput("region API request failed:", result.errorKind, result.message);
            }

            refreshCallback();
        });
    }

    function fetchVideoView(videoBv, videoStore) {
        if (inFlightViewFetches.has(videoBv)) {
            return inFlightViewFetches.get(videoBv);
        }

        if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW)) {
            return Promise.resolve();
        }

        const currentTime = new Date();
        videoStore.mergeVideoInfo(videoBv, {
            lastVideoInfoApiRequestTime: currentTime,
        });
        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.VIDEO_VIEW_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_VIEW,
        });

        const promise = requestApiJson({
            capabilityId: CAPABILITY_IDS.VIDEO_VIEW_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_VIEW,
            url: `https://api.bilibili.com/x/web-interface/view?bvid=${videoBv}`,
            emptyWhen: (json) => !json.data,
        }).then((result) => {
            if (!result.ok) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.UNAVAILABLE, result);
                consoleLogOutput("video view API request failed:", result.errorKind, result.message);
                return;
            }

            const data = result.json?.data;
            if (!data) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.EMPTY, result);
                return;
            }

            const videoView = data.stat?.view;
            const videoLike = data.stat?.like;
            const videoCoin = data.stat?.coin;
            const videoFavorite = data.stat?.favorite;

            const videoPartitionId = data.tid || data.tid_v2;
            const videoPartitionName = data.tname_v2 || data.tname || "";

            videoStore.mergeVideoInfo(videoBv, {
                videoUpName: data.owner?.name || "",
                videoUpUid: data.owner?.mid || "",
                videoAVid: data.aid,
                videoPubdate: data.pubdate,
                videoDuration: data.duration,
                videoPartitionId,
                videoPartitions: videoPartitionName || getFallbackRegionName(videoPartitionId),
                videoView,
                videoLike,
                videoLikesRate: ((videoLike / videoView) * 100).toFixed(2),
                videoCoin,
                videoCoinRate: ((videoCoin / videoView) * 100).toFixed(2),
                videoFavorite,
                videoFavoriteCoinRatio: (videoFavorite / videoCoin).toFixed(2),
                videoChargingExclusive: data.is_upower_exclusive,
                videoResolution: {
                    width: data.dimension?.width || 0,
                    height: data.dimension?.height || 0,
                },
            });
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.READY, result);

            if (!videoPartitionName && videoPartitionId) {
                requestRegionNameIfNeeded(videoPartitionId, videoStore, videoBv);
            }
        }).catch((error) => {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.UNAVAILABLE, {
                capabilityId: CAPABILITY_IDS.VIDEO_VIEW_API,
                endpointId: API_ENDPOINT_IDS.VIDEO_VIEW,
                errorKind: "unexpected",
                message: error.message,
            });
            consoleLogOutput("video view API request failed:", error);
        }).finally(() => {
            inFlightViewFetches.delete(videoBv);
        });

        inFlightViewFetches.set(videoBv, promise);
        return promise;
    }

    function fetchVideoTags(videoBv, videoStore) {
        if (inFlightTagFetches.has(videoBv)) {
            return inFlightTagFetches.get(videoBv);
        }

        if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS)) {
            return Promise.resolve();
        }

        const currentTime = new Date();
        videoStore.mergeVideoInfo(videoBv, {
            lastVideoTagApiRequestTime: currentTime,
        });
        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.VIDEO_TAGS_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_TAGS,
        });

        const promise = requestApiJson({
            capabilityId: CAPABILITY_IDS.VIDEO_TAGS_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_TAGS,
            url: `https://api.bilibili.com/x/web-interface/view/detail/tag?bvid=${videoBv}`,
            emptyWhen: (json) => !Array.isArray(json.data) || json.data.length === 0,
        }).then((result) => {
            if (!result.ok) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS, API_DATA_STATUS.UNAVAILABLE, result);
                consoleLogOutput("video tags API request failed:", result.errorKind, result.message);
                return;
            }

            const tags = Array.isArray(result.json?.data)
                ? result.json.data.map((tagsArray) => tagsArray.tag_name).filter(Boolean)
                : [];
            videoStore.mergeVideoInfo(videoBv, {
                videoTags: tags,
            });
            markVideoDataState(
                videoBv,
                videoStore,
                API_DATA_KEYS.VIDEO_TAGS,
                tags.length > 0 ? API_DATA_STATUS.READY : API_DATA_STATUS.EMPTY,
                result
            );
        }).catch((error) => {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS, API_DATA_STATUS.UNAVAILABLE, {
                capabilityId: CAPABILITY_IDS.VIDEO_TAGS_API,
                endpointId: API_ENDPOINT_IDS.VIDEO_TAGS,
                errorKind: "unexpected",
                message: error.message,
            });
            consoleLogOutput("video tags API request failed:", error);
        }).finally(() => {
            inFlightTagFetches.delete(videoBv);
        });

        inFlightTagFetches.set(videoBv, promise);
        return promise;
    }

    function fetchVideoComments(videoBv, videoStore, { force = false } = {}) {
        if (inFlightCommentFetches.has(videoBv)) {
            return inFlightCommentFetches.get(videoBv);
        }

        if (!force && !shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS)) {
            return Promise.resolve(null);
        }

        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.COMMENT_API,
            endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
        });

        const promise = ensureVideoAid(videoBv, videoStore)
            .then((aid) => requestVideoCommentsByOid(aid || videoBv))
            .then((result) => {
                if (!result.ok) {
                    markVideoDataState(
                        videoBv,
                        videoStore,
                        API_DATA_KEYS.VIDEO_COMMENTS,
                        API_DATA_STATUS.UNAVAILABLE,
                        result
                    );
                    consoleLogOutput("video comments API request failed:", result.errorKind, result.message);
                    return null;
                }

                const commentData = result.json?.data;
                if (!commentData) {
                    markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.EMPTY, result);
                    return {
                        filteredComments: false,
                        topComment: "",
                    };
                }

                const nextInfo = {
                    filteredComments: Boolean(commentData.control?.web_selection),
                    topComment: readTopCommentMessage(commentData),
                };
                const hasCommentSignal = nextInfo.filteredComments || nextInfo.topComment;
                markVideoDataState(
                    videoBv,
                    videoStore,
                    API_DATA_KEYS.VIDEO_COMMENTS,
                    hasCommentSignal ? API_DATA_STATUS.READY : API_DATA_STATUS.EMPTY,
                    result
                );
                return nextInfo;
            })
            .catch((error) => {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.UNAVAILABLE, {
                    capabilityId: CAPABILITY_IDS.COMMENT_API,
                    endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
                    errorKind: "unexpected",
                    message: error.message,
                });
                consoleLogOutput("video comments API request failed:", error);
                return null;
            })
            .finally(() => {
                inFlightCommentFetches.delete(videoBv);
            });

        inFlightCommentFetches.set(videoBv, promise);
        return promise;
    }

    function ensureVideoAid(videoBv, videoStore) {
        const videoInfo = videoStore.getVideoInfo(videoBv);
        if (videoInfo?.videoAVid) {
            return Promise.resolve(videoInfo.videoAVid);
        }

        return fetchVideoView(videoBv, videoStore)
            .then(() => videoStore.getVideoInfo(videoBv)?.videoAVid || "");
    }

    function requestVideoCommentsByOid(oid) {
        const params = new URLSearchParams({
            type: 1,
            oid,
            mode: 3,
            next: 0,
            ps: 1,
        }).toString();

        return requestApiJson({
            capabilityId: CAPABILITY_IDS.COMMENT_API,
            endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
            url: `https://api.bilibili.com/x/v2/reply/main?${params}`,
            emptyWhen: (json) => !json.data,
        }).then((result) => {
            if (result.ok) {
                return result;
            }

            return requestLegacyVideoCommentsByOid(oid);
        });
    }

    function requestLegacyVideoCommentsByOid(oid) {
        const params = new URLSearchParams({
            type: 1,
            oid,
            sort: 0,
            ps: 1,
            pn: 1,
            nohot: 0,
        }).toString();

        return requestApiJson({
            capabilityId: CAPABILITY_IDS.COMMENT_API,
            endpointId: API_ENDPOINT_IDS.COMMENT_LEGACY,
            url: `https://api.bilibili.com/x/v2/reply?${params}`,
            emptyWhen: (json) => !json.data,
        });
    }

    function requestUpInfo(videoBv, videoStore, upUid) {
        if (inFlightUpInfoFetches.has(upUid)) {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.PENDING, {
                capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
                endpointId: API_ENDPOINT_IDS.UP_CARD,
            });
            return inFlightUpInfoFetches.get(upUid);
        }

        if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, { allowReady: true })) {
            return Promise.resolve();
        }

        const currentTime = new Date();
        videoStore.mergeVideoInfo(videoBv, {
            lastVideoUpInfoApiRequestTime: currentTime,
        });
        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
            endpointId: API_ENDPOINT_IDS.UP_CARD,
        });

        const promise = requestApiJson({
            capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
            endpointId: API_ENDPOINT_IDS.UP_CARD,
            url: `https://api.bilibili.com/x/web-interface/card?mid=${upUid}`,
            emptyWhen: (json) => !json.data?.card,
        }).then((result) => {
            if (!result.ok) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.UNAVAILABLE, result);
                consoleLogOutput("UP profile API request failed:", result.errorKind, result.message);
                return;
            }

            const card = result.json?.data?.card;
            if (!card) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.EMPTY, result);
                return;
            }

            videoStore.mergeUpInfo(upUid, {
                upName: card.name,
                upLevel: card.level_info?.current_level,
                upFans: card.fans,
                upSign: card.sign,
                updateTime: new Date(),
            });

            videoStore.mergeVideoInfo(videoBv, {
                videoUpLevel: card.level_info?.current_level,
                videoUpFans: card.fans,
                videoUpSign: card.sign,
            });
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.READY, result);
        }).catch((error) => {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.UNAVAILABLE, {
                capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
                endpointId: API_ENDPOINT_IDS.UP_CARD,
                errorKind: "unexpected",
                message: error.message,
            });
            consoleLogOutput("UP profile API request failed:", error);
        }).finally(() => {
            inFlightUpInfoFetches.delete(upUid);
            refreshCallback();
        });

        inFlightUpInfoFetches.set(upUid, promise);
        return promise;
    }

    function requestApiJson({ capabilityId, endpointId, url, emptyWhen = () => false }) {
        const startedAt = Date.now();
        let httpStatus = null;

        return fetch(url)
            .then((response) => {
                httpStatus = response.status;
                return response.json().then((json) => ({ response, json }));
            })
            .then(({ response, json }) => {
                const durationMs = Date.now() - startedAt;
                const apiCode = readApiCode(json);
                const baseDetails = {
                    capabilityId,
                    endpointId,
                    httpStatus,
                    apiCode,
                    durationMs,
                };

                if (!response.ok) {
                    const result = {
                        ...baseDetails,
                        ok: false,
                        dataStatus: API_DATA_STATUS.UNAVAILABLE,
                        json,
                        errorKind: "http",
                        message: response.statusText || `HTTP ${response.status}`,
                    };
                    apiHealth.recordFailure(result);
                    return result;
                }

                if (apiCode !== null && apiCode !== 0) {
                    const result = {
                        ...baseDetails,
                        ok: false,
                        dataStatus: API_DATA_STATUS.UNAVAILABLE,
                        json,
                        errorKind: "api-code",
                        message: readApiMessage(json) || `code ${apiCode}`,
                    };
                    apiHealth.recordFailure(result);
                    return result;
                }

                if (emptyWhen(json)) {
                    const result = {
                        ...baseDetails,
                        ok: true,
                        dataStatus: API_DATA_STATUS.EMPTY,
                        json,
                    };
                    apiHealth.recordEmpty(result);
                    return result;
                }

                const result = {
                    ...baseDetails,
                    ok: true,
                    dataStatus: API_DATA_STATUS.READY,
                    json,
                };
                apiHealth.recordSuccess(result);
                return result;
            })
            .catch((error) => {
                const result = {
                    capabilityId,
                    endpointId,
                    ok: false,
                    dataStatus: API_DATA_STATUS.UNAVAILABLE,
                    httpStatus,
                    apiCode: null,
                    durationMs: Date.now() - startedAt,
                    json: null,
                    errorKind: "network",
                    message: error.message || String(error),
                };
                apiHealth.recordFailure(result);
                return result;
            });
    }

    return {
        setRefreshCallback(callback) {
            refreshCallback = callback;
        },

        setSettingsProvider(settingsProvider) {
            getApiSettings = settingsProvider;
        },

        getApiHealthSnapshot() {
            return apiHealth.getSnapshot();
        },

        getCapability(capabilityId) {
            return getCapabilityMetadata(capabilityId);
        },

        listCapabilities() {
            return listCapabilities();
        },

        getVideoDataStatus(videoBv, videoStore, dataKey) {
            return readVideoDataState(videoBv, videoStore, dataKey);
        },

        ensurePartitionData(videoBv, videoStore, { bypassBlockedSkip = false } = {}) {
            const cached = partitionFromVideoInfo(videoStore.getVideoInfo(videoBv));
            if (cached && (cached.name || cached.id)) {
                return Promise.resolve(cached);
            }

            if (!bypassBlockedSkip && shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return Promise.resolve({ name: "", id: "" });
            }

            return fetchVideoView(videoBv, videoStore).then(() => {
                return partitionFromVideoInfo(videoStore.getVideoInfo(videoBv)) || { name: "", id: "" };
            });
        },

        ensureTagsData(videoBv, videoStore, { bypassBlockedSkip = false } = {}) {
            const videoTags = videoStore.getVideoInfo(videoBv)?.videoTags;
            if (videoTags) {
                return Promise.resolve(videoTags);
            }

            if (!bypassBlockedSkip && shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return Promise.resolve([]);
            }

            return fetchVideoTags(videoBv, videoStore).then(() => {
                return videoStore.getVideoInfo(videoBv)?.videoTags || [];
            });
        },

        requestVideoInfoIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo || videoInfo.videoDuration !== undefined) {
                return;
            }

            if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW)) {
                return;
            }

            fetchVideoView(videoBv, videoStore)
                .then(() => refreshCallback());
        },

        requestVideoTagsIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo || videoInfo.videoTags) {
                return;
            }

            if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS)) {
                return;
            }

            fetchVideoTags(videoBv, videoStore)
                .then(() => refreshCallback());
        },

        requestUpInfoIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo?.videoUpUid) {
                return;
            }

            const upUid = videoInfo.videoUpUid;
            const videoUpInfo = videoStore.getUpInfo(upUid);
            const currentTime = new Date();

            if (videoUpInfo?.upLevel && currentTime - videoUpInfo.updateTime < 3600000) {
                videoStore.mergeVideoInfo(videoBv, {
                    videoUpLevel: videoUpInfo.upLevel,
                    videoUpFans: videoUpInfo.upFans,
                    videoUpSign: videoUpInfo.upSign,
                });
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.READY, {
                    capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
                    endpointId: API_ENDPOINT_IDS.UP_CARD,
                });
                return;
            }

            requestUpInfo(videoBv, videoStore, upUid);
        },

        requestCommentsIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo || videoInfo.filteredComments === false || videoInfo.filteredComments === true) {
                return;
            }

            const currentTime = new Date();
            if (
                videoInfo.lastVideoCommentsApiRequestTime &&
                currentTime - videoInfo.lastVideoCommentsApiRequestTime < API_RETRY_DELAY_MS
            ) {
                return;
            }

            if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS)) {
                return;
            }

            videoStore.mergeVideoInfo(videoBv, {
                lastVideoCommentsApiRequestTime: new Date(currentTime.getTime() + apiRequestDelayTime),
            });
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.PENDING, {
                capabilityId: CAPABILITY_IDS.COMMENT_API,
                endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
            });

            const apiRequestDelayTimeMax = countPendingComments(videoStore.videoInfoDict) * 100;
            if (apiRequestDelayTime > apiRequestDelayTimeMax) {
                apiRequestDelayTime = 0;
            }

            setTimeout(() => {
                fetchVideoComments(videoBv, videoStore, { force: true })
                    .then((commentData) => {
                        if (commentData) {
                            videoStore.mergeVideoInfo(videoBv, commentData);
                        }

                        refreshCallback();
                    });
            }, apiRequestDelayTime);

            apiRequestDelayTime = apiRequestDelayTime + 100;
        },
    };
}

function shouldRequestVideoData(videoBv, videoStore, dataKey, { allowReady = false } = {}) {
    const state = readVideoDataState(videoBv, videoStore, dataKey);
    if (state.status === API_DATA_STATUS.PENDING || (state.status === API_DATA_STATUS.READY && !allowReady)) {
        return false;
    }

    if (
        (state.status === API_DATA_STATUS.EMPTY || state.status === API_DATA_STATUS.UNAVAILABLE) &&
        state.updatedAtMs &&
        Date.now() - state.updatedAtMs < API_RETRY_DELAY_MS
    ) {
        return false;
    }

    return true;
}

function readVideoDataState(videoBv, videoStore, dataKey) {
    const state = videoStore.getVideoInfo(videoBv)?.apiDataStates?.[dataKey];
    if (!state) {
        return {
            status: API_DATA_STATUS.UNKNOWN,
            updatedAtMs: null,
            capabilityId: "",
            endpointId: "",
            errorKind: "",
            message: "",
        };
    }

    return { ...state };
}

function markVideoDataState(videoBv, videoStore, dataKey, status, details = {}) {
    const videoInfo = videoStore.getVideoInfo(videoBv) || {};
    videoStore.mergeVideoInfo(videoBv, {
        apiDataStates: {
            ...(videoInfo.apiDataStates || {}),
            [dataKey]: {
                status,
                updatedAtMs: Date.now(),
                capabilityId: details.capabilityId || videoInfo.apiDataStates?.[dataKey]?.capabilityId || "",
                endpointId: details.endpointId || videoInfo.apiDataStates?.[dataKey]?.endpointId || "",
                httpStatus: details.httpStatus ?? null,
                apiCode: details.apiCode ?? null,
                errorKind: details.errorKind || "",
                message: details.message || "",
            },
        },
    });
}

function partitionFromVideoInfo(info) {
    if (!info?.videoPartitions && !info?.videoPartitionId) {
        return null;
    }

    const id = info.videoPartitionId ? String(info.videoPartitionId) : "";
    let name = info.videoPartitions || "";
    if (/^rid:\d+$/.test(name)) {
        name = "";
    }

    return { name, id };
}

function countPendingComments(videoInfoDict) {
    let count = 0;
    for (const videoBv in videoInfoDict) {
        if (!Object.prototype.hasOwnProperty.call(videoInfoDict[videoBv], "filteredComments")) {
            count++;
        }
    }
    return count;
}

function readTopCommentMessage(commentData) {
    return commentData?.top?.upper?.content?.message || commentData?.upper?.top?.content?.message || "";
}

function readApiCode(json) {
    if (!json || typeof json.code === "undefined") {
        return null;
    }

    return Number(json.code);
}

function readApiMessage(json) {
    return json?.message || json?.msg || "";
}

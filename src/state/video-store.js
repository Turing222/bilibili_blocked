// == 视频运行时状态 ==========================================================
//
// 职责：
// - 管理 videoInfoDict。
// - 管理 videoUpInfoDict。
// - 管理 lastConsoleVideoInfoDict。
// - 提供“标记命中屏蔽规则”的统一入口。
//
// 不负责：
// - 不直接 fetch。
// - 不直接操作 DOM。
// - 不直接读写 GM 存储。
//
// 原脚本迁移来源：
// - videoInfoDict
// - videoUpInfoDict
// - lastConsoleVideoInfoDict
// - markAsBlockedTarget()
// - handleBlockedXXX() 里对 videoInfoDict 的修改逻辑

import { consoleLogOutput, objectDifferent } from "../utils/log.js";
import { safeRegexTest } from "../utils/regex.js";

const FAV_COIN_RATIO_MIN_VIEWS = 5000;
const FAV_COIN_RATIO_MIN_FAVORITES = 50;
const FAV_COIN_RATIO_MIN_AGE_SECONDS = 7200;
// 视频卡片滚出视口后，缓存保留的宽限期：在此窗口内滚回视口可直接复用缓存，
// 避免重新拉 API + 重跑规则导致的 overlay 闪烁。超过宽限期才真正 prune。
const STALE_VIDEO_INFO_GRACE_MS = 60_000;

export function createVideoStore(onRuleHit) {
    const videoInfoDict = {};
    const videoUpInfoDict = {};
    let lastConsoleVideoInfoDict = {};

    return {
        videoInfoDict,
        videoUpInfoDict,

        mergeVideoInfo(videoBv, nextInfo) {
            const previous = videoInfoDict[videoBv];
            // 调用方一般不传 lastSeenAt，此时刷新为当前时间；若显式传入（如测试做时间旅行）则尊重之。
            const lastSeenAt = nextInfo && Object.prototype.hasOwnProperty.call(nextInfo, "lastSeenAt")
                ? nextInfo.lastSeenAt
                : Date.now();
            videoInfoDict[videoBv] = {
                ...previous,
                ...nextInfo,
                lastSeenAt,
            };
        },

        getVideoInfo(videoBv) {
            return videoInfoDict[videoBv];
        },

        getReviewBlockedReasons(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return [];
            }

            return collectReviewBlockedReasons(videoInfo, videoUpInfoDict[videoInfo.videoUpUid], settings);
        },

        getUpInfo(upUid) {
            return videoUpInfoDict[upUid];
        },

        mergeUpInfo(upUid, nextInfo) {
            videoUpInfoDict[upUid] = nextInfo;
        },

        getBlockStats() {
            let total = 0;
            let blocked = 0;
            for (const key in videoInfoDict) {
                total++;
                if (videoInfoDict[key].blockedTarget) {
                    blocked++;
                }
            }
            return { total, blocked, rate: total > 0 ? (blocked / total) : 0 };
        },

        logVideoInfoDictIfChanged(settings) {
            if (!settings.consoleOutputLog_Switch) {
                return;
            }

            if (objectDifferent(lastConsoleVideoInfoDict, videoInfoDict)) {
                consoleLogOutput(Object.keys(videoInfoDict).length, "个视频信息: ", videoInfoDict);
                lastConsoleVideoInfoDict = Object.assign({}, videoInfoDict);
            }
        },

        applyTitleAndUpRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyTitleRule(videoInfo, settings);
            applyUpRule(videoInfo, settings);
        },

        applyVideoStatsRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyShortDurationRule(videoInfo, settings);
            applyBelowVideoViewsRule(videoInfo, settings);
            applyBelowLikesRateRule(videoInfo, settings);
            applyBelowCoinRateRule(videoInfo, settings);
            applyAboveFavoriteCoinRatioRule(videoInfo, settings);
            applyPortraitVideoRule(videoInfo, settings);
            applyChargingExclusiveRule(videoInfo, settings);
            applyVideoPartitionsRule(videoInfo, settings);
        },

        applyTagRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyBlockedTagRule(videoInfo, settings);
            applyDoubleBlockedTagRule(videoInfo, settings);
        },

        applyUpProfileRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo?.videoUpUid) {
                return;
            }

            const upInfo = videoUpInfoDict[videoInfo.videoUpUid];
            if (!upInfo) {
                return;
            }

            applyBelowUpLevelRule(videoInfo, upInfo, settings);
            applyBelowUpFansRule(videoInfo, upInfo, settings);
            applyUpSignsRule(videoInfo, upInfo, settings);
        },

        applyCommentRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyFilteredCommentsRule(videoInfo, settings);
            applyTopCommentRule(videoInfo, settings);
        },

        applyWhitelistRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            const bvWhitelisted =
                settings.whitelistBv_Switch &&
                (settings.whitelistBv_Array || []).some((item) => item == videoBv);
            if (bvWhitelisted) {
                videoInfo.blockedTarget = false;
                return;
            }

            const upUidWhitelisted =
                settings.whitelistUpUid_Switch &&
                (settings.whitelistUpUid_Array || []).some((item) => item == videoInfo.videoUpUid);
            if (upUidWhitelisted) {
                videoInfo.blockedTarget = false;
                return;
            }

            if (settings.whitelistNameOrUid_Switch && videoInfo.videoUpUid) {
                const matched = (settings.whitelistNameOrUid_Array || []).find(
                    (item) => item == videoInfo.videoUpName || item == videoInfo.videoUpUid
                );

                if (matched) {
                    videoInfo.blockedTarget = false;
                }
            }
        },

        resetBlockEvaluation(videoBv) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            videoInfo.blockedTarget = false;
            videoInfo.triggeredBlockedRules = [];
            videoInfo.blockedReasons = [];
        },

        resetAllBlockEvaluations() {
            for (const videoBv in videoInfoDict) {
                const videoInfo = videoInfoDict[videoBv];
                if (!videoInfo) {
                    continue;
                }

                videoInfo.blockedTarget = false;
                videoInfo.triggeredBlockedRules = [];
                videoInfo.blockedReasons = [];
            }
        },

        pruneStaleVideoInfo({ keepBvs = new Set() } = {}) {
            const keepSet = keepBvs instanceof Set ? keepBvs : new Set(keepBvs);
            const now = Date.now();
            for (const videoBv in videoInfoDict) {
                if (keepSet.has(videoBv)) {
                    continue;
                }
                // 宽限期内的条目保留：滚出视口后短期内滚回可直接复用缓存，避免 overlay 闪烁。
                const lastSeenAt = videoInfoDict[videoBv]?.lastSeenAt;
                if (typeof lastSeenAt === "number" && now - lastSeenAt < STALE_VIDEO_INFO_GRACE_MS) {
                    continue;
                }
                delete videoInfoDict[videoBv];
            }
        },
    };

    function applyTitleRule(videoInfo, settings) {
        if (!settings.blockedTitle_Switch || settings.blockedTitle_Array.length === 0 || !videoInfo.videoTitle) {
            return;
        }

        const blockedTitleHitItem = findMatch(
            settings.blockedTitle_Array,
            videoInfo.videoTitle,
            settings.blockedTitle_UseRegular
        );

        if (blockedTitleHitItem) {
            markAsBlockedTarget(videoInfo, settings, "按标题屏蔽", blockedTitleHitItem, {
                configKey: "blockedTitle_Array",
                regularKey: "blockedTitle_UseRegular",
                configValue: blockedTitleHitItem,
                matchedValue: videoInfo.videoTitle,
            });
        }
    }

    function applyUpRule(videoInfo, settings) {
        applyUpUidRule(videoInfo, settings);
        applyUpNameKeywordRule(videoInfo, settings);
    }

    function applyUpUidRule(videoInfo, settings) {
        const blockedUpUidItems = settings.blockedUpUid_Array || [];
        if (!settings.blockedUpUid_Switch || blockedUpUidItems.length === 0 || !videoInfo.videoUpUid) {
            return;
        }

        const matchedUid = blockedUpUidItems.find((item) => item == videoInfo.videoUpUid);
        if (matchedUid) {
            markAsBlockedTarget(videoInfo, settings, "按UP主屏蔽", videoInfo.videoUpUid, {
                configKey: "blockedUpUid_Array",
                configValue: matchedUid,
                matchedValue: videoInfo.videoUpUid,
            });
        }
    }

    function applyUpNameKeywordRule(videoInfo, settings) {
        const keywordItems = settings.blockedUpNameKeyword_Array || [];
        if (!settings.blockedUpNameKeyword_Switch || keywordItems.length === 0 || !videoInfo.videoUpName) {
            return;
        }

        const matchedKeyword = findTextMatch(
            keywordItems,
            videoInfo.videoUpName,
            settings.blockedUpNameKeyword_UseRegular
        );
        if (matchedKeyword) {
            markAsBlockedTarget(videoInfo, settings, "按UP名称关键词屏蔽", matchedKeyword, {
                configKey: "blockedUpNameKeyword_Array",
                regularKey: "blockedUpNameKeyword_UseRegular",
                configValue: matchedKeyword,
                matchedValue: videoInfo.videoUpName,
            });
        }
    }

    function findMatch(patterns, value, useRegular) {
        if (useRegular) {
            return patterns.find((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.find((pattern) => pattern === value);
    }

    function findTextMatch(patterns, value, useRegular) {
        if (useRegular) {
            return patterns.find((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.find((pattern) => String(value).includes(String(pattern)));
    }

    function findMatchInArray(patterns, values, useRegular) {
        let matchedValue = "";
        const matchedPattern = patterns.find((pattern) => {
            const value = values.find((item) => {
                if (useRegular) {
                    return safeRegexTest(pattern, item);
                }

                return pattern == item;
            });

            if (value) {
                matchedValue = value;
                return true;
            }
        });

        return {
            matchedPattern,
            matchedValue,
        };
    }

    function findAllMatches(patterns = [], value, useRegular) {
        if (value === undefined || value === null) {
            return [];
        }

        if (useRegular) {
            return patterns.filter((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.filter((pattern) => pattern === value);
    }

    function findAllTextMatches(patterns = [], value, useRegular) {
        if (value === undefined || value === null) {
            return [];
        }

        if (useRegular) {
            return patterns.filter((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.filter((pattern) => String(value).includes(String(pattern)));
    }

    function findAllMatchesInArray(patterns = [], values = [], useRegular) {
        const matches = [];
        patterns.forEach((pattern) => {
            const matchedValue = values.find((item) => {
                if (useRegular) {
                    return safeRegexTest(pattern, item);
                }

                return pattern == item;
            });

            if (matchedValue) {
                matches.push({ matchedPattern: pattern, matchedValue });
            }
        });

        return matches;
    }

    function applyShortDurationRule(videoInfo, settings) {
        if (!settings.blockedShortDuration_Switch || settings.blockedShortDuration <= 0 || !videoInfo.videoDuration) {
            return;
        }

        if (settings.blockedShortDuration > videoInfo.videoDuration) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低时长", videoInfo.videoDuration + "秒");
        }
    }

    function applyBelowVideoViewsRule(videoInfo, settings) {
        if (
            !settings.blockedBelowVideoViews_Switch ||
            settings.blockedBelowVideoViews <= 0 ||
            videoInfo.videoView == null
        ) {
            return;
        }

        if (settings.blockedBelowVideoViews > videoInfo.videoView) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低播放量", videoInfo.videoView + "次");
        }
    }

    function applyBelowLikesRateRule(videoInfo, settings) {
        if (!settings.blockedBelowLikesRate_Switch || settings.blockedBelowLikesRate <= 0) {
            return;
        }

        // safeRatio 只在数据缺失/分母为 0 时返回 null；真实的 0% 点赞率必须能命中低点赞率规则。
        if (videoInfo.videoLikesRate == null) {
            return;
        }

        if (settings.blockedBelowLikesRate > videoInfo.videoLikesRate) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低点赞率", formatRatio(videoInfo.videoLikesRate) + "%");
        }
    }

    function applyBelowCoinRateRule(videoInfo, settings) {
        if (!settings.blockedBelowCoinRate_Switch || settings.blockedBelowCoinRate <= 0) {
            return;
        }

        if (videoInfo.videoCoinRate == null) {
            return;
        }

        if (settings.blockedBelowCoinRate > videoInfo.videoCoinRate) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低投币率", formatRatio(videoInfo.videoCoinRate) + "%");
        }
    }

    function applyAboveFavoriteCoinRatioRule(videoInfo, settings) {
        if (!settings.blockedAboveFavoriteCoinRatio_Switch || settings.blockedAboveFavoriteCoinRatio <= 0) {
            return;
        }

        if (videoInfo.videoView < FAV_COIN_RATIO_MIN_VIEWS || videoInfo.videoFavorite < FAV_COIN_RATIO_MIN_FAVORITES) {
            return;
        }

        const currentTimeInSeconds = Math.floor(Date.now() / 1000);
        if (currentTimeInSeconds - videoInfo.videoPubdate < FAV_COIN_RATIO_MIN_AGE_SECONDS) {
            return;
        }

        // safeRatio 在投币为 0 时返回 null；此时若有足够收藏，收藏/投币比趋近无穷，直接命中高比值规则。
        const ratio = videoInfo.videoFavoriteCoinRatio == null ? Number.POSITIVE_INFINITY : videoInfo.videoFavoriteCoinRatio;

        if (ratio > settings.blockedAboveFavoriteCoinRatio) {
            markAsBlockedTarget(
                videoInfo,
                settings,
                "屏蔽高收藏投币比",
                (Number.isFinite(ratio) ? formatRatio(ratio) : "∞") + "\nUP主: " + videoInfo.videoUpName
            );
        }
    }

    function applyPortraitVideoRule(videoInfo, settings) {
        if (!settings.blockedPortraitVideo_Switch || !videoInfo.videoResolution?.width) {
            return;
        }

        if (videoInfo.videoResolution.width < videoInfo.videoResolution.height) {
            markAsBlockedTarget(
                videoInfo,
                settings,
                "屏蔽竖屏视频",
                `${videoInfo.videoResolution.width} x ${videoInfo.videoResolution.height}`
            );
        }
    }

    function applyChargingExclusiveRule(videoInfo, settings) {
        if (settings.blockedChargingExclusive_Switch && videoInfo.videoChargingExclusive) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽充电专属视频", videoInfo.videoUpName);
        }
    }

    function applyVideoPartitionsRule(videoInfo, settings) {
        if (
            !settings.blockedVideoPartitions_Switch ||
            settings.blockedVideoPartitions_Array.length === 0 ||
            (!videoInfo.videoPartitions && !videoInfo.videoPartitionId)
        ) {
            return;
        }

        const partitionCandidates = [
            videoInfo.videoPartitions,
            videoInfo.videoPartitionId ? `rid:${videoInfo.videoPartitionId}` : "",
            videoInfo.videoPartitionId ? String(videoInfo.videoPartitionId) : "",
        ].filter(Boolean);

        const matchedPartition = findPartitionMatchInArray(
            settings.blockedVideoPartitions_Array,
            partitionCandidates,
            settings.blockedVideoPartitions_UseRegular
        );

        if (matchedPartition.matchedPattern) {
            markAsBlockedTarget(videoInfo, settings, "按视频分区屏蔽", videoInfo.videoPartitions || matchedPartition.matchedValue, {
                configKey: "blockedVideoPartitions_Array",
                regularKey: "blockedVideoPartitions_UseRegular",
                configValue: matchedPartition.matchedPattern,
                matchedValue: matchedPartition.matchedValue,
            });
        }
    }

    function findPartitionMatchInArray(patterns, values, useRegular) {
        let matchedValue = "";
        const matchedPattern = patterns.find((pattern) => {
            const candidates = getPartitionPatternCandidates(pattern);
            const value = values.find((item) => {
                if (useRegular) {
                    return candidates.some((candidate) => safeRegexTest(candidate, item));
                }

                return candidates.some((candidate) => candidate === item);
            });

            if (value) {
                matchedValue = value;
                return true;
            }
        });

        return {
            matchedPattern,
            matchedValue,
        };
    }

    function getPartitionPatternCandidates(pattern) {
        const value = String(pattern).trim();
        const ridMatch = value.match(/^(.*?)（rid:\s*(\d+)）$/);
        if (!ridMatch) {
            return [value];
        }

        const name = ridMatch[1].trim();
        const rid = ridMatch[2].trim();
        return [value, name, `rid:${rid}`, rid].filter(Boolean);
    }

    function applyBlockedTagRule(videoInfo, settings) {
        if (!settings.blockedTag_Switch || settings.blockedTag_Array.length === 0 || !videoInfo.videoTags) {
            return;
        }

        const { matchedPattern, matchedValue } = findMatchInArray(
            settings.blockedTag_Array,
            videoInfo.videoTags,
            settings.blockedTag_UseRegular
        );

        if (matchedPattern) {
            markAsBlockedTarget(videoInfo, settings, "按标签屏蔽", matchedValue, {
                configKey: "blockedTag_Array",
                regularKey: "blockedTag_UseRegular",
                configValue: matchedPattern,
                matchedValue,
            });
        }
    }

    function applyDoubleBlockedTagRule(videoInfo, settings) {
        if (!settings.doubleBlockedTag_Switch || settings.doubleBlockedTag_Array.length === 0 || !videoInfo.videoTags) {
            return;
        }

        let blockedRulesItemText = "";
        const matchedDoubleTag = settings.doubleBlockedTag_Array.find((doubleBlockedTag) => {
            const doubleBlockedTagSplitArray = doubleBlockedTag.split("|");

            const videoTagHitItem0 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[0], videoTagItem);
                }

                return doubleBlockedTagSplitArray[0] == videoTagItem;
            });

            const videoTagHitItem1 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[1], videoTagItem);
                }

                return doubleBlockedTagSplitArray[1] == videoTagItem;
            });

            if (videoTagHitItem0 && videoTagHitItem1) {
                blockedRulesItemText = `${videoTagHitItem0},${videoTagHitItem1}`;
                return true;
            }
        });

        if (matchedDoubleTag) {
            markAsBlockedTarget(videoInfo, settings, "按双重标签屏蔽", blockedRulesItemText, {
                configKey: "doubleBlockedTag_Array",
                regularKey: "doubleBlockedTag_UseRegular",
                configValue: matchedDoubleTag,
                matchedValue: blockedRulesItemText,
            });
        }
    }

    function applyBelowUpLevelRule(videoInfo, upInfo, settings) {
        if (
            !settings.blockedBelowUpLevel_Switch ||
            settings.blockedBelowUpLevel <= 0 ||
            upInfo.upLevel == null
        ) {
            return;
        }

        if (settings.blockedBelowUpLevel > upInfo.upLevel) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低UP主等级", upInfo.upLevel + "级");
        }
    }

    function applyBelowUpFansRule(videoInfo, upInfo, settings) {
        if (
            !settings.blockedBelowUpFans_Switch ||
            settings.blockedBelowUpFans <= 0 ||
            upInfo.upFans == null
        ) {
            return;
        }

        if (settings.blockedBelowUpFans > upInfo.upFans) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低UP主粉丝数");
        }
    }

    function applyUpSignsRule(videoInfo, upInfo, settings) {
        if (!settings.blockedUpSigns_Switch || settings.blockedUpSigns_Array.length === 0 || !upInfo.upSign) {
            return;
        }

        const matchedSign = findMatch(settings.blockedUpSigns_Array, upInfo.upSign, settings.blockedUpSigns_UseRegular);

        if (matchedSign) {
            markAsBlockedTarget(videoInfo, settings, "按UP主简介屏蔽", matchedSign, {
                configKey: "blockedUpSigns_Array",
                regularKey: "blockedUpSigns_UseRegular",
                configValue: matchedSign,
                matchedValue: upInfo.upSign,
            });
        }
    }

    // filteredComments 仅在评论 API 成功返回后写入；undefined 表示尚未拉取或请求失败，此时不屏蔽。
    function applyFilteredCommentsRule(videoInfo, settings) {
        if (settings.blockedFilteredCommentsVideo_Switch && videoInfo.filteredComments) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽精选评论的视频", videoInfo.videoUpName);
        }
    }

    function applyTopCommentRule(videoInfo, settings) {
        if (
            !settings.blockedTopComment_Switch ||
            settings.blockedTopComment_Array.length === 0 ||
            !videoInfo.topComment
        ) {
            return;
        }

        const matchedComment = findMatch(
            settings.blockedTopComment_Array,
            videoInfo.topComment,
            settings.blockedTopComment_UseRegular
        );

        if (matchedComment) {
            markAsBlockedTarget(videoInfo, settings, "按置顶评论屏蔽", matchedComment, {
                configKey: "blockedTopComment_Array",
                regularKey: "blockedTopComment_UseRegular",
                configValue: matchedComment,
                matchedValue: videoInfo.topComment,
            });
        }
    }

    function collectReviewBlockedReasons(videoInfo, upInfo, settings) {
        const reasons = [];

        for (const reason of videoInfo.blockedReasons || []) {
            pushUniqueReason(reasons, reason);
        }

        const addReason = (blockedType, blockedItem, metadata = {}) => {
            const hasBlockedItem = blockedItem !== undefined && blockedItem !== null && blockedItem !== "";
            const displayText = settings.hideBlockedRules_Switch || !hasBlockedItem
                ? blockedType
                : blockedType + ": " + blockedItem;
            pushUniqueReason(reasons, createBlockedReason(blockedType, blockedItem, displayText, metadata));
        };

        collectTitleReviewReasons(videoInfo, settings, addReason);
        collectUpReviewReasons(videoInfo, settings, addReason);
        collectVideoPartitionReviewReasons(videoInfo, settings, addReason);
        collectTagReviewReasons(videoInfo, settings, addReason);
        collectUpProfileReviewReasons(upInfo, settings, addReason);
        collectCommentReviewReasons(videoInfo, settings, addReason);

        return reasons;
    }

    function pushUniqueReason(reasons, reason) {
        if (!reason || reasons.some((item) => item.id === reason.id)) {
            return;
        }

        reasons.push(reason);
    }

    function collectTitleReviewReasons(videoInfo, settings, addReason) {
        if (!settings.blockedTitle_Switch || settings.blockedTitle_Array.length === 0 || !videoInfo.videoTitle) {
            return;
        }

        findAllMatches(settings.blockedTitle_Array, videoInfo.videoTitle, settings.blockedTitle_UseRegular)
            .forEach((matchedTitle) => {
                addReason("按标题屏蔽", matchedTitle, {
                    configKey: "blockedTitle_Array",
                    regularKey: "blockedTitle_UseRegular",
                    configValue: matchedTitle,
                    matchedValue: videoInfo.videoTitle,
                });
            });
    }

    function collectUpReviewReasons(videoInfo, settings, addReason) {
        if (settings.blockedUpUid_Switch && videoInfo.videoUpUid) {
            (settings.blockedUpUid_Array || [])
                .filter((item) => item == videoInfo.videoUpUid)
                .forEach((matchedUid) => {
                    addReason("按UP主屏蔽", videoInfo.videoUpUid, {
                        configKey: "blockedUpUid_Array",
                        configValue: matchedUid,
                        matchedValue: videoInfo.videoUpUid,
                    });
                });
        }

        if (!settings.blockedUpNameKeyword_Switch || !videoInfo.videoUpName) {
            return;
        }

        findAllTextMatches(
            settings.blockedUpNameKeyword_Array,
            videoInfo.videoUpName,
            settings.blockedUpNameKeyword_UseRegular
        ).forEach((matchedKeyword) => {
            addReason("按UP名称关键词屏蔽", matchedKeyword, {
                configKey: "blockedUpNameKeyword_Array",
                regularKey: "blockedUpNameKeyword_UseRegular",
                configValue: matchedKeyword,
                matchedValue: videoInfo.videoUpName,
            });
        });
    }

    function collectVideoPartitionReviewReasons(videoInfo, settings, addReason) {
        if (
            !settings.blockedVideoPartitions_Switch ||
            settings.blockedVideoPartitions_Array.length === 0 ||
            (!videoInfo.videoPartitions && !videoInfo.videoPartitionId)
        ) {
            return;
        }

        const partitionCandidates = [
            videoInfo.videoPartitions,
            videoInfo.videoPartitionId ? `rid:${videoInfo.videoPartitionId}` : "",
            videoInfo.videoPartitionId ? String(videoInfo.videoPartitionId) : "",
        ].filter(Boolean);

        findAllPartitionMatchesInArray(
            settings.blockedVideoPartitions_Array,
            partitionCandidates,
            settings.blockedVideoPartitions_UseRegular
        ).forEach(({ matchedPattern, matchedValue }) => {
            addReason("按视频分区屏蔽", videoInfo.videoPartitions || matchedValue, {
                configKey: "blockedVideoPartitions_Array",
                regularKey: "blockedVideoPartitions_UseRegular",
                configValue: matchedPattern,
                matchedValue,
            });
        });
    }

    function collectTagReviewReasons(videoInfo, settings, addReason) {
        if (!videoInfo.videoTags) {
            return;
        }

        if (settings.blockedTag_Switch && settings.blockedTag_Array.length > 0) {
            findAllMatchesInArray(
                settings.blockedTag_Array,
                videoInfo.videoTags,
                settings.blockedTag_UseRegular
            ).forEach(({ matchedPattern, matchedValue }) => {
                addReason("按标签屏蔽", matchedValue, {
                    configKey: "blockedTag_Array",
                    regularKey: "blockedTag_UseRegular",
                    configValue: matchedPattern,
                    matchedValue,
                });
            });
        }

        if (!settings.doubleBlockedTag_Switch || settings.doubleBlockedTag_Array.length === 0) {
            return;
        }

        settings.doubleBlockedTag_Array.forEach((doubleBlockedTag) => {
            const doubleBlockedTagSplitArray = String(doubleBlockedTag).split("|");
            if (doubleBlockedTagSplitArray.length < 2) {
                return;
            }

            const videoTagHitItem0 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[0], videoTagItem);
                }

                return doubleBlockedTagSplitArray[0] == videoTagItem;
            });

            const videoTagHitItem1 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[1], videoTagItem);
                }

                return doubleBlockedTagSplitArray[1] == videoTagItem;
            });

            if (videoTagHitItem0 && videoTagHitItem1) {
                const matchedValue = `${videoTagHitItem0},${videoTagHitItem1}`;
                addReason("按双重标签屏蔽", matchedValue, {
                    configKey: "doubleBlockedTag_Array",
                    regularKey: "doubleBlockedTag_UseRegular",
                    configValue: doubleBlockedTag,
                    matchedValue,
                });
            }
        });
    }

    function collectUpProfileReviewReasons(upInfo, settings, addReason) {
        if (!upInfo || !settings.blockedUpSigns_Switch || settings.blockedUpSigns_Array.length === 0 || !upInfo.upSign) {
            return;
        }

        findAllMatches(settings.blockedUpSigns_Array, upInfo.upSign, settings.blockedUpSigns_UseRegular)
            .forEach((matchedSign) => {
                addReason("按UP主简介屏蔽", matchedSign, {
                    configKey: "blockedUpSigns_Array",
                    regularKey: "blockedUpSigns_UseRegular",
                    configValue: matchedSign,
                    matchedValue: upInfo.upSign,
                });
            });
    }

    function collectCommentReviewReasons(videoInfo, settings, addReason) {
        if (!settings.blockedTopComment_Switch || settings.blockedTopComment_Array.length === 0 || !videoInfo.topComment) {
            return;
        }

        findAllMatches(settings.blockedTopComment_Array, videoInfo.topComment, settings.blockedTopComment_UseRegular)
            .forEach((matchedComment) => {
                addReason("按置顶评论屏蔽", matchedComment, {
                    configKey: "blockedTopComment_Array",
                    regularKey: "blockedTopComment_UseRegular",
                    configValue: matchedComment,
                    matchedValue: videoInfo.topComment,
                });
            });
    }

    function findAllPartitionMatchesInArray(patterns = [], values = [], useRegular) {
        const matches = [];
        patterns.forEach((pattern) => {
            const candidates = getPartitionPatternCandidates(pattern);
            const matchedValue = values.find((item) => {
                if (useRegular) {
                    return candidates.some((candidate) => safeRegexTest(candidate, item));
                }

                return candidates.some((candidate) => candidate === item);
            });

            if (matchedValue) {
                matches.push({ matchedPattern: pattern, matchedValue });
            }
        });

        return matches;
    }

    function markAsBlockedTarget(videoInfo, settings, blockedType, blockedItem, metadata = {}) {
        videoInfo.blockedTarget = true;

        if (!videoInfo.triggeredBlockedRules) {
            videoInfo.triggeredBlockedRules = [];
        }

        if (!videoInfo.blockedReasons) {
            videoInfo.blockedReasons = [];
        }

        const hasBlockedItem = blockedItem !== undefined && blockedItem !== null && blockedItem !== "";
        const blockedRulesItem = settings.blockedOverlayOnlyDisplaysType_Switch || !hasBlockedItem
            ? blockedType
            : blockedType + ": " + blockedItem;

        if (!videoInfo.triggeredBlockedRules.includes(blockedRulesItem)) {
            videoInfo.triggeredBlockedRules.push(blockedRulesItem);
        }

        const blockedReason = createBlockedReason(blockedType, blockedItem, blockedRulesItem, metadata);
        if (!videoInfo.blockedReasons.some((reason) => reason.id === blockedReason.id)) {
            videoInfo.blockedReasons.push(blockedReason);
        }

        if (!videoInfo._recordedStatRules) {
            videoInfo._recordedStatRules = new Set();
        }

        if (!videoInfo._recordedStatRules.has(blockedRulesItem)) {
            videoInfo._recordedStatRules.add(blockedRulesItem);
            onRuleHit?.(hasBlockedItem ? `${blockedType}: ${blockedItem}` : blockedType);
        }
    }

    function createBlockedReason(blockedType, blockedItem, displayText, metadata) {
        const configKey = normalizeReasonValue(metadata.configKey);
        const configValue = normalizeReasonValue(metadata.configValue);
        const matchedValue = normalizeReasonValue(metadata.matchedValue ?? blockedItem);

        return {
            id: [blockedType, configKey, configValue, matchedValue, displayText].join("\u0001"),
            type: blockedType,
            item: normalizeReasonValue(blockedItem),
            displayText,
            configKey,
            regularKey: normalizeReasonValue(metadata.regularKey),
            configValue,
            matchedValue,
            canRemoveConfig: Boolean(configKey && configValue),
        };
    }

    function normalizeReasonValue(value) {
        return value === undefined || value === null ? "" : String(value);
    }

    function formatRatio(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return "";
        }
        return number.toFixed(2);
    }
}

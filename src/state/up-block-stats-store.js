const upBlockStatsStorageKey = "GM_blockedUpStats";
const upBlockStatsStorageVersion = 2;

export function createUpBlockStatsStore() {
    const normalized = normalizeData(typeof GM_getValue === "function" ? GM_getValue(upBlockStatsStorageKey, null) : null);
    const data = normalized.data;
    const sessionCountedVideoKeys = new Set();

    if (normalized.shouldPersist) {
        persist(data);
    }

    return {
        recordBlockedVideo(videoBv, videoInfo) {
            const normalizedVideoBv = normalizeUpBlockStatsText(videoBv || videoInfo?.videoBv);
            const upUid = normalizeUpBlockStatsText(videoInfo?.videoUpUid);

            if (!normalizedVideoBv || !upUid) {
                return false;
            }

            const countedKey = `${normalizedVideoBv}:${upUid}`;
            if (sessionCountedVideoKeys.has(countedKey)) {
                return false;
            }

            const now = Date.now();
            const previous = data.ups[upUid] || {
                upUid,
                upName: "",
                blockedCount: 0,
                lastReason: "",
                lastVideoTitle: "",
                lastVideoBv: "",
                updatedAt: 0,
            };

            sessionCountedVideoKeys.add(countedKey);
            data.ups[upUid] = {
                ...previous,
                upUid,
                upName: normalizeUpBlockStatsText(videoInfo?.videoUpName) || previous.upName,
                blockedCount: normalizeCount(previous.blockedCount) + 1,
                lastReason: getLatestReason(videoInfo),
                lastVideoTitle: normalizeUpBlockStatsText(videoInfo?.videoTitle),
                lastVideoBv: normalizedVideoBv,
                updatedAt: now,
            };

            persist(data);
            return true;
        },

        getSuggestions(minBlockedCount = 5) {
            return Object.values(data.ups)
                .filter((item) => normalizeCount(item.blockedCount) >= minBlockedCount)
                .sort((a, b) =>
                    normalizeCount(b.blockedCount) - normalizeCount(a.blockedCount) ||
                    normalizeCount(b.updatedAt) - normalizeCount(a.updatedAt)
                )
                .map((item) => ({ ...item }));
        },
    };
}

function normalizeData(rawData) {
    const source = rawData && typeof rawData === "object" ? rawData : {};
    const hadStoredObject = rawData && typeof rawData === "object";
    const rawUps = source.ups && typeof source.ups === "object" ? source.ups : {};
    const legacyCountsByUp = countLegacyVideoKeysByUp(source.countedVideoKeys);

    const ups = Object.fromEntries(
        Object.entries(rawUps)
            .filter(([upUid, item]) => upUid && item && typeof item === "object")
            .map(([upUid, item]) => [
                upUid,
                {
                    upUid: normalizeUpBlockStatsText(item.upUid) || upUid,
                    upName: normalizeUpBlockStatsText(item.upName),
                    blockedCount: hasValidCount(item.blockedCount)
                        ? normalizeCount(item.blockedCount)
                        : normalizeCount(legacyCountsByUp[upUid]),
                    lastReason: normalizeUpBlockStatsText(item.lastReason),
                    lastVideoTitle: normalizeUpBlockStatsText(item.lastVideoTitle),
                    lastVideoBv: normalizeUpBlockStatsText(item.lastVideoBv),
                    updatedAt: normalizeCount(item.updatedAt),
                },
            ])
    );

    for (const [upUid, blockedCount] of Object.entries(legacyCountsByUp)) {
        if (!ups[upUid]) {
            ups[upUid] = {
                upUid,
                upName: "",
                blockedCount: normalizeCount(blockedCount),
                lastReason: "",
                lastVideoTitle: "",
                lastVideoBv: "",
                updatedAt: 0,
            };
        }
    }

    return {
        data: { version: upBlockStatsStorageVersion, ups },
        shouldPersist: hadStoredObject && shouldRewriteStoredData(source),
    };
}

function shouldRewriteStoredData(source) {
    if (source.version !== upBlockStatsStorageVersion) {
        return true;
    }

    return Object.keys(source).some((key) => key !== "version" && key !== "ups");
}

function countLegacyVideoKeysByUp(rawCountedVideoKeys) {
    if (!rawCountedVideoKeys || typeof rawCountedVideoKeys !== "object") {
        return {};
    }

    const countsByUp = {};
    for (const [key, value] of Object.entries(rawCountedVideoKeys)) {
        if (!key) {
            continue;
        }

        const upUid = value && typeof value === "object"
            ? normalizeUpBlockStatsText(value.upUid) || parseUpUidFromKey(key)
            : parseUpUidFromKey(key);
        if (upUid) {
            countsByUp[upUid] = (countsByUp[upUid] || 0) + 1;
        }
    }

    return countsByUp;
}

function parseUpUidFromKey(key) {
    const sep = key.lastIndexOf(":");
    return sep >= 0 ? key.slice(sep + 1) : "";
}

function getLatestReason(videoInfo) {
    const rules = Array.isArray(videoInfo?.triggeredBlockedRules) ? videoInfo.triggeredBlockedRules : [];
    return normalizeUpBlockStatsText(rules[0]);
}

function persist(data) {
    if (typeof GM_setValue === "function") {
        GM_setValue(upBlockStatsStorageKey, {
            version: upBlockStatsStorageVersion,
            ups: data.ups,
        });
    }
}

function normalizeUpBlockStatsText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function hasValidCount(value) {
    return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

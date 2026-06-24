const upBlockStatsStorageKey = "GM_blockedUpStats";

export function createUpBlockStatsStore() {
    const data = normalizeData(typeof GM_getValue === "function" ? GM_getValue(upBlockStatsStorageKey, null) : null);

    return {
        recordBlockedVideo(videoBv, videoInfo) {
            const normalizedVideoBv = normalizeUpBlockStatsText(videoBv || videoInfo?.videoBv);
            const upUid = normalizeUpBlockStatsText(videoInfo?.videoUpUid);

            if (!normalizedVideoBv || !upUid) {
                return false;
            }

            const countedKey = `${normalizedVideoBv}:${upUid}`;
            if (data.countedVideoKeys[countedKey]) {
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

            data.countedVideoKeys[countedKey] = true;
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
    const rawUps = source.ups && typeof source.ups === "object" ? source.ups : {};
    const rawCountedVideoKeys =
        source.countedVideoKeys && typeof source.countedVideoKeys === "object"
            ? source.countedVideoKeys
            : {};

    return {
        ups: Object.fromEntries(
            Object.entries(rawUps)
                .filter(([upUid, item]) => upUid && item && typeof item === "object")
                .map(([upUid, item]) => [
                    upUid,
                    {
                        upUid: normalizeUpBlockStatsText(item.upUid) || upUid,
                        upName: normalizeUpBlockStatsText(item.upName),
                        blockedCount: normalizeCount(item.blockedCount),
                        lastReason: normalizeUpBlockStatsText(item.lastReason),
                        lastVideoTitle: normalizeUpBlockStatsText(item.lastVideoTitle),
                        lastVideoBv: normalizeUpBlockStatsText(item.lastVideoBv),
                        updatedAt: normalizeCount(item.updatedAt),
                    },
                ])
        ),
        countedVideoKeys: { ...rawCountedVideoKeys },
    };
}

function getLatestReason(videoInfo) {
    const rules = Array.isArray(videoInfo?.triggeredBlockedRules) ? videoInfo.triggeredBlockedRules : [];
    return normalizeUpBlockStatsText(rules[0]);
}

function persist(data) {
    if (typeof GM_setValue === "function") {
        GM_setValue(upBlockStatsStorageKey, data);
    }
}

function normalizeUpBlockStatsText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

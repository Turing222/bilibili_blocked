const upBlockStatsStorageKey = "GM_blockedUpStats";
const MAX_COUNTED_VIDEO_KEYS = 2000;

function pruneCountedVideoKeys(countedVideoKeys, ups) {
    const keys = Object.keys(countedVideoKeys);
    if (keys.length <= MAX_COUNTED_VIDEO_KEYS) {
        return;
    }

    const dropCount = keys.length - MAX_COUNTED_VIDEO_KEYS;
    for (let i = 0; i < dropCount; i++) {
        const key = keys[i];
        const entry = countedVideoKeys[key];
        delete countedVideoKeys[key];

        // 淘汰去重记录时同步回扣对应 UP 的计数，保证 blockedCount 始终等于
        // 当前在册（未淘汰）的不同屏蔽视频数，避免被淘汰的 key 复活后重复累加。
        const upUid = entry && typeof entry === "object" ? normalizeUpBlockStatsText(entry.upUid) : "";
        if (upUid && ups[upUid]) {
            const next = normalizeCount(ups[upUid].blockedCount) - 1;
            ups[upUid] = { ...ups[upUid], blockedCount: Math.max(0, next) };
        }
    }
}

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

            data.countedVideoKeys[countedKey] = { upUid };
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
            // 先计数再 prune：prune 回扣作用于已更新的 ups 状态，避免同 UP 旧 key 淘汰时
            // 把本次 +1 覆盖掉。
            pruneCountedVideoKeys(data.countedVideoKeys, data.ups);

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

    // 兼容旧版 countedVideoKeys[value=true]：key 形如 "bv:upUid"，解析出 upUid 以便 prune 回扣。
    const countedVideoKeys = {};
    for (const [key, value] of Object.entries(rawCountedVideoKeys)) {
        if (!key) {
            continue;
        }
        const upUid = value && typeof value === "object" ? normalizeUpBlockStatsText(value.upUid) : "";
        countedVideoKeys[key] = { upUid: upUid || parseUpUidFromKey(key) };
    }

    const ups = Object.fromEntries(
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
    );

    // 以"当前在册的、属于该 UP 的不同视频数"重算 blockedCount，
    // 顺带修复历史数据因旧版 prune 漏回扣造成的计数虚高。
    const countsByUp = {};
    for (const entry of Object.values(countedVideoKeys)) {
        const upUid = normalizeUpBlockStatsText(entry?.upUid);
        if (upUid) {
            countsByUp[upUid] = (countsByUp[upUid] || 0) + 1;
        }
    }
    for (const [upUid, item] of Object.entries(ups)) {
        item.blockedCount = countsByUp[upUid] != null ? countsByUp[upUid] : 0;
    }

    const result = { ups, countedVideoKeys };
    pruneCountedVideoKeys(result.countedVideoKeys, result.ups);
    return result;
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

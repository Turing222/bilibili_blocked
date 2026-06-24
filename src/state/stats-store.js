const statsStorageKey = "GM_blockedStats";

export function createStatsStore() {
    const data = typeof GM_getValue === "function" ? (GM_getValue(statsStorageKey, null) || {}) : {};

    return {
        increment(ruleKey) {
            data[ruleKey] = (data[ruleKey] || 0) + 1;
            if (typeof GM_setValue === "function") {
                GM_setValue(statsStorageKey, data);
            }
        },
        getData() {
            return { ...data };
        },
        clear() {
            Object.keys(data).forEach((k) => delete data[k]);
            if (typeof GM_setValue === "function") {
                GM_setValue(statsStorageKey, {});
            }
        },
    };
}

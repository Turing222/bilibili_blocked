// == 白名单覆盖功能 ==========================================================
//
// 职责：
// - 在所有屏蔽规则执行之后，检查 BV、UP UID 白名单。
// - 命中白名单时清除 blockedTarget，让 renderer 取消隐藏或叠加层。
//
// 为什么放最后：
// - 原脚本逻辑是“先判黑，再判白”。
// - 白名单不是普通屏蔽规则，而是对屏蔽结果的覆盖。
//
// 原脚本迁移来源：
// - handleWhitelistNameOrUid()

export const whitelistFeature = {
    name: "whitelist",
    enabled: ({ settings }) =>
        (settings.whitelistUpUid_Switch && (settings.whitelistUpUid_Array || []).length > 0) ||
        (settings.whitelistNameOrUid_Switch && (settings.whitelistNameOrUid_Array || []).length > 0) ||
        (settings.whitelistBv_Switch && settings.whitelistBv_Array?.length > 0),
    run: ({ videoBv, settings, videoStore }) => {
        videoStore.applyWhitelistRules(videoBv, settings);
    },
};

// == 默认配置 ================================================================
//
// 职责：
// - 保存完整的默认配置结构。
// - 作为菜单 UI、导入导出、GM 存储的统一字段来源。
//
// 后续迁移：
// - 从原脚本顶部的 GM_getValue 默认对象迁移到这里。
//
// 注意：
// - 不在这里读写 GM_* API。
// - 不在这里做旧配置兼容。

export const defaultSettings = {
    uiFeatureSwitchVersion: 1,
    scriptEnabled_Switch: true,

    blockedTitle_Switch: true,
    blockedTitle_UseRegular: true,
    blockedTitle_Array: [],

    blockedUpUid_Switch: true,
    blockedUpUid_Array: [],

    blockedUpNameKeyword_Switch: true,
    blockedUpNameKeyword_UseRegular: false,
    blockedUpNameKeyword_Array: [],

    blockedVideoPartitions_Switch: true,
    blockedVideoPartitions_UseRegular: false,
    blockedVideoPartitions_Array: [],

    blockedTag_Switch: true,
    blockedTag_UseRegular: true,
    blockedTag_Array: [],

    doubleBlockedTag_Switch: true,
    doubleBlockedTag_UseRegular: true,
    doubleBlockedTag_Array: [],

    blockedShortDuration_Switch: false,
    blockedShortDuration: 0,

    blockedBelowVideoViews_Switch: false,
    blockedBelowVideoViews: 0,

    blockedBelowLikesRate_Switch: false,
    blockedBelowLikesRate: 0,

    blockedBelowCoinRate_Switch: false,
    blockedBelowCoinRate: 0,

    blockedAboveFavoriteCoinRatio_Switch: false,
    blockedAboveFavoriteCoinRatio: 10,

    blockedPortraitVideo_Switch: false,
    blockedChargingExclusive_Switch: false,
    blockedFilteredCommentsVideo_Switch: false,

    blockedTopComment_Switch: false,
    blockedTopComment_UseRegular: true,
    blockedTopComment_Array: [],

    blockedCommentText_Switch: true,
    blockedCommentText_UseRegular: false,
    blockedCommentText_Array: [],
    blockedCommentUser_Switch: true,
    blockedCommentUser_Array: [],
    blockedCommentImage_Switch: false,

    blockedBelowUpLevel_Switch: false,
    blockedBelowUpLevel: 0,

    blockedBelowUpFans_Switch: false,
    blockedBelowUpFans: 0,

    blockedUpSigns_Switch: false,
    blockedUpSigns_UseRegular: true,
    blockedUpSigns_Array: [],

    whitelistUpUid_Switch: false,
    whitelistUpUid_Array: [],
    whitelistBv_Switch: false,
    whitelistBv_Array: [],

    hideTrending_Switch: false,
    blockedTrendingItemByTitleTag_Switch: false,
    blockedTrendingItem_Switch: false,
    blockedTrendingItem_UseRegular: true,
    blockedTrendingItem_Array: [],

    hideNonVideoElements_Switch: true,
    floatingEntryVisible_Switch: true,
    blockedOverlayOnlyDisplaysType_Switch: false,
    hideVideoMode_Switch: false,
    consoleOutputLog_Switch: false,
    hideBlockedWordsInMenu_Switch: false,
    accumulateBlockedRules_Switch: false,

    // none | shift | ctrl | alt — 精准匹配对应右键组合时打开脚本菜单
    contextMenuScriptModifier: "none",
};

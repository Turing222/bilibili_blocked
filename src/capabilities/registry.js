// == 能力边界元信息 ==========================================================
//
// 职责：
// - 维护功能的数据来源、风险等级、关联设置和 API 端点。
// - 给设置 UI、调试输出、文档生成提供同一份结构化来源。

export const DATA_SOURCE = {
    DOM: "dom",
    API: "api",
    MIXED: "mixed",
    LOCAL: "local",
};

export const RISK_LEVEL = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
};

export const CAPABILITY_IDS = {
    TITLE_UP_DOM: "title-up-dom",
    TRENDING_DOM: "trending-dom",
    COMMENT_DOM: "comment-dom",
    PAGE_CLEANUP: "page-cleanup",
    LOCAL_TOOLS: "local-tools",
    VIDEO_VIEW_API: "video-view-api",
    VIDEO_TAGS_API: "video-tags-api",
    VIDEO_REGION_FALLBACK_API: "video-region-fallback-api",
    UP_PROFILE_API: "up-profile-api",
    COMMENT_API: "comment-api",
};

export const API_ENDPOINT_IDS = {
    VIDEO_VIEW: "video-view",
    VIDEO_TAGS: "video-tags",
    REGION_NAME: "region-name",
    UP_CARD: "up-card",
    COMMENT_MAIN: "comment-main",
    COMMENT_LEGACY: "comment-legacy",
};

export const capabilities = [
    {
        id: CAPABILITY_IDS.TITLE_UP_DOM,
        label: "标题 / UP 屏蔽",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "blockedTitle_Switch",
            "blockedUpUid_Switch",
            "blockedUpNameKeyword_Switch",
        ],
        failurePolicy: "DOM 选择器失效时该能力不判定，不影响其他规则。",
    },
    {
        id: CAPABILITY_IDS.TRENDING_DOM,
        label: "热搜屏蔽",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "hideTrending_Switch",
            "blockedTrendingItemByTitleTag_Switch",
            "blockedTrendingItem_Switch",
        ],
        failurePolicy: "DOM 选择器失效时该能力不判定，不影响视频卡片规则。",
    },
    {
        id: CAPABILITY_IDS.COMMENT_DOM,
        label: "已渲染评论屏蔽",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "blockedCommentText_Switch",
            "blockedCommentUser_Switch",
            "blockedCommentImage_Switch",
            "hideCommentMode_Switch",
        ],
        failurePolicy: "只读取页面已渲染评论，不主动请求评论 API。",
    },
    {
        id: CAPABILITY_IDS.PAGE_CLEANUP,
        label: "页面清理",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "hideNonVideoElements_Switch",
        ],
        failurePolicy: "DOM 选择器失效时只影响对应页面元素隐藏。",
    },
    {
        id: CAPABILITY_IDS.LOCAL_TOOLS,
        label: "叠加层 / 导入导出",
        dataSource: DATA_SOURCE.LOCAL,
        risk: RISK_LEVEL.LOW,
        settings: [
            "blockedOverlayOnlyDisplaysType_Switch",
            "hideVideoMode_Switch",
        ],
        failurePolicy: "不依赖外部数据源。",
    },
    {
        id: CAPABILITY_IDS.VIDEO_VIEW_API,
        label: "视频基础 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedVideoPartitions_Switch",
            "blockedShortDuration_Switch",
            "blockedBelowVideoViews_Switch",
            "blockedBelowLikesRate_Switch",
            "blockedBelowCoinRate_Switch",
            "blockedAboveFavoriteCoinRatio_Switch",
            "blockedPortraitVideo_Switch",
            "blockedChargingExclusive_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.VIDEO_VIEW,
        ],
        failurePolicy: "API 不可用时相关规则未判定，并继续执行后续能力。",
    },
    {
        id: CAPABILITY_IDS.VIDEO_TAGS_API,
        label: "标签 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedTag_Switch",
            "doubleBlockedTag_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.VIDEO_TAGS,
        ],
        failurePolicy: "API 不可用时标签规则未判定，并继续执行后续能力。",
    },
    {
        id: CAPABILITY_IDS.VIDEO_REGION_FALLBACK_API,
        label: "分区名称补全 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedVideoPartitions_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.REGION_NAME,
        ],
        failurePolicy: "补全失败时保留 rid 作为可见降级值。",
    },
    {
        id: CAPABILITY_IDS.UP_PROFILE_API,
        label: "UP 资料 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedBelowUpLevel_Switch",
            "blockedBelowUpFans_Switch",
            "blockedUpSigns_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.UP_CARD,
        ],
        failurePolicy: "API 不可用时 UP 资料规则未判定，并继续执行后续能力。",
    },
    {
        id: CAPABILITY_IDS.COMMENT_API,
        label: "评论 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.HIGH,
        settings: [
            "blockedFilteredCommentsVideo_Switch",
            "blockedTopComment_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.COMMENT_MAIN,
            API_ENDPOINT_IDS.COMMENT_LEGACY,
        ],
        failurePolicy: "API 不可用时评论相关视频规则未判定，并继续执行后续能力。",
    },
];

export function listCapabilities() {
    return capabilities.map((capability) => ({ ...capability }));
}

export function getCapability(capabilityId) {
    return capabilities.find((capability) => capability.id === capabilityId) || null;
}

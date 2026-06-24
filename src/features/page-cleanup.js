// == 页面清理功能组 ==========================================================
//
// 职责：
// - 隐藏首页、搜索页、播放页里的非视频元素。
// - 处理广告、直播推广、课堂等不属于视频屏蔽规则的内容。
//
// 不负责：
// - 不处理具体视频卡片是否命中屏蔽。
// - 不处理热搜项。
//
// 原脚本迁移来源：
// - hideNonVideoElements()

export const pageCleanupFeature = {
    name: "page-cleanup",
    enabled: ({ settings }) => settings.hideNonVideoElements_Switch,
    run: ({ domAdapter }) => {
        domAdapter.hideNonVideoElements();
    },
};


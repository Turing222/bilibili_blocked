// == 热搜功能组 ==============================================================
//
// 职责：
// - 隐藏整个热搜模块。
// - 按关键词、标题规则或标签规则屏蔽热搜项。
//
// 不负责：
// - 不处理普通视频卡片。
// - 不读取视频 API。
//
// 原脚本迁移来源：
// - getTrendingItemElements()
// - handleBlockedTrendingItemElements()
// - addTrendingItemHiddenOrOverlay()

export const trendingFeature = {
    name: "trending",
    enabled: ({ settings }) =>
        settings.hideTrending_Switch ||
        settings.blockedTrendingItem_Switch ||
        settings.blockedTrendingItemByTitleTag_Switch,
    run: ({ settings, domAdapter, renderer, statsStore }) => {
        domAdapter.hideTrendingModule(settings);
        const trendingItems = domAdapter.getTrendingItemElements();
        renderer.renderTrendingItems(trendingItems, settings, statsStore);
    },
};

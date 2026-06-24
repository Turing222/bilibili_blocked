// == 运行上下文 ==============================================================
//
// 这个文件负责把“全局变量”收拢成一个明确的 context。
//
// 原脚本里比较分散的全局状态包括：
// - blockedParameter
// - videoInfoDict
// - videoUpInfoDict
// - lastConsoleVideoInfoDict
// - API 请求节流状态
//
// 后续迁移时，优先把这些状态挂到 context 下面，而不是继续新增全局变量。

export function createRuntimeContext(parts) {
    return {
        settingsStore: parts.settingsStore,
        statsStore: parts.statsStore,
        upBlockStatsStore: parts.upBlockStatsStore,
        videoStore: parts.videoStore,
        apiClient: parts.apiClient,
        domAdapter: parts.domAdapter,
        renderer: parts.renderer,
        cardActions: parts.cardActions,
        features: parts.features,
        hooks: parts.hooks || {},
        refresh: parts.refresh || (() => {}),
        rerunVideoCard: parts.rerunVideoCard || (() => {}),
    };
}

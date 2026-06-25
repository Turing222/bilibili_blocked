// == 新版入口文件 ============================================================
//
// 这个文件只负责“把系统接起来”，不放具体业务规则。
//
// 允许放在这里的内容：
// - 导入配置、状态、平台适配器、功能注册表和 pipeline。
// - 创建运行上下文 runtimeContext。
// - 注册油猴菜单。
// - 绑定 load / resize / mutation 这类页面生命周期。
//
// 不放在这里的内容：
// - 不写“按标题屏蔽”“按标签屏蔽”等具体规则。
// - 不写 B 站 API fetch 细节。
// - 不写 DOM 选择器细节。
// - 不写叠加层样式和隐藏逻辑。

import { runPipeline, runVideoCardPipeline, isPipelineRunning, clearScriptEffects } from "./orchestration/pipeline.js";
import { createRuntimeContext } from "./runtime/context.js";
import { createFeatureRegistry } from "./features/index.js";
import { createSettingsStore } from "./settings/storage.js";
import { createStatsStore } from "./state/stats-store.js";
import { createUpBlockStatsStore } from "./state/up-block-stats-store.js";
import { createVideoStore } from "./state/video-store.js";
import { createBilibiliApiClient } from "./platform/api-client.js";
import { createBilibiliDomAdapter } from "./platform/dom-adapter.js";
import { createBlockedRenderer } from "./platform/renderer.js";
import { createCardActions } from "./platform/card-actions.js";
import { registerUserscriptMenu } from "./platform/userscript-menu.js";
import { startPageObservers } from "./platform/page-observers.js";
import { mountFloatingEntry } from "./ui/floating-entry.js";

import { showHoverReviewPanel, hideHoverReviewPanel } from "./actions/review-panel.js";
import { bindLoggerSettings } from "./utils/log.js";
import { debounce } from "./utils/debounce.js";

const settingsStore = createSettingsStore();
const statsStore = createStatsStore();
const upBlockStatsStore = createUpBlockStatsStore();
const videoStore = createVideoStore((ruleKey) => statsStore.increment(ruleKey));
const apiClient = createBilibiliApiClient();
const domAdapter = createBilibiliDomAdapter();
const renderer = createBlockedRenderer();
const cardActions = createCardActions();
const features = createFeatureRegistry();

bindLoggerSettings(() => settingsStore.getSettings());

apiClient.setSettingsProvider(() => settingsStore.getSettings());

const runtimeContext = createRuntimeContext({
    settingsStore,
    statsStore,
    upBlockStatsStore,
    videoStore,
    apiClient,
    domAdapter,
    renderer,
    cardActions,
    features,
});

function invokePipeline(options = {}) {
    runPipeline(runtimeContext, options);
}

runtimeContext.refresh = (options = {}) => {
    invokePipeline(options);
};

runtimeContext.clearScriptEffects = () => {
    clearScriptEffects(runtimeContext);
};

runtimeContext.rerunVideoCard = (videoElement, options = {}) => {
    runVideoCardPipeline(runtimeContext, videoElement, options);
};

runtimeContext.hooks = {
    afterQuickBlock(context, { videoElement, videoBv }) {
        if (videoElement) {
            context.rerunVideoCard(videoElement, { reevaluate: true });
            return;
        }

        if (videoBv) {
            context.refresh({ reevaluate: true });
        }
    },
};

window.bbvtShowHoverReviewPanel = showHoverReviewPanel;
window.bbvtHideHoverReviewPanel = hideHoverReviewPanel;

apiClient.setRefreshCallback(debounce(() => {
    invokePipeline();
}, 200));

registerUserscriptMenu(runtimeContext);
mountFloatingEntry(runtimeContext);

startPageObservers(() => {
    invokePipeline();
}, {
    isPipelineRunning,
    getAddedVideoElements: (records) => domAdapter.getVideoElementsFromMutationRecords(records),
    onAddedVideoElements: (videoElements) => {
        videoElements.forEach((videoElement) => {
            runtimeContext.rerunVideoCard(videoElement);
        });
    },
});

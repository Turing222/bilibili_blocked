// == 主执行流程 ==============================================================
//
// 这个文件是整个脚本的“目录”。
//
// 这里只关心顺序：
// 1. 读取当前设置。
// 2. 执行页面级功能，例如隐藏广告、隐藏非视频元素。
// 3. 执行热搜相关功能。
// 4. 判断当前页面是否需要处理视频卡片。
// 5. 扫描视频卡片。
// 6. 提取基础信息：BV、标题、UP 名称、UID。
// 7. 按功能需要补充 API 数据。
// 8. 运行屏蔽规则。
// 9. 运行覆盖类后处理逻辑。
// 10. 渲染隐藏或叠加层。
// 11. 同步叠加层尺寸。
//
// 不在这里写：
// - 具体 DOM selector。
// - 具体 API URL。
// - 具体屏蔽规则判断。
// - 具体 CSS 或 overlay 结构。

import { closeQuickBlockOverlay } from "../actions/quick-block.js";
import { dismissCommentQuickBlockUi } from "../actions/comment-quick-block.js";
import { hideHoverReviewPanel } from "../actions/review-panel.js";

let pipelineRunning = false;
let pendingPipelineOptions = null;

export function isPipelineRunning() {
    return pipelineRunning;
}

export function runPipeline(context, options = {}) {
    if (pipelineRunning) {
        if (shouldDeferPipelineRun(options)) {
            pendingPipelineOptions = mergePipelineOptions(pendingPipelineOptions, options);
        }
        return;
    }

    const { reevaluate = false } = options;

    pipelineRunning = true;
    try {
        if (reevaluate) {
            context.videoStore.resetAllBlockEvaluations();
        }

        runPipelineBody(context);
    } finally {
        pipelineRunning = false;
        if (pendingPipelineOptions) {
            const nextOptions = pendingPipelineOptions;
            pendingPipelineOptions = null;
            setTimeout(() => runPipeline(context, nextOptions), 0);
        }
    }
}

function shouldDeferPipelineRun(options) {
    return Boolean(options.reevaluate);
}

function mergePipelineOptions(current, next) {
    if (!current) {
        return { ...next };
    }

    return {
        reevaluate: Boolean(current.reevaluate || next.reevaluate),
    };
}

export function runVideoCardPipeline(context, videoElement, options = {}) {
    if (pipelineRunning || !videoElement) {
        return;
    }

    const { reevaluate = false } = options;

    pipelineRunning = true;
    try {
        const settings = context.settingsStore.getSettings();
        const pipelineContext = {
            ...context,
            settings,
        };

        if (!isPipelineScriptEnabled(settings)) {
            const videoRef = context.domAdapter.readVideoRef(videoElement);
            if (videoRef) {
                context.videoStore.mergeVideoInfo(videoRef.videoBv, videoRef);
                context.videoStore.resetBlockEvaluation(videoRef.videoBv);
                context.renderer.renderVideoBlockedState({
                    ...pipelineContext,
                    videoElement,
                    videoBv: videoRef.videoBv,
                });
            }
            context.renderer.clearVideoElementVisual?.(videoElement, settings);
            return;
        }

        if (context.domAdapter.shouldSkipVideoBlocking(window.location.href)) {
            return;
        }

        if (context.domAdapter.isAlreadyBlockedChildElement(videoElement)) {
            return;
        }

        const videoRef = context.domAdapter.readVideoRef(videoElement);
        if (!videoRef) {
            return;
        }

        if (reevaluate) {
            context.videoStore.resetBlockEvaluation(videoRef.videoBv);
        }

        runSingleVideoPipeline(pipelineContext, videoElement);
        context.renderer.syncBlockedOverlayRects();
    } finally {
        pipelineRunning = false;
    }
}

function runPipelineBody(context) {
    const settings = context.settingsStore.getSettings();
    const pipelineContext = {
        ...context,
        settings,
    };
    if (!isPipelineScriptEnabled(settings)) {
        clearScriptEffects(pipelineContext);
        return;
    }

    runPageFeatures(pipelineContext);
    runTrendingFeatures(pipelineContext);

    pipelineContext.videoStore.logVideoInfoDictIfChanged(settings);

    if (context.domAdapter.shouldSkipVideoBlocking(window.location.href)) {
        return;
    }

    const videoElements = context.domAdapter.getVideoElements();
    const keepBvs = new Set();

    for (const videoElement of videoElements) {
        const videoRef = runSingleVideoPipeline(pipelineContext, videoElement);
        if (videoRef?.videoBv) {
            keepBvs.add(videoRef.videoBv);
        }
    }

    pipelineContext.videoStore.pruneStaleVideoInfo({ keepBvs });

    context.renderer.syncBlockedOverlayRects();

    if (pipelineContext.settings.hideVideoMode_Switch) {
        const stats = pipelineContext.videoStore.getBlockStats();
        pipelineContext.floatingEntry?.updateStats(stats.total, stats.blocked, stats.rate);
    } else {
        pipelineContext.floatingEntry?.updateStats(0, 0, 0);
    }
}

function runPageFeatures(context) {
    for (const feature of context.features.pageFeatures) {
        if (feature.enabled(context)) {
            feature.run(context);
        }
    }
}

function runTrendingFeatures(context) {
    for (const feature of context.features.trendingFeatures) {
        if (feature.enabled(context)) {
            feature.run(context);
        }
    }
}

function runSingleVideoPipeline(context, videoElement) {
    if (context.domAdapter.isAlreadyBlockedChildElement(videoElement)) {
        return null;
    }

    const videoRef = context.domAdapter.readVideoRef(videoElement);
    if (!videoRef) {
        return null;
    }

    const videoContext = {
        ...context,
        videoElement,
        videoBv: videoRef.videoBv,
    };

    context.videoStore.mergeVideoInfo(videoRef.videoBv, videoRef);
    context.cardActions?.mount?.(videoContext, videoElement, videoRef.videoBv);

    for (const feature of context.features.videoPrepareFeatures) {
        if (feature.enabled(videoContext)) {
            feature.run(videoContext);
        }
    }

    for (const feature of context.features.videoRuleFeatures) {
        if (!feature.enabled(videoContext)) {
            continue;
        }

        const videoInfo = context.videoStore.getVideoInfo(videoContext.videoBv);
        if (videoInfo?.blockedTarget && !context.settings.accumulateBlockedRules_Switch) {
            // 默认：已屏蔽则不再跑后续规则、也不再为这条视频请求 API。
            continue;
        }

        const isReady = feature.run(videoContext);
        if (isReady === false && !videoInfo?.blockedTarget) {
            break;
        }
    }

    for (const feature of context.features.videoPostRuleFeatures) {
        if (feature.enabled(videoContext)) {
            feature.run(videoContext);
        }
    }

    context.renderer.renderVideoBlockedState(videoContext);
    return videoRef;
}

function isPipelineScriptEnabled(settings) {
    return settings.scriptEnabled_Switch !== false;
}

export function clearScriptEffects(context) {
    dismissCommentQuickBlockUi();
    closeQuickBlockOverlay();
    hideHoverReviewPanel();
    clearVideoBlocks(context);
    restoreCommentFilters(context);
    restorePageCleanupEffects(context);
    context.renderer.restoreTrendingBlocks?.();
    context.renderer.removeAllBlockedOverlays?.();
    context.floatingEntry?.updateStats(0, 0, 0);
}

function clearVideoBlocks(context) {
    context.videoStore.resetAllBlockEvaluations();

    if (!context.domAdapter.shouldSkipVideoBlocking(window.location.href)) {
        const videoElements = context.domAdapter.getVideoElements();
        for (const videoElement of videoElements) {
            const videoRef = context.domAdapter.readVideoRef(videoElement);
            if (!videoRef) {
                continue;
            }

            context.videoStore.mergeVideoInfo(videoRef.videoBv, videoRef);
            context.videoStore.resetBlockEvaluation(videoRef.videoBv);
            context.renderer.renderVideoBlockedState({
                ...context,
                videoElement,
                videoBv: videoRef.videoBv,
            });
        }
    }

    document.querySelectorAll("[data-bbvt-blocked]").forEach((videoElement) => {
        context.renderer.clearVideoElementVisual?.(videoElement, context.settings);
    });

    context.renderer.syncBlockedOverlayRects();
}

function restoreCommentFilters(context) {
    if (!context.domAdapter.shouldHandleCommentFiltering(window.location.href)) {
        return;
    }

    context.domAdapter.getCommentElements().forEach((commentElement) => {
        const blockTarget = context.domAdapter.getCommentBlockTarget?.(commentElement) || commentElement;
        context.renderer.renderCommentBlockedState(blockTarget, { blocked: false });
    });
}

function restorePageCleanupEffects() {
    document.querySelectorAll(".hideAD").forEach((element) => {
        element.classList.remove("hideAD");
    });

    document.querySelectorAll("div.trending").forEach((element) => {
        element.style.display = "";
    });
}

import assert from "node:assert/strict";
import { describe, it, mock, afterEach, beforeEach } from "node:test";

import { clearScriptEffects, runPipeline, runVideoCardPipeline, isPipelineRunning } from "../src/orchestration/pipeline.js";
import { shouldIgnoreMutationRecords } from "../src/platform/page-observers.js";
import { debounce } from "../src/utils/debounce.js";
import { createVideoStore } from "../src/state/video-store.js";

const bv = "BV1lifecycle";

beforeEach(() => {
    globalThis.window = {
        location: { href: "https://www.bilibili.com/" },
    };
});

function createMockVideoElement({ pending = false } = {}) {
    return {
        dataset: pending ? { bbvtBlocked: "pending" } : {},
        querySelector: () => null,
        querySelectorAll: () => [],
    };
}

function createPipelineContext(overrides = {}) {
    let bodyRunCount = 0;
    let resetAllCount = 0;
    let renderCount = 0;

    const videoStore = createVideoStore();
    videoStore.mergeVideoInfo(bv, {
        videoTitle: "测试",
        blockedTarget: true,
        triggeredBlockedRules: ["按标题屏蔽: 测试"],
    });

    const originalResetAll = videoStore.resetAllBlockEvaluations.bind(videoStore);
    videoStore.resetAllBlockEvaluations = () => {
        resetAllCount++;
        originalResetAll();
    };

    const context = {
        settingsStore: {
            getSettings: () => ({
                hideVideoMode_Switch: false,
                accumulateBlockedRules_Switch: false,
                consoleOutputLog_Switch: false,
                ...overrides.settings,
            }),
        },
        videoStore,
        domAdapter: {
            shouldSkipVideoBlocking: () => overrides.skipVideoBlocking ?? true,
            getVideoElements: () => overrides.videoElements ?? [],
            isAlreadyBlockedChildElement: () => false,
            readVideoRef: () => ({ videoBv: bv, videoTitle: "测试" }),
        },
        features: {
            pageFeatures: overrides.pageFeatures ?? [],
            trendingFeatures: overrides.trendingFeatures ?? [],
            videoPrepareFeatures: overrides.videoPrepareFeatures ?? [],
            videoRuleFeatures: overrides.videoRuleFeatures ?? [],
            videoPostRuleFeatures: overrides.videoPostRuleFeatures ?? [],
        },
        renderer: {
            syncBlockedOverlayRects: () => {
                bodyRunCount++;
            },
            renderVideoBlockedState: () => {},
        },
        cardActions: { mount: () => {} },
        floatingEntry: { updateStats: () => {} },
        getBodyRunCount: () => bodyRunCount,
        getResetAllCount: () => resetAllCount,
        getRenderCount: () => renderCount,
    };

    const originalRender = context.renderer.renderVideoBlockedState;
    context.renderer.renderVideoBlockedState = (...args) => {
        renderCount++;
        originalRender(...args);
    };

    return context;
}

function mockOverlayNode(className = "blockedOverlay") {
    return {
        classList: {
            contains: (name) => name === className,
        },
        dataset: {},
        closest: () => null,
    };
}

function mockVideoCardNode() {
    return {
        classList: { contains: () => false },
        dataset: {},
        closest: () => null,
    };
}

describe("pipeline reentrancy", () => {
    afterEach(() => {
        mock.timers.reset();
    });

    it("does not nest pipeline execution when triggered from inside a feature", () => {
        let nestedAttempts = 0;
        const context = createPipelineContext({
            skipVideoBlocking: false,
            videoElements: [],
            pageFeatures: [
                {
                    enabled: () => true,
                    run: () => {
                        nestedAttempts++;
                        runPipeline(context);
                    },
                },
            ],
        });

        runPipeline(context);

        assert.equal(nestedAttempts, 1);
        assert.equal(context.getBodyRunCount(), 1);
        assert.equal(isPipelineRunning(), false);
    });

    it("runs a deferred refresh after the current pipeline finishes", () => {
        mock.timers.enable({ apis: ["setTimeout"] });

        let pageFeatureRuns = 0;
        let requestedDeferred = false;
        const context = createPipelineContext({
            skipVideoBlocking: true,
            videoElements: [],
            pageFeatures: [
                {
                    enabled: () => true,
                    run: () => {
                        pageFeatureRuns++;
                        if (!requestedDeferred) {
                            requestedDeferred = true;
                            runPipeline(context, { reevaluate: true });
                        }
                    },
                },
            ],
        });

        runPipeline(context);

        assert.equal(pageFeatureRuns, 1);
        assert.equal(context.getResetAllCount(), 0);

        mock.timers.tick(0);

        assert.equal(pageFeatureRuns, 2);
        assert.equal(context.getResetAllCount(), 1);
        assert.equal(isPipelineRunning(), false);
    });
});

describe("pipeline reevaluate option", () => {
    it("does not reset blocked state on a normal run", () => {
        const context = createPipelineContext();

        runPipeline(context);

        assert.equal(context.getResetAllCount(), 0);
        assert.equal(context.videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.deepEqual(context.videoStore.getVideoInfo(bv).triggeredBlockedRules, ["按标题屏蔽: 测试"]);
    });

    it("resets blocked state when reevaluate is true", () => {
        const context = createPipelineContext();

        runPipeline(context, { reevaluate: true });

        assert.equal(context.getResetAllCount(), 1);
        assert.equal(context.videoStore.getVideoInfo(bv).blockedTarget, false);
        assert.deepEqual(context.videoStore.getVideoInfo(bv).triggeredBlockedRules, []);
    });
});

describe("pipeline blocked-target skip", () => {
    it("skips further rule features for already blocked videos without reevaluate", () => {
        let ruleFeatureRuns = 0;
        const videoElement = createMockVideoElement();
        const context = createPipelineContext({
            skipVideoBlocking: false,
            videoElements: [videoElement],
            videoRuleFeatures: [
                {
                    enabled: () => true,
                    run: () => {
                        ruleFeatureRuns++;
                        return true;
                    },
                },
            ],
        });

        runPipeline(context);

        assert.equal(ruleFeatureRuns, 0);
    });

    it("runs rule features again after reevaluate reset", () => {
        let ruleFeatureRuns = 0;
        const videoElement = createMockVideoElement();
        const context = createPipelineContext({
            skipVideoBlocking: false,
            videoElements: [videoElement],
            videoRuleFeatures: [
                {
                    enabled: () => true,
                    run: () => {
                        ruleFeatureRuns++;
                        return true;
                    },
                },
            ],
        });

        runPipeline(context, { reevaluate: true });

        assert.equal(ruleFeatureRuns, 1);
    });
});

describe("runVideoCardPipeline", () => {
    it("reevaluate only resets the target video", () => {
        const videoElement = createMockVideoElement();
        const context = createPipelineContext({
            skipVideoBlocking: false,
        });

        context.videoStore.mergeVideoInfo("BVother", {
            blockedTarget: true,
            triggeredBlockedRules: ["按标题屏蔽: 其他"],
        });

        let singleResetCount = 0;
        const originalReset = context.videoStore.resetBlockEvaluation.bind(context.videoStore);
        context.videoStore.resetBlockEvaluation = (videoId) => {
            singleResetCount++;
            originalReset(videoId);
        };

        runVideoCardPipeline(context, videoElement, { reevaluate: true });

        assert.equal(singleResetCount, 1);
        assert.equal(context.getResetAllCount(), 0);
        assert.equal(context.videoStore.getVideoInfo(bv).blockedTarget, false);
        assert.equal(context.videoStore.getVideoInfo("BVother").blockedTarget, true);
        assert.equal(context.getRenderCount(), 1);
    });

    it("runs rule features for the target card after reevaluate", () => {
        let ruleFeatureRuns = 0;
        const videoElement = createMockVideoElement();
        const context = createPipelineContext({
            skipVideoBlocking: false,
            videoRuleFeatures: [
                {
                    enabled: () => true,
                    run: () => {
                        ruleFeatureRuns++;
                        return true;
                    },
                },
            ],
        });

        runVideoCardPipeline(context, videoElement, { reevaluate: true });

        assert.equal(ruleFeatureRuns, 1);
        assert.equal(context.getRenderCount(), 1);
    });
});

describe("clearScriptEffects", () => {
    it("restores comment block targets instead of only source comments", () => {
        const rootComment = { id: "root" };
        const threadTarget = { id: "thread" };
        const restored = [];

        globalThis.document = {
            getElementById: () => null,
            querySelectorAll: () => [],
        };
        globalThis.window = {
            location: { href: "https://www.bilibili.com/video/BV1test/" },
        };

        clearScriptEffects({
            settings: {},
            videoStore: {
                resetAllBlockEvaluations() {},
            },
            domAdapter: {
                shouldSkipVideoBlocking: () => true,
                shouldHandleCommentFiltering: () => true,
                getCommentElements: () => [rootComment],
                getCommentBlockTarget: () => threadTarget,
            },
            renderer: {
                renderCommentBlockedState(element, blockResult) {
                    restored.push({ element, blockResult });
                },
                syncBlockedOverlayRects() {},
                restoreTrendingBlocks() {},
                removeAllBlockedOverlays() {},
            },
            floatingEntry: {
                updateStats() {},
            },
        });

        assert.equal(restored.length, 1);
        assert.equal(restored[0].element, threadTarget);
        assert.deepEqual(restored[0].blockResult, { blocked: false });
    });
});

describe("shouldIgnoreMutationRecords", () => {
    it("ignores mutations while pipeline is running", () => {
        const records = [
            {
                type: "childList",
                addedNodes: [mockVideoCardNode()],
                removedNodes: [],
            },
        ];

        assert.equal(shouldIgnoreMutationRecords(records, true), true);
    });

    it("ignores mutations that only touch script-owned overlay nodes", () => {
        const records = [
            {
                type: "childList",
                addedNodes: [mockOverlayNode()],
                removedNodes: [],
            },
        ];

        assert.equal(shouldIgnoreMutationRecords(records, false), true);
    });

    it("ignores mutations that only touch comment filter overlay nodes", () => {
        const records = [
            {
                type: "childList",
                addedNodes: [mockOverlayNode("bbvt-comment-filter-overlay")],
                removedNodes: [],
            },
        ];

        assert.equal(shouldIgnoreMutationRecords(records, false), true);
    });

    it("does not ignore mutations that add normal page nodes", () => {
        const records = [
            {
                type: "childList",
                addedNodes: [mockVideoCardNode()],
                removedNodes: [],
            },
        ];

        assert.equal(shouldIgnoreMutationRecords(records, false), false);
    });
});

describe("debounced api refresh pattern", () => {
    afterEach(() => {
        mock.timers.reset();
    });

    it("collapses rapid refresh callbacks into a single pipeline run", () => {
        mock.timers.enable({ apis: ["setTimeout"] });

        let pipelineRuns = 0;
        const refreshFromApi = debounce(() => {
            pipelineRuns++;
        }, 200);

        for (let i = 0; i < 10; i++) {
            refreshFromApi();
        }

        assert.equal(pipelineRuns, 0);
        mock.timers.tick(199);
        assert.equal(pipelineRuns, 0);
        mock.timers.tick(1);
        assert.equal(pipelineRuns, 1);
    });
});

describe("recommendation overlay defer on video pages", () => {
    afterEach(() => {
        mock.timers.reset();
        delete globalThis.document;
        delete globalThis.MutationObserver;
    });

    it("defers recommendation card overlay rendering until comment section is ready", () => {
        let renderCount = 0;
        let refreshCount = 0;
        let observerCallback = null;

        globalThis.window = {
            location: { href: "https://www.bilibili.com/video/BV1test/" },
        };

        const commentApp = {
            childElementCount: 0,
        };

        globalThis.document = {
            querySelector(selector) {
                if (selector === "#commentapp") {
                    return commentApp;
                }
                if (selector === "bili-comments") {
                    return null;
                }
                return null;
            },
        };

        globalThis.MutationObserver = class {
            constructor(callback) {
                observerCallback = callback;
            }

            observe() {}

            disconnect() {}
        };

        const recommendationCard = {
            classList: {
                contains: (name) => name === "video-page-card-small",
            },
            dataset: {},
            querySelector: () => null,
            querySelectorAll: () => [],
        };

        const context = createPipelineContext({
            skipVideoBlocking: false,
            videoElements: [recommendationCard],
            settings: {
                hideVideoMode_Switch: false,
            },
        });

        context.domAdapter = {
            ...context.domAdapter,
            shouldSkipVideoBlocking: () => false,
            getVideoElements: () => [recommendationCard],
            isRecommendationVideoCard: (element) => element === recommendationCard,
            shouldDeferRecommendationOverlay: () => true,
            isCommentSectionReady: () => commentApp.childElementCount > 0,
            shouldHandleCommentFiltering: () => true,
        };
        context.refresh = () => {
            refreshCount++;
        };
        context.renderer.renderVideoBlockedState = () => {
            renderCount++;
        };

        runPipeline(context);

        assert.equal(renderCount, 0);
        assert.equal(refreshCount, 0);
        assert.equal(typeof observerCallback, "function");

        commentApp.childElementCount = 1;
        observerCallback([{ type: "childList" }]);

        assert.equal(refreshCount, 1);
    });
});

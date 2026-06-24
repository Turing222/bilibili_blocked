// == 页面生命周期监听 ========================================================
//
// 职责：
// - 监听 window load。
// - 监听 window resize。
// - 创建 MutationObserver。
// - 在页面变化时触发传入的 run 函数。
//
// 不负责：
// - 不知道 run 函数里面具体做什么。
// - 不直接访问视频状态或规则。
//
// 原脚本迁移来源：
// - window.addEventListener("load", ...)
// - window.addEventListener("resize", ...)
// - MutationObserver

import { debounce } from "../utils/debounce.js";

const SCRIPT_UI_SELECTOR = "#bbvtReviewPanel, #bbvtQuickBlock, #bbvtCommentQuickBlockTrigger, #bbvtCommentQuickBlockPopup, #blockedMenuUi, #bbvtFloatingEntry";

function isScriptOwnedNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.classList?.contains("blockedOverlay")) {
        return true;
    }

    if (node.classList?.contains("bbvt-comment-filter-placeholder")) {
        return true;
    }

    if (node.classList?.contains("bbvt-comment-filter-overlay")) {
        return true;
    }

    if (node.dataset?.bbvtBlocked !== undefined) {
        return true;
    }

    if (
        node.dataset?.bbvtCommentBlocked !== undefined ||
        node.dataset?.bbvtCommentFilterPlaceholder !== undefined ||
        node.dataset?.bbvtCommentFilterOverlay !== undefined
    ) {
        return true;
    }

    return !!node.closest?.(SCRIPT_UI_SELECTOR);
}

export function shouldIgnoreMutationRecords(records, isPipelineRunning) {
    if (isPipelineRunning) {
        return true;
    }

    return records.every((record) => {
        if (record.type !== "childList") {
            return true;
        }

        const nodes = [...record.addedNodes, ...record.removedNodes];
        if (nodes.length === 0) {
            return true;
        }

        return nodes.every(isScriptOwnedNode);
    });
}

export function startPageObservers(run, { isPipelineRunning = () => false } = {}) {
    const debouncedRun = debounce(run, 300);

    window.addEventListener("load", run);
    window.addEventListener("resize", debounce(run, 150));

    const observer = new MutationObserver((records) => {
        if (shouldIgnoreMutationRecords(records, isPipelineRunning())) {
            return;
        }

        debouncedRun();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

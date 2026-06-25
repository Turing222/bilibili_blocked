// == 渲染层 ==================================================================
//
// 职责：
// - 根据 videoStore 中的 blockedTarget / whiteListTargets 渲染结果。
// - 隐藏视频卡片。
// - 添加或移除屏蔽叠加层。
// - 渲染热搜项屏蔽效果。
// - 同步 overlay 尺寸。
//
// 不负责：
// - 不判断规则是否命中。
// - 不请求 API。
// - 不读取 GM 配置。
//
// 原脚本迁移来源：
// - blockedOrUnblocked()
// - addTrendingItemHiddenOrOverlay()
// - syncBlockedOverlayAndParentNodeRect()

import { safeRegexTest } from "../utils/regex.js";

let blockedOverlayGeneration = 0;

export function createBlockedRenderer() {
    return {
        renderVideoBlockedState(videoContext) {
            const { settings, videoStore, statsStore, videoElement, videoBv } = videoContext;
            const videoInfo = videoStore.getVideoInfo(videoBv);

            if (!videoInfo?.blockedTarget) {
                if (isHiddenOrOverlayed(videoElement)) {
                    removeHiddenOrOverlay(videoElement, settings);
                }
                return;
            }

            if (settings.hideVideoMode_Switch) {
                if (hasBlockedOverlay(videoElement)) {
                    removeOverlayOnly(videoElement);
                }
                if (!isVideoElementHidden(videoElement)) {
                    hideVideoElement(videoElement);
                }
                return;
            }

            if (isVideoElementHidden(videoElement)) {
                showVideoElement(videoElement);
            }

            if (videoElement.dataset.bbvtBlocked === "pending") {
                return;
            }

            if (!hasBlockedOverlay(videoElement)) {
                const heatLevel = statsStore
                    ? computeHeatLevel(videoInfo.triggeredBlockedRules || [], statsStore.getData())
                    : 0;
                addHiddenOrOverlay(videoElement, videoInfo, settings, false, heatLevel, videoContext);
            }
        },

        renderTrendingItems(trendingItems, settings, statsStore) {
            trendingItems.forEach((trendingItem) => {
                if (trendingItem.style.display === "none" || trendingItem.querySelector(".blockedOverlay")) {
                    return;
                }

                if (settings.blockedTrendingItem_Switch) {
                    const hitItem = findTrendingMatch(
                        trendingItem.textContent,
                        settings.blockedTrendingItem_Array,
                        settings.blockedTrendingItem_UseRegular
                    );
                    if (hitItem) {
                        statsStore?.increment(`按关键词屏蔽热搜项: ${hitItem}`);
                        applyTrendingBlock(trendingItem, hitItem, settings);
                        return;
                    }
                }

                if (settings.blockedTrendingItemByTitleTag_Switch) {
                    const hitItem = findTrendingMatch(
                        trendingItem.textContent,
                        settings.blockedTitle_Array,
                        settings.blockedTitle_UseRegular
                    );
                    if (hitItem) {
                        statsStore?.increment(`按标题屏蔽: ${hitItem}`);
                        applyTrendingBlock(trendingItem, hitItem, settings);
                    }
                }
            });
        },

        renderCommentBlockedState(commentElement, blockResult, options = {}) {
            if (!blockResult.blocked) {
                restoreCommentElement(commentElement, { commentKey: blockResult.commentKey });
                return false;
            }

            return blockCommentElement(commentElement, blockResult, options);
        },

        clearVideoElementVisual(videoElement, settings) {
            blockedOverlayGeneration++;
            removeHiddenOrOverlay(videoElement, settings);
        },

        removeAllBlockedOverlays() {
            blockedOverlayGeneration++;
            document.querySelectorAll("div.blockedOverlay").forEach((overlay) => {
                overlay.remove();
            });
        },

        restoreTrendingBlocks() {
            document.querySelectorAll("[data-bbvt-trending-blocked]").forEach((trendingItem) => {
                delete trendingItem.dataset.bbvtTrendingBlocked;
                trendingItem.style.display = "";
                trendingItem.querySelector(".blockedOverlay")?.remove();
            });
        },

        syncBlockedOverlayRects() {
            const blockedOverlays = document.querySelectorAll("div.blockedOverlay");

            blockedOverlays.forEach((element) => {
                const parentNodeElementRect = element.parentNode.getBoundingClientRect();
                const nextWidth = `${parentNodeElementRect.width}px`;
                const nextHeight = `${parentNodeElementRect.height}px`;

                if (element.style.width !== nextWidth) {
                    element.style.width = nextWidth;
                }

                if (element.style.height !== nextHeight) {
                    element.style.height = nextHeight;
                }
            });
        },
    };
}

const commentFilterOverlays = new WeakMap();

function blockCommentElement(commentElement, blockResult, { mode = "overlay", reasonItems = [] } = {}) {
    const reason = blockResult.reason || blockResult.type || "命中评论规则";
    const commentKey = getCommentBypassKey(commentElement, blockResult);
    const wasBlocked = commentElement.dataset.bbvtCommentBlocked === "true";
    const previousReason = commentElement.dataset.bbvtCommentBlockReason || "";
    const previousMode = commentElement.dataset.bbvtCommentBlockMode || "";

    if (commentKey) {
        commentElement.dataset.bbvtCommentKey = commentKey;
    }

    rememberCommentOriginalStyles(commentElement);

    commentElement.dataset.bbvtCommentBlocked = "true";
    commentElement.dataset.bbvtCommentBlockReason = reason;
    commentElement.dataset.bbvtCommentBlockMode = mode;

    if (mode === "hide") {
        removeCommentOverlay(commentElement, commentKey);
        clearCommentPeekState(commentElement);
        hideCommentElement(commentElement);
    } else {
        injectCommentFilterStyles(commentElement);
        showCommentElement(commentElement, { keepBlockState: true });
        ensureCommentOverlay(commentElement, { reason, commentKey, reasonItems });

        if (isCommentPeeking(commentElement)) {
            showCommentElement(commentElement, { keepBlockState: true });
        } else {
            hideCommentElementForOverlay(commentElement);
        }
    }

    return !wasBlocked || previousReason !== reason || previousMode !== mode;
}

function ensureCommentOverlay(commentElement, { reason, commentKey = "", reasonItems = [] }) {
    if (!commentElement.parentNode) {
        return;
    }

    ensureCommentOverlayParent(commentElement.parentNode);

    let overlay = commentFilterOverlays.get(commentElement);
    if (!overlay || !overlay.parentNode) {
        overlay = findReusableCommentOverlay(commentElement, commentKey);
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "bbvt-comment-filter-overlay";
            overlay.dataset.bbvtCommentFilterOverlay = "true";
        }
        commentFilterOverlays.set(commentElement, overlay);
        commentElement.parentNode.insertBefore(overlay, commentElement);
    }

    overlay.dataset.bbvtCommentKey = commentKey || "";
    overlay.dataset.bbvtCommentFilterMode = "hidden";
    positionCommentOverlay(commentElement, overlay);
    removeDuplicateCommentOverlays(commentElement, overlay, commentKey);
    const normalizedReasonItems = normalizeCommentReasonItems(reasonItems);
    const overlaySignature = createCommentOverlaySignature(reason, normalizedReasonItems);
    if (
        overlay.dataset.bbvtCommentOverlaySignature !== overlaySignature ||
        !overlay.querySelector?.(".bbvt-comment-filter-overlay-veil") ||
        !overlay.querySelector?.(".bbvt-comment-filter-overlay-body")
    ) {
        overlay.replaceChildren();
        const veil = document.createElement("div");
        veil.className = "bbvt-comment-filter-overlay-veil";

        const body = document.createElement("div");
        body.className = "bbvt-comment-filter-overlay-body";

        const label = document.createElement("span");
        label.className = "bbvt-comment-filter-overlay-text";
        label.textContent = "已屏蔽评论";

        if (normalizedReasonItems.length === 0) {
            label.textContent = `已屏蔽评论：${reason}`;
            body.append(label);
        } else {
            body.append(label);
            normalizedReasonItems.forEach((item) => {
                body.appendChild(createCommentReasonChip(item));
            });
        }

        overlay.append(veil, body);
        overlay.dataset.bbvtCommentOverlaySignature = overlaySignature;
    }

    if (isCommentPeeking(commentElement)) {
        overlay.dataset.bbvtCommentFilterPeeking = "true";
    } else {
        delete overlay.dataset.bbvtCommentFilterPeeking;
    }

    overlay.onmousemove = (event) => {
        if (isCommentOverlayControlTarget(event?.target, overlay)) {
            return;
        }
        peekCommentElement(commentElement, overlay);
    };
    overlay.onmouseleave = () => {
        endCommentOverlayPeek(commentElement, overlay);
    };
}

function normalizeCommentReasonItems(reasonItems) {
    return (Array.isArray(reasonItems) ? reasonItems : [])
        .map((item) => ({
            ...item,
            label: String(item?.label || "").trim(),
        }))
        .filter((item) => item.label);
}

function createCommentOverlaySignature(reason, reasonItems) {
    return JSON.stringify({
        reason: String(reason || ""),
        reasonItems: reasonItems.map((item) => ({
            id: item.id || "",
            label: item.label || "",
            title: item.title || "",
            canRemove: Boolean(item.canRemove),
            removeTitle: item.removeTitle || "",
        })),
    });
}

function createCommentReasonChip(item) {
    const chip = document.createElement("span");
    chip.className = "bbvt-comment-filter-reason-chip";
    chip.title = item.title || item.label;
    stopCommentOverlayControlEvents(chip);

    const label = document.createElement("span");
    label.className = "bbvt-comment-filter-reason-label";
    label.textContent = item.label;
    chip.appendChild(label);

    if (item.canRemove && typeof item.onRemove === "function") {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "bbvt-comment-filter-reason-remove";
        removeButton.textContent = "×";
        removeButton.title = item.removeTitle || "从配置中删除这条规则";
        stopCommentOverlayControlEvents(removeButton);
        removeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            item.onRemove(item);
        });
        chip.appendChild(removeButton);
    }

    return chip;
}

function stopCommentOverlayControlEvents(element) {
    ["mousemove", "mousedown", "pointerdown"].forEach((eventName) => {
        element.addEventListener(eventName, (event) => {
            event.stopPropagation();
        });
    });
}

function isCommentOverlayControlTarget(target, overlay) {
    let current = target;
    while (current && current !== overlay) {
        if (current.classList?.contains?.("bbvt-comment-filter-overlay-body")) {
            return true;
        }
        current = current.parentNode;
    }

    return false;
}

function ensureCommentOverlayParent(parent) {
    const position = parent.nodeType === 1 && typeof getComputedStyle === "function"
        ? getComputedStyle(parent).position
        : parent.style?.position;
    if (parent.style && (!position || position === "static")) {
        parent.dataset.bbvtCommentOverlayParent = "true";
        parent.style.position = "relative";
    }
}

function positionCommentOverlay(commentElement, overlay) {
    const width = commentElement.offsetWidth || commentElement.getBoundingClientRect?.().width || 0;
    const height = commentElement.offsetHeight || commentElement.getBoundingClientRect?.().height || 0;

    Object.assign(overlay.style, {
        position: "absolute",
        left: `${commentElement.offsetLeft || 0}px`,
        top: `${commentElement.offsetTop || 0}px`,
        width: width ? `${width}px` : "100%",
        minHeight: `${Math.max(44, height)}px`,
        height: `${Math.max(44, height)}px`,
        boxSizing: "border-box",
        zIndex: "20",
    });
}

function findReusableCommentOverlay(commentElement, commentKey) {
    if (!commentKey || !commentElement.parentNode?.querySelectorAll) {
        return null;
    }

    return [...commentElement.parentNode.querySelectorAll(".bbvt-comment-filter-overlay")]
        .find((overlay) => overlay.dataset?.bbvtCommentKey === commentKey) || null;
}

function removeDuplicateCommentOverlays(commentElement, currentOverlay, commentKey) {
    if (!commentKey || !commentElement.parentNode?.querySelectorAll) {
        return;
    }

    commentElement.parentNode
        .querySelectorAll(".bbvt-comment-filter-overlay")
        .forEach((overlay) => {
            if (overlay !== currentOverlay && overlay.dataset?.bbvtCommentKey === commentKey) {
                overlay.remove();
            }
        });
}

function removeCommentOverlaysForKey(commentElement, currentOverlay, commentKey) {
    if (!commentKey || !commentElement.parentNode?.querySelectorAll) {
        return;
    }

    commentElement.parentNode
        .querySelectorAll(".bbvt-comment-filter-overlay")
        .forEach((overlay) => {
            if (overlay === currentOverlay || overlay.dataset?.bbvtCommentKey === commentKey) {
                overlay.remove();
            }
        });
}

function removeCommentOverlay(commentElement, commentKey = getCommentBypassKey(commentElement, {})) {
    const overlay = commentFilterOverlays.get(commentElement);
    if (overlay?.parentNode) {
        overlay.remove();
    }
    removeCommentOverlaysForKey(commentElement, overlay, commentKey);
    commentFilterOverlays.delete(commentElement);
}

function restoreCommentElement(commentElement, { commentKey: restoreCommentKey = "" } = {}) {
    const commentKey = getCommentBypassKey(commentElement, { commentKey: restoreCommentKey });
    const overlay = commentFilterOverlays.get(commentElement);
    removeCommentOverlay(commentElement, commentKey);

    clearCommentPeekState(commentElement, overlay);
    showCommentElement(commentElement);
    delete commentElement.dataset.bbvtCommentKey;
}

function showCommentElement(commentElement, { keepBlockState = false } = {}) {
    if (Object.prototype.hasOwnProperty.call(commentElement.dataset, "bbvtCommentOriginalDisplay")) {
        commentElement.style.display = commentElement.dataset.bbvtCommentOriginalDisplay;
    }
    if (Object.prototype.hasOwnProperty.call(commentElement.dataset, "bbvtCommentOriginalVisibility")) {
        commentElement.style.visibility = commentElement.dataset.bbvtCommentOriginalVisibility;
    } else {
        commentElement.style.visibility = "";
    }

    if (keepBlockState) {
        return;
    }

    delete commentElement.dataset.bbvtCommentBlocked;
    delete commentElement.dataset.bbvtCommentBlockReason;
    delete commentElement.dataset.bbvtCommentBlockMode;
    delete commentElement.dataset.bbvtCommentOriginalDisplay;
    delete commentElement.dataset.bbvtCommentOriginalVisibility;
}

function rememberCommentOriginalStyles(commentElement) {
    if (!Object.prototype.hasOwnProperty.call(commentElement.dataset, "bbvtCommentOriginalDisplay")) {
        commentElement.dataset.bbvtCommentOriginalDisplay = commentElement.style.display || "";
    }
    if (!Object.prototype.hasOwnProperty.call(commentElement.dataset, "bbvtCommentOriginalVisibility")) {
        commentElement.dataset.bbvtCommentOriginalVisibility = commentElement.style.visibility || "";
    }
}

function hideCommentElement(commentElement) {
    commentElement.style.display = "none";
    commentElement.style.visibility = "";
}

function hideCommentElementForOverlay(commentElement) {
    commentElement.style.visibility = "hidden";
}

function peekCommentElement(commentElement, overlay) {
    if (commentElement.dataset.bbvtCommentBlockMode === "hide") {
        return;
    }

    commentElement.dataset.bbvtCommentFilterPeeking = "true";
    overlay.dataset.bbvtCommentFilterPeeking = "true";
    showCommentElement(commentElement, { keepBlockState: true });
}

function endCommentOverlayPeek(commentElement, overlay) {
    if (!isCommentPeeking(commentElement)) {
        return;
    }

    clearCommentPeekState(commentElement, overlay);
    if (commentElement.dataset.bbvtCommentBlocked === "true") {
        hideCommentElementForOverlay(commentElement);
    }
}

function clearCommentPeekState(commentElement, overlay = commentFilterOverlays.get(commentElement)) {
    delete commentElement.dataset.bbvtCommentFilterPeeking;
    if (overlay) {
        delete overlay.dataset.bbvtCommentFilterPeeking;
    }
}

function isCommentPeeking(commentElement) {
    return commentElement.dataset.bbvtCommentFilterPeeking === "true";
}

function getCommentBypassKey(commentElement, blockResult) {
    return String(blockResult.commentKey || commentElement.dataset.bbvtCommentKey || "").trim();
}

function injectCommentFilterStyles(commentElement) {
    const css = `
        .bbvt-comment-filter-overlay {
            display: block;
            box-sizing: border-box;
            color: rgb(245, 245, 245);
            font-size: 12px;
            line-height: 1.45;
            overflow: hidden;
        }

        .bbvt-comment-filter-overlay-veil {
            position: absolute;
            inset: 0;
            box-sizing: border-box;
            border: 1px solid rgba(0, 174, 236, 0.28);
            border-radius: 8px;
            background: rgba(28, 32, 36, 0.88);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            transition: opacity 0.16s ease, background 0.16s ease, border-color 0.16s ease;
        }

        .bbvt-comment-filter-overlay[data-bbvt-comment-filter-mode="hidden"][data-bbvt-comment-filter-peeking="true"] .bbvt-comment-filter-overlay-veil {
            opacity: 0;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
        }

        .bbvt-comment-filter-overlay-body {
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 6px;
            max-width: calc(100% - 16px);
            box-sizing: border-box;
            padding: 5px 7px;
            border: 1px solid rgba(0, 174, 236, 0.32);
            border-radius: 7px;
            background: rgba(25, 29, 34, 0.9);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
        }

        .bbvt-comment-filter-overlay-text {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: rgba(245, 245, 245, 0.92);
        }

        .bbvt-comment-filter-reason-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            max-width: min(520px, 100%);
            padding: 3px 6px 3px 8px;
            border: 1px solid rgba(0, 174, 236, 0.36);
            border-radius: 999px;
            background: rgba(0, 174, 236, 0.18);
            color: rgb(255, 255, 255);
        }

        .bbvt-comment-filter-reason-label {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .bbvt-comment-filter-reason-remove {
            width: 16px;
            height: 16px;
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.22);
            color: rgb(255, 255, 255);
            font-size: 13px;
            line-height: 1;
            cursor: pointer;
        }

        .bbvt-comment-filter-reason-remove:hover {
            background: rgba(0, 174, 236, 0.82);
        }
    `;

    const root = commentElement?.getRootNode?.() || document;
    const styleHost = root?.head || root;
    if (!styleHost?.appendChild) {
        return;
    }

    const existingStyle = root.getElementById?.("bbvtCommentFilterStyles") ||
        root.querySelector?.("#bbvtCommentFilterStyles");
    if (existingStyle) {
        if (existingStyle.textContent !== css) {
            existingStyle.textContent = css;
        }
        return;
    }

    const style = document.createElement("style");
    style.id = "bbvtCommentFilterStyles";
    style.textContent = css;
    styleHost.appendChild(style);
}

function isHiddenOrOverlayed(videoElement) {
    return isVideoElementHidden(videoElement) || hasBlockedOverlay(videoElement) || videoElement.dataset.bbvtBlocked === "true";
}

function hasBlockedOverlay(videoElement) {
    return Boolean(videoElement.querySelector(":scope > .blockedOverlay"));
}

function removeAllOverlaysFromVideo(videoElement) {
    videoElement.querySelectorAll(":scope > .blockedOverlay").forEach((overlay) => {
        overlay.remove();
    });
}

function isVideoElementHidden(videoElement) {
    if (videoElement.style.display == "none") {
        return true;
    }

    if (window.location.href.startsWith("https://search.bilibili.com/") && videoElement.parentNode?.style.display == "none") {
        return true;
    }

    const divFeedCard = videoElement.closest("div.feed-card");
    if (divFeedCard?.style.display == "none") {
        return true;
    }

    const divBiliFeedCard = videoElement.closest("div.bili-feed-card");
    return divBiliFeedCard?.style.display == "none";
}

function removeOverlayOnly(videoElement) {
    removeAllOverlaysFromVideo(videoElement);
}

function markBlockedElement(videoElement, state) {
    videoElement.dataset.bbvtBlocked = state;
}

function clearBlockedElement(videoElement) {
    delete videoElement.dataset.bbvtBlocked;
}

function addHiddenOrOverlay(videoElement, videoInfo, settings, setTimeoutStatus = false, heatLevel = 0, videoContext = null) {
    if (settings.hideVideoMode_Switch == true) {
        hideVideoElement(videoElement);
        return;
    }

    if (videoElement.firstElementChild?.className == "card-box" && setTimeoutStatus == false) {
        videoElement.style.filter = "blur(5px)";
        markBlockedElement(videoElement, "pending");

        const generation = blockedOverlayGeneration;
        setTimeout(() => {
            if (generation !== blockedOverlayGeneration) {
                return;
            }

            if (videoElement.dataset.bbvtBlocked !== "pending") {
                return;
            }

            addHiddenOrOverlay(videoElement, videoInfo, settings, true, heatLevel, videoContext);
            videoElement.style.filter = "none";
        }, 3000);

        return;
    }

    const elementRect = videoElement.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "blockedOverlay";
    overlay.style.position = "absolute";
    overlay.style.width = elementRect.width + "px";
    overlay.style.height = elementRect.height + "px";
    overlay.style.backgroundColor = heatColors[heatLevel];
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "10";
    overlay.style.backdropFilter = "blur(6px)";
    overlay.style.borderRadius = "6px";
    overlay.style.cursor = "pointer";

    overlay.style.transition = "opacity 0.2s ease";

    videoElement.addEventListener("mouseenter", () => {
        if (overlay.parentNode === videoElement) {
            overlay.style.opacity = "0";
            overlay.style.pointerEvents = "none";
        }
    });

    videoElement.addEventListener("mouseleave", () => {
        if (overlay.parentNode === videoElement) {
            overlay.style.opacity = "1";
            overlay.style.pointerEvents = "auto";
        }
    });

    const overlayText = document.createElement("div");
    if (videoElement.firstElementChild?.className == "card-box") {
        overlayText.style.fontSize = "1.25em";
    }
    overlayText.innerText = videoInfo.triggeredBlockedRules?.[0] || "";
    overlayText.style.color = "rgb(250,250,250)";
    overlay.appendChild(overlayText);

    videoElement.insertAdjacentElement("afterbegin", overlay);
    markBlockedElement(videoElement, "true");
}

function removeHiddenOrOverlay(videoElement, settings) {
    videoElement.style.filter = "none";

    if (settings?.hideVideoMode_Switch == true) {
        showVideoElement(videoElement);
        clearBlockedElement(videoElement);
        return;
    }

    removeAllOverlaysFromVideo(videoElement);
    clearBlockedElement(videoElement);
}

function hideVideoElement(videoElement) {
    markBlockedElement(videoElement, "true");
    if (window.location.href.startsWith("https://search.bilibili.com/")) {
        videoElement.parentNode.style.display = "none";
        videoElement.style.display = "none";
    }

    const divFeedCard = videoElement.closest("div.feed-card");
    if (divFeedCard !== null) {
        divFeedCard.style.display = "none";
        videoElement.style.display = "none";
        return;
    }

    const divBiliFeedCard = videoElement.closest("div.bili-feed-card");
    if (divBiliFeedCard !== null) {
        divBiliFeedCard.style.display = "none";
        videoElement.style.display = "none";
        return;
    }

    videoElement.style.display = "none";
}

const heatColors = [
    "rgba(60, 60, 60, 0.7)",
    "rgba(50, 50, 50, 0.75)",
    "rgba(40, 40, 40, 0.8)",
    "rgba(30, 30, 30, 0.85)",
    "rgba(20, 20, 20, 0.9)",
    "rgba(10, 10, 10, 0.95)",
];

function computeHeatLevel(ruleKeys, statsData) {
    const total = Object.values(statsData).reduce((s, v) => s + v, 0);
    const base = Math.max(1, Math.ceil(total / 50));
    const thresholds = [base, base * 3, base * 8, base * 20, base * 50];
    const maxCount = Math.max(0, ...ruleKeys.map((k) => statsData[k] || 0));
    for (let i = 4; i >= 0; i--) {
        if (maxCount >= thresholds[i]) return i + 1;
    }
    return 0;
}

function showVideoElement(videoElement) {
    clearBlockedElement(videoElement);
    if (window.location.href.startsWith("https://search.bilibili.com/")) {
        videoElement.parentNode.style.display = "";
        videoElement.style.display = "";
    }

    const divFeedCard = videoElement.closest("div.feed-card");
    if (divFeedCard !== null) {
        divFeedCard.style.display = "";
        videoElement.style.display = "";
        return;
    }

    const divBiliFeedCard = videoElement.closest("div.bili-feed-card");
    if (divBiliFeedCard !== null) {
        divBiliFeedCard.style.display = "";
        videoElement.style.display = "";
        return;
    }

    videoElement.style.display = "";
}

function findTrendingMatch(text, patterns, useRegular) {
    if (!patterns || patterns.length === 0) return null;
    return patterns.find((pattern) => {
        if (useRegular) {
            return safeRegexTest(pattern, text);
        }
        return pattern === text;
    }) || null;
}

function applyTrendingBlock(trendingItem, hitText, settings) {
    trendingItem.dataset.bbvtTrendingBlocked = "true";

    if (settings.hideVideoMode_Switch) {
        trendingItem.style.display = "none";
        return;
    }

    const elementRect = trendingItem.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "blockedOverlay";
    overlay.style.position = "absolute";
    overlay.style.width = elementRect.width + "px";
    overlay.style.height = elementRect.height + "px";
    overlay.style.transform = "translateX(-16px)";
    overlay.style.backgroundColor = "rgba(60, 60, 60, 0.85)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "10";
    overlay.style.backdropFilter = "blur(6px)";
    overlay.style.borderRadius = "6px";

    const overlayText = document.createElement("div");
    overlayText.innerText = hitText;
    overlayText.style.color = "rgb(250,250,250)";
    overlay.appendChild(overlayText);

    trendingItem.insertAdjacentElement("afterbegin", overlay);
}

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

        renderCommentBlockedState(commentElement, blockResult) {
            if (!blockResult.blocked) {
                restoreCommentElement(commentElement, { commentKey: blockResult.commentKey });
                return false;
            }

            if (isCommentBypassed(commentElement, blockResult)) {
                revealCommentElement(commentElement, blockResult);
                return false;
            }

            return blockCommentElement(commentElement, blockResult);
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

const commentFilterPlaceholders = new WeakMap();
const commentFilterBypassKeys = new Set();

function blockCommentElement(commentElement, blockResult) {
    injectCommentFilterStyles();

    const reason = blockResult.reason || blockResult.type || "命中评论规则";
    const commentKey = getCommentBypassKey(commentElement, blockResult);
    const wasBlocked = commentElement.dataset.bbvtCommentBlocked === "true";
    const previousReason = commentElement.dataset.bbvtCommentBlockReason || "";

    if (commentKey) {
        commentElement.dataset.bbvtCommentKey = commentKey;
    }

    ensureCommentPlaceholder(commentElement, { reason, commentKey }, "hidden");

    if (!Object.prototype.hasOwnProperty.call(commentElement.dataset, "bbvtCommentOriginalDisplay")) {
        commentElement.dataset.bbvtCommentOriginalDisplay = commentElement.style.display || "";
    }

    commentElement.style.display = "none";
    commentElement.dataset.bbvtCommentBlocked = "true";
    commentElement.dataset.bbvtCommentBlockReason = reason;

    return !wasBlocked || previousReason !== reason;
}

function revealCommentElement(commentElement, blockResult) {
    injectCommentFilterStyles();

    const reason = blockResult.reason || blockResult.type || commentElement.dataset.bbvtCommentBlockReason || "命中评论规则";
    const commentKey = getCommentBypassKey(commentElement, blockResult);
    showCommentElement(commentElement);
    if (commentKey) {
        commentFilterBypassKeys.add(commentKey);
        commentElement.dataset.bbvtCommentKey = commentKey;
    }
    commentElement.dataset.bbvtCommentFilterBypass = "true";
    ensureCommentPlaceholder(commentElement, { reason, commentKey }, "revealed");
}

function ensureCommentPlaceholder(commentElement, { reason, commentKey = "" }, mode) {
    if (!commentElement.parentNode) {
        return;
    }

    let placeholder = commentFilterPlaceholders.get(commentElement);
    if (!placeholder || !placeholder.parentNode) {
        placeholder = findReusableCommentPlaceholder(commentElement, commentKey);
        if (!placeholder) {
            placeholder = document.createElement("div");
            placeholder.className = "bbvt-comment-filter-placeholder";
            placeholder.dataset.bbvtCommentFilterPlaceholder = "true";
            applyCommentPlaceholderStyles(placeholder);
        }
        commentFilterPlaceholders.set(commentElement, placeholder);
        commentElement.parentNode.insertBefore(placeholder, commentElement);
    }

    placeholder.dataset.bbvtCommentKey = commentKey || "";
    removeDuplicateCommentPlaceholders(commentElement, placeholder, commentKey);
    placeholder.replaceChildren();
    const text = document.createElement("span");
    text.textContent = mode === "revealed"
        ? `已临时显示：${reason}`
        : `已隐藏评论：${reason}`;

    const actions = document.createElement("div");
    actions.className = "bbvt-comment-filter-actions";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.textContent = mode === "revealed" ? "重新隐藏" : "显示";
    applyCommentPlaceholderButtonStyles(toggleButton);
    toggleButton.addEventListener("mousedown", stopCommentPlaceholderEvent);
    toggleButton.addEventListener("click", (event) => {
        stopCommentPlaceholderEvent(event);
        if (mode === "revealed") {
            if (commentKey) {
                commentFilterBypassKeys.delete(commentKey);
            }
            delete commentElement.dataset.bbvtCommentFilterBypass;
            blockCommentElement(commentElement, { reason, commentKey });
            return;
        }

        revealCommentElement(commentElement, { reason, commentKey });
    });

    actions.append(toggleButton);
    placeholder.append(text, actions);
}

function findReusableCommentPlaceholder(commentElement, commentKey) {
    if (!commentKey || !commentElement.parentNode?.querySelectorAll) {
        return null;
    }

    return [...commentElement.parentNode.querySelectorAll(".bbvt-comment-filter-placeholder")]
        .find((placeholder) => placeholder.dataset?.bbvtCommentKey === commentKey) || null;
}

function removeDuplicateCommentPlaceholders(commentElement, currentPlaceholder, commentKey) {
    if (!commentKey || !commentElement.parentNode?.querySelectorAll) {
        return;
    }

    commentElement.parentNode
        .querySelectorAll(".bbvt-comment-filter-placeholder")
        .forEach((placeholder) => {
            if (placeholder !== currentPlaceholder && placeholder.dataset?.bbvtCommentKey === commentKey) {
                placeholder.remove();
            }
        });
}

function removeCommentPlaceholdersForKey(commentElement, currentPlaceholder, commentKey) {
    if (!commentKey || !commentElement.parentNode?.querySelectorAll) {
        return;
    }

    commentElement.parentNode
        .querySelectorAll(".bbvt-comment-filter-placeholder")
        .forEach((placeholder) => {
            if (placeholder === currentPlaceholder || placeholder.dataset?.bbvtCommentKey === commentKey) {
                placeholder.remove();
            }
        });
}

function stopCommentPlaceholderEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
}

function applyCommentPlaceholderStyles(placeholder) {
    Object.assign(placeholder.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        boxSizing: "border-box",
        margin: "8px 0",
        padding: "9px 12px",
        border: "1px solid rgba(0, 174, 236, 0.22)",
        borderRadius: "8px",
        background: "rgba(0, 174, 236, 0.08)",
        color: "rgb(80, 80, 80)",
        fontSize: "12px",
        lineHeight: "1.45",
    });
}

function applyCommentPlaceholderButtonStyles(button) {
    Object.assign(button.style, {
        flex: "0 0 auto",
        border: "0",
        borderRadius: "6px",
        background: "rgba(0, 174, 236, 0.16)",
        color: "rgb(0, 120, 180)",
        padding: "4px 9px",
        cursor: "pointer",
        fontSize: "12px",
    });
}

function restoreCommentElement(commentElement, { keepBypass = false, commentKey: restoreCommentKey = "" } = {}) {
    const commentKey = getCommentBypassKey(commentElement, { commentKey: restoreCommentKey });
    const placeholder = commentFilterPlaceholders.get(commentElement);
    if (placeholder?.parentNode) {
        placeholder.remove();
    }
    removeCommentPlaceholdersForKey(commentElement, placeholder, commentKey);
    commentFilterPlaceholders.delete(commentElement);

    showCommentElement(commentElement);

    if (!keepBypass) {
        if (commentKey) {
            commentFilterBypassKeys.delete(commentKey);
        }
        delete commentElement.dataset.bbvtCommentFilterBypass;
        delete commentElement.dataset.bbvtCommentKey;
    }
}

function showCommentElement(commentElement) {
    if (Object.prototype.hasOwnProperty.call(commentElement.dataset, "bbvtCommentOriginalDisplay")) {
        commentElement.style.display = commentElement.dataset.bbvtCommentOriginalDisplay;
    }

    delete commentElement.dataset.bbvtCommentBlocked;
    delete commentElement.dataset.bbvtCommentBlockReason;
    delete commentElement.dataset.bbvtCommentOriginalDisplay;
}

function isCommentBypassed(commentElement, blockResult) {
    const commentKey = getCommentBypassKey(commentElement, blockResult);
    return commentElement.dataset.bbvtCommentFilterBypass === "true" ||
        Boolean(commentKey && commentFilterBypassKeys.has(commentKey));
}

function getCommentBypassKey(commentElement, blockResult) {
    return String(blockResult.commentKey || commentElement.dataset.bbvtCommentKey || "").trim();
}

function injectCommentFilterStyles() {
    if (document.getElementById("bbvtCommentFilterStyles")) {
        return;
    }

    const css = `
        .bbvt-comment-filter-placeholder {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            box-sizing: border-box;
            margin: 8px 0;
            padding: 9px 12px;
            border: 1px solid rgba(0, 174, 236, 0.22);
            border-radius: 8px;
            background: rgba(0, 174, 236, 0.08);
            color: rgb(80, 80, 80);
            font-size: 12px;
            line-height: 1.45;
        }

        .bbvt-comment-filter-placeholder button {
            flex: 0 0 auto;
            border: 0;
            border-radius: 6px;
            background: rgba(0, 174, 236, 0.16);
            color: rgb(0, 120, 180);
            padding: 4px 9px;
            cursor: pointer;
            font-size: 12px;
        }

        .bbvt-comment-filter-placeholder button:hover {
            background: rgba(0, 174, 236, 0.28);
        }

        .bbvt-comment-filter-actions {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex: 0 0 auto;
        }
    `;

    if (typeof GM_addStyle === "function") {
        GM_addStyle(css);
        return;
    }

    const style = document.createElement("style");
    style.id = "bbvtCommentFilterStyles";
    style.textContent = css;
    document.head.appendChild(style);
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

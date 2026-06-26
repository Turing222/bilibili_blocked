import {
    appendBlockedCommentTexts,
    appendBlockedCommentUser,
} from "../settings/mutations.js";
import { getKeywordCandidates } from "../utils/keyword-candidates.js";
import {
    collectSelectedKeywords,
    hasQuickBlockSelection,
    renderMultiSelectChips,
} from "../utils/multi-select-chips.js";
import { isMasterSwitchEnabled } from "../utils/script-enabled.js";
import { setButtonIcon } from "../ui/icons.js";

const triggerId = "bbvtCommentQuickBlockTrigger";
const targetMarkerId = "bbvtCommentQuickBlockTargetMarker";
const popupId = "bbvtCommentQuickBlockPopup";
const styleId = "bbvtCommentQuickBlockStyles";
const maxQuickBlockTextLength = 160;
const minRepeatedFullTextLength = 4;

const commentQuickBlockStates = new WeakMap();
let hideTriggerTimer = null;
let popupCloseHandler = null;
let activeTargetCommentElement = null;
let targetMarkerListenersBound = false;
let targetPositionFrame = null;

export function dismissCommentQuickBlockUi() {
    closeCommentQuickBlockPopup();
    hideCommentQuickBlockTrigger();
    clearHideTriggerTimer();
}

export function mountCommentQuickBlock(context, commentElement, commentInfo) {
    if (!canUseDom() || !context?.settingsStore || !commentElement) {
        return;
    }

    const normalizedInfo = normalizeCommentInfo(commentInfo);
    if (!normalizedInfo.text && !getCommentUserRule(normalizedInfo)) {
        return;
    }

    injectCommentQuickBlockStyles();

    let state = commentQuickBlockStates.get(commentElement);
    if (!state) {
        state = {
            context,
            commentInfo: normalizedInfo,
        };
        commentQuickBlockStates.set(commentElement, state);
        commentElement.addEventListener("mouseenter", () => showCommentQuickBlockTrigger(commentElement));
        commentElement.addEventListener("mouseleave", scheduleHideTrigger);
        commentElement.addEventListener("focusin", () => showCommentQuickBlockTrigger(commentElement));
        commentElement.addEventListener("focusout", scheduleHideTrigger);
    }

    state.context = context;
    state.commentInfo = normalizedInfo;
}

function showCommentQuickBlockTrigger(commentElement) {
    const state = commentQuickBlockStates.get(commentElement);
    if (!state || commentElement.style.display === "none" || isCommentFilterManaged(commentElement)) {
        hideCommentQuickBlockTrigger();
        return;
    }

    if (!isMasterSwitchEnabled(state.context)) {
        hideCommentQuickBlockTrigger();
        return;
    }

    clearHideTriggerTimer();
    const trigger = ensureCommentQuickBlockTrigger();
    trigger.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCommentQuickBlockPopup(state.context, commentElement, state.commentInfo, event.clientX, event.clientY);
    };

    if (!positionTrigger(trigger, commentElement)) {
        clearCommentQuickBlockTarget();
        return;
    }
    markCommentQuickBlockTarget(commentElement);
    trigger.hidden = false;
}

function isCommentFilterManaged(commentElement) {
    return commentElement.dataset?.bbvtCommentBlocked === "true" ||
        commentElement.dataset?.bbvtCommentFilterPeeking === "true";
}

function ensureCommentQuickBlockTrigger() {
    let trigger = document.getElementById(triggerId);
    if (trigger) {
        return trigger;
    }

    trigger = document.createElement("button");
    trigger.id = triggerId;
    trigger.type = "button";
    trigger.title = "快速屏蔽这条评论";
    setButtonIcon(trigger, "shield", "快速屏蔽这条评论", "屏蔽");
    trigger.hidden = true;
    trigger.addEventListener("mouseenter", clearHideTriggerTimer);
    trigger.addEventListener("mouseleave", scheduleHideTrigger);
    trigger.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    document.body.appendChild(trigger);
    return trigger;
}

function positionTrigger(trigger, commentElement) {
    const rect = commentElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 800;
    if (
        commentElement.isConnected === false ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom < 0 ||
        rect.top > viewportHeight
    ) {
        trigger.hidden = true;
        return false;
    }

    trigger.style.visibility = "hidden";
    trigger.hidden = false;

    const margin = 8;
    const triggerWidth = trigger.offsetWidth || 48;
    const triggerHeight = trigger.offsetHeight || 26;
    const left = clamp(rect.right - triggerWidth - margin, margin, viewportWidth - triggerWidth - margin) + getPageScrollX();
    const top = clamp(rect.top + 6, margin, viewportHeight - triggerHeight - margin) + getPageScrollY();

    trigger.style.left = `${left}px`;
    trigger.style.top = `${top}px`;
    trigger.style.visibility = "";
    return true;
}

function scheduleHideTrigger() {
    if (document.getElementById(popupId)) {
        return;
    }

    clearHideTriggerTimer();
    hideTriggerTimer = setTimeout(hideCommentQuickBlockTrigger, 180);
}

function clearHideTriggerTimer() {
    if (hideTriggerTimer) {
        clearTimeout(hideTriggerTimer);
        hideTriggerTimer = null;
    }
}

function hideCommentQuickBlockTrigger() {
    const trigger = document.getElementById(triggerId);
    if (trigger) {
        trigger.hidden = true;
    }
    clearCommentQuickBlockTarget();
}

function openCommentQuickBlockPopup(context, commentElement, commentInfo, x, y) {
    if (!isMasterSwitchEnabled(context)) {
        dismissCommentQuickBlockUi();
        return;
    }

    closeCommentQuickBlockPopup();
    clearHideTriggerTimer();
    markCommentQuickBlockTarget(commentElement);

    const initialText = getInitialQuickBlockText(commentElement);
    const fullText = getFullQuickBlockText(commentInfo.text);
    const userRule = getCommentUserRule(commentInfo);
    const keywordCandidates = getKeywordCandidates(commentInfo.text || initialText);
    const selectedKeywords = new Set();
    if (!initialText && !fullText && keywordCandidates.length === 0 && !userRule) {
        return;
    }

    const popup = document.createElement("div");
    popup.id = popupId;

    const panel = document.createElement("div");
    panel.className = "bbvt-comment-qb-panel";

    const header = document.createElement("div");
    header.className = "bbvt-comment-qb-header";
    const title = document.createElement("span");
    title.textContent = "快速屏蔽评论";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "bbvt-comment-qb-icon-btn";
    setButtonIcon(closeButton, "close", "关闭快速屏蔽评论");
    closeButton.addEventListener("click", closeCommentQuickBlockPopup);
    header.append(title, closeButton);

    const candidates = document.createElement("div");
    candidates.className = "bbvt-comment-qb-candidates";

    const input = document.createElement("textarea");
    input.className = "bbvt-comment-qb-input";
    input.rows = 2;
    input.maxLength = maxQuickBlockTextLength;
    input.value = initialText;
    input.placeholder = "输入额外关键词（可选）";

    const actions = document.createElement("div");
    actions.className = "bbvt-comment-qb-actions";
    const userButton = document.createElement("button");
    userButton.type = "button";
    userButton.className = "bbvt-comment-qb-secondary";
    setButtonIcon(userButton, "userX", "屏蔽评论用户", "屏蔽用户");
    userButton.hidden = !userRule;
    userButton.title = formatCommentUserLabel(commentInfo);
    userButton.addEventListener("click", () => {
        if (!userRule) {
            return;
        }

        appendBlockedCommentUser(context.settingsStore, userRule);
        context.refresh?.();
        closeCommentQuickBlockPopup();
        hideCommentQuickBlockTrigger();
    });
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "bbvt-comment-qb-primary";
    setButtonIcon(confirmButton, "shield", "屏蔽评论内容", "屏蔽内容");
    const fullTextButton = document.createElement("button");
    fullTextButton.type = "button";
    fullTextButton.className = "bbvt-comment-qb-secondary";
    setButtonIcon(fullTextButton, "shield", "屏蔽整条评论文本", "屏蔽全文");
    fullTextButton.hidden = !fullText;
    fullTextButton.addEventListener("click", () => {
        if (!fullText) {
            return;
        }

        appendBlockedCommentTexts(context.settingsStore, [fullText]);
        context.refresh?.();
        closeCommentQuickBlockPopup();
        hideCommentQuickBlockTrigger();
    });
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "bbvt-comment-qb-secondary";
    cancelButton.textContent = "取消";
    cancelButton.addEventListener("click", closeCommentQuickBlockPopup);

    const updateConfirmState = () => {
        confirmButton.disabled = !hasQuickBlockSelection(selectedKeywords, input.value);
    };
    renderMultiSelectChips(candidates, keywordCandidates, selectedKeywords, {
        chipClass: "bbvt-comment-qb-chip",
        selectedClass: "bbvt-comment-qb-chip-selected",
        hintClass: "bbvt-comment-qb-hint",
        emptyHint: "无候选词",
        onChange: updateConfirmState,
    });
    input.addEventListener("input", updateConfirmState);
    confirmButton.addEventListener("click", () => {
        const values = collectSelectedKeywords(selectedKeywords, input.value);
        if (values.length === 0) {
            return;
        }

        appendBlockedCommentTexts(context.settingsStore, values);
        context.refresh?.();
        closeCommentQuickBlockPopup();
        hideCommentQuickBlockTrigger();
    });

    actions.append(userButton, fullTextButton, confirmButton, cancelButton);
    panel.append(header, candidates, input, actions);
    popup.appendChild(panel);
    popup.addEventListener("mousedown", (event) => event.stopPropagation());
    document.body.appendChild(popup);

    updateConfirmState();
    positionPopup(popup, x, y);
    if (initialText) {
        input.focus();
        input.select();
    } else if (keywordCandidates.length > 0) {
        candidates.querySelector("button")?.focus();
    } else {
        input.focus();
    }

    popupCloseHandler = (event) => {
        if (!popup.contains(event.target)) {
            closeCommentQuickBlockPopup();
        }
    };
    setTimeout(() => {
        document.addEventListener("mousedown", popupCloseHandler);
    }, 0);
}

function closeCommentQuickBlockPopup() {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.remove();
    }

    if (popupCloseHandler) {
        document.removeEventListener("mousedown", popupCloseHandler);
        popupCloseHandler = null;
    }
    clearCommentQuickBlockTarget();
}

function markCommentQuickBlockTarget(commentElement) {
    if (activeTargetCommentElement === commentElement) {
        positionCommentQuickBlockTargetMarker(commentElement);
        return;
    }

    clearCommentQuickBlockTarget();
    activeTargetCommentElement = commentElement;
    if (activeTargetCommentElement?.dataset) {
        activeTargetCommentElement.dataset.bbvtCommentQuickBlockTarget = "true";
    }
    positionCommentQuickBlockTargetMarker(commentElement);
    bindCommentQuickBlockTargetMarkerListeners();
}

function clearCommentQuickBlockTarget() {
    if (activeTargetCommentElement?.dataset) {
        delete activeTargetCommentElement.dataset.bbvtCommentQuickBlockTarget;
    }
    activeTargetCommentElement = null;
    document.getElementById(targetMarkerId)?.remove();
    cancelCommentQuickBlockTargetPositionUpdate();
    unbindCommentQuickBlockTargetMarkerListeners();
}

function positionCommentQuickBlockTargetMarker(commentElement) {
    const rect = commentElement?.getBoundingClientRect?.();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 800;
    if (
        commentElement?.isConnected === false ||
        !rect ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom < 0 ||
        rect.top > viewportHeight
    ) {
        document.getElementById(targetMarkerId)?.remove();
        return;
    }

    const marker = ensureCommentQuickBlockTargetMarker();
    const margin = 6;
    const left = Math.max(margin, rect.left - 4) + getPageScrollX();
    const top = Math.max(margin, rect.top - 2) + getPageScrollY();
    const width = Math.max(44, rect.width + 8);
    const height = Math.max(28, rect.height + 4);

    marker.style.left = `${left}px`;
    marker.style.top = `${top}px`;
    marker.style.width = `${width}px`;
    marker.style.height = `${height}px`;
}

function ensureCommentQuickBlockTargetMarker() {
    let marker = document.getElementById(targetMarkerId);
    if (marker) {
        return marker;
    }

    marker = document.createElement("div");
    marker.id = targetMarkerId;
    marker.className = "bbvt-comment-qb-target-marker";

    const line = document.createElement("div");
    line.className = "bbvt-comment-qb-target-line";
    marker.appendChild(line);

    document.body.appendChild(marker);
    return marker;
}

function updateCommentQuickBlockTargetMarker() {
    scheduleCommentQuickBlockTargetPositionUpdate();
}

function scheduleCommentQuickBlockTargetPositionUpdate() {
    if (targetPositionFrame !== null) {
        return;
    }

    const update = () => {
        targetPositionFrame = null;
        positionActiveCommentQuickBlockUi();
    };
    if (typeof window.requestAnimationFrame === "function") {
        targetPositionFrame = window.requestAnimationFrame(update);
        return;
    }

    targetPositionFrame = 0;
    update();
}

function cancelCommentQuickBlockTargetPositionUpdate() {
    if (targetPositionFrame === null) {
        return;
    }

    if (targetPositionFrame !== 0 && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(targetPositionFrame);
    }
    targetPositionFrame = null;
}

function positionActiveCommentQuickBlockUi() {
    if (!activeTargetCommentElement || activeTargetCommentElement.isConnected === false) {
        const trigger = document.getElementById(triggerId);
        if (trigger) {
            trigger.hidden = true;
        }
        clearCommentQuickBlockTarget();
        return;
    }

    const trigger = document.getElementById(triggerId);
    if (trigger && !document.getElementById(popupId)) {
        positionTrigger(trigger, activeTargetCommentElement);
    }
    positionCommentQuickBlockTargetMarker(activeTargetCommentElement);
}

function bindCommentQuickBlockTargetMarkerListeners() {
    if (targetMarkerListenersBound) {
        return;
    }

    window.addEventListener?.("scroll", updateCommentQuickBlockTargetMarker, true);
    window.addEventListener?.("resize", updateCommentQuickBlockTargetMarker);
    targetMarkerListenersBound = true;
}

function unbindCommentQuickBlockTargetMarkerListeners() {
    if (!targetMarkerListenersBound) {
        return;
    }

    window.removeEventListener?.("scroll", updateCommentQuickBlockTargetMarker, true);
    window.removeEventListener?.("resize", updateCommentQuickBlockTargetMarker);
    targetMarkerListenersBound = false;
}

function getInitialQuickBlockText(commentElement) {
    const selectedText = getSelectedCommentText(commentElement);
    return truncateQuickBlockText(selectedText);
}

function getFullQuickBlockText(commentText) {
    return truncateQuickBlockText(collapseRepeatedQuickBlockText(commentText));
}

function collapseRepeatedQuickBlockText(value) {
    const text = normalizeQuickBlockText(value);
    if (!text) {
        return "";
    }

    return collapseRepeatedTokenText(text) || collapseRepeatedContinuousText(text) || text;
}

function collapseRepeatedTokenText(text) {
    const tokens = text.split(" ").filter(Boolean);
    if (tokens.length < 2) {
        return "";
    }

    for (let size = 1; size <= Math.floor(tokens.length / 2); size++) {
        if (tokens.length % size !== 0) {
            continue;
        }

        const candidate = tokens.slice(0, size);
        const candidateText = candidate.join(" ");
        if (candidateText.length < minRepeatedFullTextLength) {
            continue;
        }

        const repeated = tokens.every((token, index) => token === candidate[index % size]);
        if (repeated) {
            return candidateText;
        }
    }

    return "";
}

function collapseRepeatedContinuousText(text) {
    if (text.length < minRepeatedFullTextLength * 2) {
        return "";
    }

    for (let size = minRepeatedFullTextLength; size <= Math.floor(text.length / 2); size++) {
        if (text.length % size !== 0) {
            continue;
        }

        const candidate = text.slice(0, size);
        if (candidate.repeat(text.length / size) === text) {
            return candidate;
        }
    }

    return "";
}

function getSelectedCommentText(commentElement) {
    const selection = window.getSelection?.();
    const selectedText = normalizeQuickBlockText(selection?.toString?.() || "");
    if (!selectedText || !selection?.rangeCount) {
        return "";
    }

    if (nodeBelongsToComment(selection.anchorNode, commentElement) || nodeBelongsToComment(selection.focusNode, commentElement)) {
        return selectedText;
    }

    return "";
}

function nodeBelongsToComment(node, commentElement) {
    let current = node;
    while (current) {
        if (current === commentElement) {
            return true;
        }

        if (current.parentNode) {
            current = current.parentNode;
            continue;
        }

        const root = current.getRootNode?.();
        if (root?.host && root.host !== current) {
            current = root.host;
            continue;
        }

        break;
    }

    return false;
}

function positionPopup(popup, x, y) {
    const margin = 10;
    const offset = 10;
    const rect = popup.getBoundingClientRect();
    const left = clamp(x + offset, margin, window.innerWidth - rect.width - margin);
    const top = clamp(y + offset, margin, window.innerHeight - rect.height - margin);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

function truncateQuickBlockText(value) {
    return normalizeQuickBlockText(value).slice(0, maxQuickBlockTextLength);
}

function normalizeCommentInfo(commentInfo) {
    if (typeof commentInfo === "string") {
        return {
            text: normalizeQuickBlockText(commentInfo),
            userId: "",
            userName: "",
        };
    }

    return {
        text: normalizeQuickBlockText(commentInfo?.text),
        userId: normalizeQuickBlockText(commentInfo?.userId),
        userName: normalizeQuickBlockText(commentInfo?.userName),
    };
}

function getCommentUserRule(commentInfo) {
    if (commentInfo.userId) {
        return `uid:${commentInfo.userId}`;
    }

    if (commentInfo.userName) {
        return `name:${commentInfo.userName}`;
    }

    return "";
}

function formatCommentUserLabel(commentInfo) {
    if (commentInfo.userName && commentInfo.userId) {
        return `屏蔽评论用户：${commentInfo.userName} (${commentInfo.userId})`;
    }

    return `屏蔽评论用户：${commentInfo.userName || commentInfo.userId}`;
}

function normalizeQuickBlockText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function getPageScrollX() {
    return window.scrollX || window.pageXOffset || document.documentElement?.scrollLeft || document.body?.scrollLeft || 0;
}

function getPageScrollY() {
    return window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
}

function canUseDom() {
    return typeof document === "object" && typeof window === "object" && document.body;
}

function injectCommentQuickBlockStyles() {
    const css = `
        #${triggerId} {
            position: absolute;
            z-index: 2147483646;
            border: 0;
            border-radius: 6px;
            background: rgba(18, 183, 219, 0.94);
            color: white;
            padding: 4px 9px;
            font-size: 12px;
            line-height: 1.4;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }

        #${triggerId}:hover {
            background: rgb(33, 202, 238);
        }

        #${targetMarkerId} {
            position: absolute;
            z-index: 2147483645;
            pointer-events: none;
            box-sizing: border-box;
            border-radius: 8px;
            border-left: 3px solid rgba(18, 183, 219, 0.95);
            background: rgba(18, 183, 219, 0.08);
            box-shadow:
                inset -42px 0 0 rgba(18, 183, 219, 0.08),
                0 0 0 1px rgba(18, 183, 219, 0.2),
                0 8px 24px rgba(0, 0, 0, 0.12);
        }

        #${targetMarkerId} .bbvt-comment-qb-target-line {
            position: absolute;
            top: 12px;
            right: 10px;
            width: 34px;
            height: 2px;
            border-radius: 999px;
            background: rgba(18, 183, 219, 0.95);
        }

        #${popupId} {
            position: fixed;
            z-index: 2147483647;
            width: 320px;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        }

        #${popupId} .bbvt-comment-qb-panel {
            box-sizing: border-box;
            width: 100%;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            background: rgba(22, 25, 30, 0.96);
            color: rgb(239, 244, 248);
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
        }

        #${popupId} .bbvt-comment-qb-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 13px;
            font-weight: 700;
        }

        #${popupId} .bbvt-comment-qb-icon-btn {
            width: 24px;
            height: 24px;
            padding: 0;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: rgb(205, 214, 224);
            cursor: pointer;
            font-size: 13px;
            line-height: 24px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        #${popupId} .bbvt-comment-qb-icon-btn:hover {
            background: rgba(255, 255, 255, 0.08);
        }

        #${popupId} .bbvt-comment-qb-candidates {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 0 12px 8px;
        }

        #${popupId} .bbvt-comment-qb-hint {
            font-size: 12px;
            color: rgb(142, 154, 168);
        }

        #${popupId} .bbvt-comment-qb-chip {
            display: inline-flex;
            align-items: center;
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 99px;
            background: rgba(255, 255, 255, 0.07);
            color: rgb(196, 205, 214);
            padding: 3px 10px;
            font-size: 11px;
            cursor: pointer;
            font-family: inherit;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${popupId} .bbvt-comment-qb-chip:hover {
            background: rgba(18, 183, 219, 0.16);
            border-color: rgba(18, 183, 219, 0.38);
            color: rgb(91, 213, 237);
        }

        #${popupId} .bbvt-comment-qb-chip-selected {
            background: rgba(18, 183, 219, 0.9);
            border-color: rgba(18, 183, 219, 0.9);
            color: white;
        }

        #${popupId} .bbvt-comment-qb-chip-selected:hover {
            background: rgb(33, 202, 238);
            color: white;
        }

        #${popupId} .bbvt-comment-qb-input {
            display: block;
            box-sizing: border-box;
            width: calc(100% - 24px);
            margin: 0 12px 12px;
            resize: vertical;
            min-height: 68px;
            max-height: 150px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 6px;
            padding: 8px;
            color: rgb(239, 244, 248);
            background: rgba(12, 15, 19, 0.72);
            font-size: 12px;
            line-height: 1.45;
            outline: none;
        }

        #${popupId} .bbvt-comment-qb-input:focus {
            border-color: rgb(18, 183, 219);
            box-shadow: 0 0 0 2px rgba(18, 183, 219, 0.16);
        }

        #${popupId} .bbvt-comment-qb-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 8px;
            padding: 0 12px 12px;
        }

        #${popupId} .bbvt-comment-qb-primary,
        #${popupId} .bbvt-comment-qb-secondary {
            border: 0;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
        }

        #${popupId} .bbvt-comment-qb-primary {
            background: rgb(18, 183, 219);
            color: white;
        }

        #${popupId} .bbvt-comment-qb-primary:hover:not(:disabled) {
            background: rgb(33, 202, 238);
        }

        #${popupId} .bbvt-comment-qb-primary:disabled {
            background: rgb(70, 78, 88);
            color: rgb(132, 143, 155);
            cursor: default;
        }

        #${popupId} .bbvt-comment-qb-secondary {
            background: rgba(255, 255, 255, 0.08);
            color: rgb(215, 222, 229);
        }

        #${popupId} .bbvt-comment-qb-secondary:hover {
            background: rgba(255, 255, 255, 0.14);
        }

        #${triggerId} .bbvt-icon,
        #${popupId} .bbvt-icon {
            width: 13px;
            height: 13px;
            flex: 0 0 auto;
        }
    `;

    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
        if (existingStyle.textContent !== css) {
            existingStyle.textContent = css;
        }
        return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

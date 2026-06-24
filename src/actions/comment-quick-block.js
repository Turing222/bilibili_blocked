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

const triggerId = "bbvtCommentQuickBlockTrigger";
const popupId = "bbvtCommentQuickBlockPopup";
const styleId = "bbvtCommentQuickBlockStyles";
const maxQuickBlockTextLength = 160;

const commentQuickBlockStates = new WeakMap();
let hideTriggerTimer = null;
let popupCloseHandler = null;

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

    positionTrigger(trigger, commentElement);
    trigger.hidden = false;
}

function isCommentFilterManaged(commentElement) {
    return commentElement.dataset?.bbvtCommentBlocked === "true" ||
        commentElement.dataset?.bbvtCommentFilterBypass === "true";
}

function ensureCommentQuickBlockTrigger() {
    let trigger = document.getElementById(triggerId);
    if (trigger) {
        return trigger;
    }

    trigger = document.createElement("button");
    trigger.id = triggerId;
    trigger.type = "button";
    trigger.textContent = "屏蔽";
    trigger.title = "快速屏蔽这条评论";
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
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        trigger.hidden = true;
        return;
    }

    trigger.style.visibility = "hidden";
    trigger.hidden = false;

    const margin = 8;
    const left = clamp(rect.right - trigger.offsetWidth - margin, margin, window.innerWidth - trigger.offsetWidth - margin);
    const top = clamp(rect.top + 6, margin, window.innerHeight - trigger.offsetHeight - margin);

    trigger.style.left = `${left}px`;
    trigger.style.top = `${top}px`;
    trigger.style.visibility = "";
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
}

function openCommentQuickBlockPopup(context, commentElement, commentInfo, x, y) {
    if (!isMasterSwitchEnabled(context)) {
        dismissCommentQuickBlockUi();
        return;
    }

    closeCommentQuickBlockPopup();
    clearHideTriggerTimer();

    const initialText = getInitialQuickBlockText(commentElement, commentInfo.text);
    const userRule = getCommentUserRule(commentInfo);
    const keywordCandidates = getKeywordCandidates(commentInfo.text || initialText);
    const selectedKeywords = new Set();
    if (!initialText && keywordCandidates.length === 0 && !userRule) {
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
    closeButton.textContent = "×";
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
    userButton.textContent = "屏蔽用户";
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
    confirmButton.textContent = "屏蔽内容";
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

    actions.append(userButton, confirmButton, cancelButton);
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
}

function getInitialQuickBlockText(commentElement, commentText) {
    const selectedText = getSelectedCommentText(commentElement);
    return truncateQuickBlockText(selectedText || commentText);
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

function canUseDom() {
    return typeof document === "object" && typeof window === "object" && document.body;
}

function injectCommentQuickBlockStyles() {
    if (document.getElementById(styleId)) {
        return;
    }

    const css = `
        #${triggerId} {
            position: fixed;
            z-index: 2147483646;
            border: 0;
            border-radius: 6px;
            background: rgba(0, 174, 236, 0.92);
            color: white;
            padding: 4px 9px;
            font-size: 12px;
            line-height: 1.4;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
        }

        #${triggerId}:hover {
            background: rgb(0, 190, 255);
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
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.98);
            color: rgb(32, 32, 32);
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
        }

        #${popupId} .bbvt-comment-qb-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
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
            color: rgb(90, 90, 90);
            cursor: pointer;
            font-size: 18px;
            line-height: 24px;
        }

        #${popupId} .bbvt-comment-qb-icon-btn:hover {
            background: rgba(0, 0, 0, 0.07);
        }

        #${popupId} .bbvt-comment-qb-candidates {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 0 12px 8px;
        }

        #${popupId} .bbvt-comment-qb-hint {
            font-size: 12px;
            color: rgb(130, 130, 130);
        }

        #${popupId} .bbvt-comment-qb-chip {
            display: inline-flex;
            align-items: center;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 99px;
            background: rgba(0, 0, 0, 0.05);
            color: rgb(70, 70, 70);
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
            background: rgba(0, 174, 236, 0.12);
            border-color: rgba(0, 174, 236, 0.35);
            color: rgb(0, 120, 180);
        }

        #${popupId} .bbvt-comment-qb-chip-selected {
            background: rgba(0, 174, 236, 0.88);
            border-color: rgba(0, 174, 236, 0.88);
            color: white;
        }

        #${popupId} .bbvt-comment-qb-chip-selected:hover {
            background: rgb(0, 190, 255);
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
            border: 1px solid rgba(0, 0, 0, 0.12);
            border-radius: 6px;
            padding: 8px;
            color: rgb(32, 32, 32);
            background: rgb(255, 255, 255);
            font-size: 12px;
            line-height: 1.45;
            outline: none;
        }

        #${popupId} .bbvt-comment-qb-input:focus {
            border-color: rgb(0, 174, 236);
            box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.14);
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
        }

        #${popupId} .bbvt-comment-qb-primary {
            background: rgb(0, 174, 236);
            color: white;
        }

        #${popupId} .bbvt-comment-qb-primary:hover:not(:disabled) {
            background: rgb(0, 190, 255);
        }

        #${popupId} .bbvt-comment-qb-primary:disabled {
            background: rgb(180, 180, 180);
            cursor: default;
        }

        #${popupId} .bbvt-comment-qb-secondary {
            background: rgba(0, 0, 0, 0.07);
            color: rgb(70, 70, 70);
        }

        #${popupId} .bbvt-comment-qb-secondary:hover {
            background: rgba(0, 0, 0, 0.12);
        }
    `;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

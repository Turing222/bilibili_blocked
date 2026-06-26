// ==UserScript==
// @name            Bilibili Blocked
// @namespace       https://github.com/Turing222/bilibili_blocked
// @version         2.0.0
// @description     按标签、标题、UP 主、分区、统计数据等条件屏蔽 B 站视频卡片；模块化重构版。
// @author          Turing222
// @license         CC-BY-NC-SA-4.0
// @homepageURL     https://github.com/Turing222/bilibili_blocked
// @supportURL      https://github.com/Turing222/bilibili_blocked/issues
// @icon            https://www.bilibili.com/favicon.ico
// @match           https://www.bilibili.com/*
// @match           https://search.bilibili.com/*
// @grant           GM_registerMenuCommand
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_addStyle
// ==/UserScript==

(function () {
"use strict";

// ---- src/settings/mutations.js ----
// == 设置变更动作 ============================================================
//
// 职责：
// - 后续集中管理对屏蔽配置的追加、去重、保存。
// - 给“一键屏蔽”等用户动作提供统一入口。
//
// 当前阶段：
// - 只固定函数名。
// - 不修改 settingsStore。
function appendBlockedTitles(settingsStore, titles) {
    const settings = settingsStore.exportSettings();
    const values = (Array.isArray(titles) ? titles : [titles])
        .map((title) => String(title || "").trim())
        .filter(Boolean)
        .map((title) => (settings.blockedTitle_UseRegular ? escapeRegexLiteral(title) : title));
    if (values.length === 0) {
        return settingsStore.saveSettings(settings);
    }
    settings.blockedTitle_Switch = true;
    settings.blockedTitle_Array = appendUnique(settings.blockedTitle_Array, values);
    return settingsStore.saveSettings(settings);
}
function appendBlockedTitle(settingsStore, title) {
    return appendBlockedTitles(settingsStore, [title]);
}
function appendBlockedUp(settingsStore, upUid) {
    const settings = settingsStore.exportSettings();
    const value = String(upUid || "").trim();
    if (isMutationPlainUid(value)) {
        settings.blockedUpUid_Switch = true;
        settings.blockedUpUid_Array = appendUnique(settings.blockedUpUid_Array, [value]);
        settings.whitelistUpUid_Array = removeItems(settings.whitelistUpUid_Array, [value]);
        settings.whitelistNameOrUid_Array = removeItems(settings.whitelistNameOrUid_Array, [value]);
    } else {
        settings.blockedUpNameKeyword_Switch = true;
        settings.blockedUpNameKeyword_Array = appendUnique(settings.blockedUpNameKeyword_Array, [value]);
    }
    return settingsStore.saveSettings(settings);
}
function appendBlockedTags(settingsStore, tags) {
    const settings = settingsStore.exportSettings();
    settings.blockedTag_Switch = true;
    settings.blockedTag_Array = appendUnique(settings.blockedTag_Array, tags);
    return settingsStore.saveSettings(settings);
}
function appendBlockedPartition(settingsStore, partition) {
    const settings = settingsStore.exportSettings();
    settings.blockedVideoPartitions_Switch = true;
    settings.blockedVideoPartitions_Array = appendUnique(settings.blockedVideoPartitions_Array, [partition]);
    return settingsStore.saveSettings(settings);
}
function appendBlockedCommentTexts(settingsStore, texts) {
    const settings = settingsStore.exportSettings();
    const values = (Array.isArray(texts) ? texts : [texts])
        .map((text) => String(text || "").trim())
        .filter(Boolean)
        .map((text) => (settings.blockedCommentText_UseRegular ? escapeRegexLiteral(text) : text));
    if (values.length === 0) {
        return settingsStore.saveSettings(settings);
    }
    settings.blockedCommentText_Switch = true;
    settings.blockedCommentText_Array = appendUnique(settings.blockedCommentText_Array, values);
    return settingsStore.saveSettings(settings);
}
function appendBlockedCommentText(settingsStore, text) {
    return appendBlockedCommentTexts(settingsStore, [text]);
}
function appendBlockedCommentUser(settingsStore, user) {
    const settings = settingsStore.exportSettings();
    settings.blockedCommentUser_Switch = true;
    settings.blockedCommentUser_Array = appendUnique(settings.blockedCommentUser_Array, [user]);
    return settingsStore.saveSettings(settings);
}
function removeConfigArrayItem(settingsStore, arrayKey, value) {
    const settings = settingsStore.exportSettings();
    if (!Array.isArray(settings[arrayKey])) {
        return settingsStore.saveSettings(settings);
    }

    settings[arrayKey] = removeItems(settings[arrayKey], [value]);
    return settingsStore.saveSettings(settings);
}
function disableFeatureRuleSwitch(settingsStore, switchKey) {
    const settings = settingsStore.exportSettings();
    if (switchKey) {
        settings[switchKey] = false;
    }
    return settingsStore.saveSettings(settings);
}
function appendUnique(currentItems, nextItems) {
    return [...new Set([...(currentItems || []), ...nextItems.filter(Boolean).map(String)])];
}
function removeItems(currentItems, itemsToRemove) {
    const removeSet = new Set((itemsToRemove || []).filter(Boolean).map(String));
    return (currentItems || []).filter((item) => !removeSet.has(String(item)));
}

function escapeRegexLiteral(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function appendWhitelistUp(settingsStore, upUid) {
    const settings = settingsStore.exportSettings();
    const value = String(upUid || "").trim();
    settings.whitelistUpUid_Switch = true;
    settings.whitelistUpUid_Array = appendUnique(settings.whitelistUpUid_Array, [value]);
    settings.blockedUpUid_Array = removeItems(settings.blockedUpUid_Array, [value]);
    settings.blockedNameOrUid_Array = removeItems(settings.blockedNameOrUid_Array, [value]);
    return settingsStore.saveSettings(settings);
}

function isMutationPlainUid(value) {
    return /^\d+$/.test(String(value || "").trim());
}
function appendWhitelistBv(settingsStore, bv) {
    const settings = settingsStore.exportSettings();
    settings.whitelistBv_Switch = true;
    settings.whitelistBv_Array = appendUnique(settings.whitelistBv_Array, [String(bv)]);
    return settingsStore.saveSettings(settings);
}

// ---- src/utils/keyword-candidates.js ----
const genericKeywordWords = new Set([
    "官方",
    "合集",
    "完整版",
    "高清",
    "最新",
    "挑战",
    "视频",
    "直播",
    "录播",
    "剪辑",
    "解说",
    "实况",
    "中字",
    "字幕",
    "搬运",
    "投稿",
    "原创",
    "预告",
    "花絮",
]);function getKeywordCandidates(text) {
    const source = String(text || "").trim();
    if (!source) {
        return [];
    }

    const candidates = [];
    const pushCandidate = (value) => {
        const candidate = normalizeKeywordCandidate(value);
        if (!candidate || candidates.includes(candidate)) {
            return;
        }
        candidates.push(candidate);
    };

    collectBracketedParts(source).forEach(pushCandidate);
    segmentWords(source).forEach(pushCandidate);
    splitByPunctuation(source).forEach(pushCandidate);

    return candidates.slice(0, 8);
}

function collectBracketedParts(text) {
    const parts = [];
    const patterns = [
        /《([^《》]{2,24})》/g,
        /【([^【】]{2,24})】/g,
        /「([^「」]{2,24})」/g,
        /『([^『』]{2,24})』/g,
        /[（(]([^（）()]{2,24})[）)]/g,
        /\[([^\]]{2,24})\]/g,
    ];

    patterns.forEach((pattern) => {
        for (const match of text.matchAll(pattern)) {
            parts.push(match[1]);
        }
    });

    return parts;
}

function segmentWords(text) {
    if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
        return [];
    }

    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    return Array.from(segmenter.segment(text))
        .filter((item) => item.isWordLike)
        .map((item) => item.segment);
}

function splitByPunctuation(text) {
    return text
        .replace(/[《》【】「」『』（）(){}]/g, " ")
        .replace(/\[/g, " ")
        .replace(/\]/g, " ")
        .split(/[|｜/\\,，.。!！?？:：;；、\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeKeywordCandidate(value) {
    const candidate = String(value || "")
        .replace(/^#|#$/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (
        candidate.length < 2 ||
        candidate.length > 24 ||
        genericKeywordWords.has(candidate) ||
        /^\d+$/.test(candidate) ||
        /^BV[a-z0-9]+$/i.test(candidate) ||
        !/[A-Za-z0-9\u4e00-\u9fff]/.test(candidate)
    ) {
        return "";
    }

    return candidate;
}

// ---- src/utils/multi-select-chips.js ----
function renderMultiSelectChips(container, candidates, selectedSet, options = {}) {
    const {
        chipClass = "qb-chip",
        selectedClass = "qb-chip-selected",
        emptyHint = "无候选词",
        hintClass = "qb-hint",
        onChange = null,
    } = options;

    container.replaceChildren();

    if (!Array.isArray(candidates) || candidates.length === 0) {
        const hint = document.createElement("span");
        hint.className = hintClass;
        hint.textContent = emptyHint;
        container.appendChild(hint);
        return;
    }

    candidates.forEach((candidate) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = selectedSet.has(candidate) ? `${chipClass} ${selectedClass}` : chipClass;
        chip.textContent = candidate;
        chip.title = "点击选择/取消";
        chip.addEventListener("click", () => {
            if (selectedSet.has(candidate)) {
                selectedSet.delete(candidate);
                chip.classList.remove(selectedClass);
            } else {
                selectedSet.add(candidate);
                chip.classList.add(selectedClass);
            }
            onChange?.();
        });
        container.appendChild(chip);
    });
}function collectSelectedKeywords(selectedSet, manualValue) {
    const items = [...selectedSet];
    const manual = String(manualValue || "").trim();
    if (manual && !items.includes(manual)) {
        items.push(manual);
    }
    return items;
}function hasQuickBlockSelection(selectedSet, manualValue) {
    return selectedSet.size > 0 || Boolean(String(manualValue || "").trim());
}

// ---- src/utils/script-enabled.js ----
function isMasterSwitchEnabled(context) {
    const settings = context?.settingsStore?.getSettings?.();
    return settings?.scriptEnabled_Switch !== false;
}

// ---- src/ui/icons.js ----
const iconPaths = {
    settings: [
        "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
        "M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12",
    ],
    close: ["M18 6 6 18M6 6l12 12"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
    save: ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"],
    upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"],
    download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"],
    refresh: ["M21 12a9 9 0 0 1-15.5 6.3M3 12A9 9 0 0 1 18.5 5.7M18 3v4h-4M6 21v-4h4"],
    eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z", "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6"],
    code: ["M16 18l6-6-6-6M8 6l-6 6 6 6"],
    chart: ["M3 3v18h18M7 16v-5M12 16V8M17 16v-9"],
    plus: ["M12 5v14M5 12h14"],
    trash: ["M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"],
    userX: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8M17 8l5 5M22 8l-5 5"],
    tag: ["M20.5 13.5 13.5 20.5a2 2 0 0 1-2.8 0L3 12.8V3h9.8l7.7 7.7a2 2 0 0 1 0 2.8zM7.5 7.5h.01"],
};
function setButtonIcon(button, iconName, label, text = "") {
    if (!button) {
        return;
    }

    button.textContent = "";
    button.appendChild(createIcon(iconName));

    if (text) {
        const labelElement = document.createElement("span");
        labelElement.className = "bbvt-icon-label";
        labelElement.textContent = text;
        button.appendChild(labelElement);
    }

    if (label && !button.title) {
        button.title = label;
    }
    button.setAttribute?.("aria-label", label || text || iconName);
}
function createIcon(iconName) {
    if (typeof document.createElementNS !== "function") {
        const fallback = document.createElement("span");
        fallback.className = "bbvt-icon";
        fallback.setAttribute?.("aria-hidden", "true");
        return fallback;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "bbvt-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const paths = iconPaths[iconName] || iconPaths.shield;
    paths.forEach((pathData) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        svg.appendChild(path);
    });

    return svg;
}

// ---- src/actions/quick-block.js ----
const quickBlockId = "bbvtQuickBlock";function closeQuickBlockOverlay() {
    const existing = document.getElementById(quickBlockId);
    if (existing) {
        existing.remove();
    }

    if (window.bbvtQuickBlockCloseHandler) {
        document.removeEventListener("mousedown", window.bbvtQuickBlockCloseHandler);
        window.bbvtQuickBlockCloseHandler = null;
    }
}function quickBlockVideo(context, videoBv, videoElement, x = 0, y = 0) {
    if (!isMasterSwitchEnabled(context)) {
        return;
    }

    closeQuickBlockOverlay();

    injectQuickBlockStyles();

    const videoInfo = context.videoStore.getVideoInfo(videoBv) || {};
    const titleCandidates = getKeywordCandidates(videoInfo.videoTitle || "");
    const state = {
        upValue: videoInfo.videoUpUid || videoInfo.videoUpName || "",
        upDisplayText: getUpDisplayText(videoInfo),
        titleValue: titleCandidates[0] || "",
        titleCandidates,
        selectedTitleChips: new Set(),
        selectedTags: new Set(),
        partitionName: videoInfo.videoPartitions || "",
        partitionId: videoInfo.videoPartitionId || "",
        partitionLoading: !videoInfo.videoPartitions,
        tags: [],
        tagsLoading: true,
        x,
        y,
        animated: false,
    };

    const overlay = createQuickBlockEl("div", "");
    overlay.id = quickBlockId;
    overlay._videoBv = videoBv;
    overlay._videoElement = videoElement;
    document.body.appendChild(overlay);

    const closeHandler = (e) => {
        if (!overlay.contains(e.target)) {
            overlay.remove();
            document.removeEventListener("mousedown", closeHandler);
        }
    };
    window.bbvtQuickBlockCloseHandler = closeHandler;

    setTimeout(() => {
        document.addEventListener("mousedown", closeHandler);
    }, 0);

    renderQuickBlockPopup(overlay, context, state, videoBv, videoElement);

    if (state.partitionLoading) {
        context.apiClient
            .ensurePartitionData(videoBv, context.videoStore, { bypassBlockedSkip: true })
            .then((partition) => {
                if (!overlay.parentNode) {
                    return;
                }
                state.partitionName = partition.name;
                state.partitionId = partition.id;
                state.partitionLoading = false;
                renderQuickBlockPopup(overlay, context, state, videoBv, videoElement);
            });
    }

    context.apiClient
        .ensureTagsData(videoBv, context.videoStore, { bypassBlockedSkip: true })
        .then((tags) => {
            if (!overlay.parentNode) {
                return;
            }
            state.tags = tags;
            state.tagsLoading = false;
            renderQuickBlockPopup(overlay, context, state, videoBv, videoElement);
        });
}

function renderQuickBlockPopup(overlay, context, state, videoBv, videoElement) {
    if (!overlay._qbRefs) {
        overlay._qbRefs = buildQuickBlockPopupShell(overlay, context, state, videoBv, videoElement);
        positionQuickBlockOverlay(overlay, state, { animate: true });
    }

    syncQuickBlockPartitionSection(overlay._qbRefs, state);
    syncQuickBlockTagsSection(overlay._qbRefs, state);
    positionQuickBlockOverlay(overlay, state, { animate: false });
}

function buildQuickBlockPopupShell(overlay, context, state, videoBv, videoElement) {
    const panel = createQuickBlockEl("div", "qb-panel");

    const header = createQuickBlockEl("div", "qb-header");
    const closeButton = createQuickBlockEl("button", "qb-close", "×");
    setButtonIcon(closeButton, "close", "关闭快速屏蔽");
    closeButton.addEventListener("click", () => overlay.remove());
    header.append(createQuickBlockEl("span", "qb-title", "快速屏蔽"), closeButton);

    const body = createQuickBlockEl("div", "qb-body");

    const upRow = createQuickBlockEl("div", "qb-row qb-action-row");
    upRow.appendChild(createQuickBlockEl("div", "qb-row-label", "UP"));
    const upField = createQuickBlockEl("div", "qb-field");
    const upInput = createQuickBlockEl("input", "qb-input");
    upInput.value = state.upValue;
    upInput.placeholder = "UP UID，或名称关键词";
    upInput.addEventListener("input", () => (state.upValue = upInput.value));
    upField.appendChild(upInput);
    if (state.upDisplayText) {
        upField.appendChild(createQuickBlockEl("div", "qb-subtext", state.upDisplayText));
    }
    const upQuickBtn = createQuickBlockEl("button", "qb-quick-btn", "屏蔽");
    setButtonIcon(upQuickBtn, "userX", "屏蔽 UP", "屏蔽");
    upQuickBtn.disabled = !state.upValue.trim();
    upQuickBtn.addEventListener("click", () => {
        if (!state.upValue.trim()) return;
        commitQuickBlock(context, videoElement, videoBv, () => {
            appendBlockedUp(context.settingsStore, state.upValue.trim());
        });
        overlay.remove();
    });
    upRow.append(upField, upQuickBtn);

    const titleRow = createQuickBlockEl("div", "qb-row qb-action-row qb-title-row");
    titleRow.appendChild(createQuickBlockEl("div", "qb-row-label", "标题"));
    const titleField = createQuickBlockEl("div", "qb-field");
    const titleInput = createQuickBlockEl("input", "qb-input");
    titleInput.value = state.titleValue;
    titleInput.placeholder = "输入标题关键词";
    titleInput.addEventListener("input", () => (state.titleValue = titleInput.value));
    titleField.appendChild(titleInput);

    const candidates = createQuickBlockEl("div", "qb-candidates");
    const titleQuickBtn = createQuickBlockEl("button", "qb-quick-btn", "屏蔽");
    setButtonIcon(titleQuickBtn, "shield", "屏蔽标题关键词", "屏蔽");
    const updateTitleQuickBtn = () => {
        titleQuickBtn.disabled = !hasQuickBlockSelection(state.selectedTitleChips, state.titleValue);
    };
    renderMultiSelectChips(candidates, state.titleCandidates, state.selectedTitleChips, {
        chipClass: "qb-chip qb-chip-action",
        selectedClass: "qb-chip-selected",
        onChange: updateTitleQuickBtn,
    });
    titleField.appendChild(candidates);
    titleInput.addEventListener("input", updateTitleQuickBtn);
    updateTitleQuickBtn();
    titleQuickBtn.addEventListener("click", () => {
        const values = collectSelectedKeywords(state.selectedTitleChips, state.titleValue);
        if (values.length === 0) return;
        commitQuickBlock(context, videoElement, videoBv, () => {
            appendBlockedTitles(context.settingsStore, values);
        });
        overlay.remove();
    });
    titleRow.append(titleField, titleQuickBtn);

    const partitionRow = createQuickBlockEl("div", "qb-row qb-action-row");
    partitionRow.appendChild(createQuickBlockEl("div", "qb-row-label", "分区"));
    const partitionInfo = createQuickBlockEl("div", "qb-info qb-info-muted", "分区加载中...");
    const partitionQuickBtn = createQuickBlockEl("button", "qb-quick-btn", "屏蔽");
    setButtonIcon(partitionQuickBtn, "shield", "屏蔽分区", "屏蔽");
    partitionQuickBtn.addEventListener("click", () => {
        const value = getPartitionBlockValue(state);
        if (!value) return;
        commitQuickBlock(context, videoElement, videoBv, () => {
            appendBlockedPartition(context.settingsStore, value);
        });
        overlay.remove();
    });
    partitionRow.append(partitionInfo, partitionQuickBtn);

    const tagsRow = createQuickBlockEl("div", "qb-row qb-tags-row");
    tagsRow.appendChild(createQuickBlockEl("div", "qb-row-label", "标签"));
    const chipsContainer = createQuickBlockEl("div", "qb-chips");
    const tagsQuickBtn = createQuickBlockEl("button", "qb-quick-btn", "屏蔽");
    setButtonIcon(tagsQuickBtn, "tag", "屏蔽标签", "屏蔽");
    tagsQuickBtn.addEventListener("click", () => {
        const values = [...state.selectedTags];
        if (values.length === 0) return;
        commitQuickBlock(context, videoElement, videoBv, () => {
            appendBlockedTags(context.settingsStore, values);
        });
        overlay.remove();
    });
    tagsRow.append(chipsContainer, tagsQuickBtn);

    body.append(upRow, titleRow, partitionRow, tagsRow);
    panel.append(header, body);
    overlay.appendChild(panel);

    return {
        panel,
        partitionInfo,
        partitionQuickBtn,
        chipsContainer,
        tagsQuickBtn,
    };
}

function syncQuickBlockPartitionSection(refs, state) {
    const { partitionInfo, partitionQuickBtn } = refs;
    const partitionValue = getPartitionBlockValue(state);

    partitionInfo.className = state.partitionLoading ? "qb-info qb-info-muted" : "qb-info";
    partitionInfo.textContent = state.partitionLoading ? "分区加载中..." : getPartitionDisplayText(state);
    partitionQuickBtn.disabled = state.partitionLoading || !partitionValue;
}

function syncQuickBlockTagsSection(refs, state) {
    const { chipsContainer, tagsQuickBtn } = refs;

    chipsContainer.replaceChildren();

    if (state.tagsLoading) {
        chipsContainer.appendChild(createQuickBlockEl("span", "qb-hint", "标签加载中…"));
        tagsQuickBtn.disabled = true;
        return;
    }

    if (state.tags.length === 0) {
        chipsContainer.appendChild(createQuickBlockEl("span", "qb-hint", "无可用标签"));
        tagsQuickBtn.disabled = true;
        return;
    }

    const updateTagsQuickBtn = () => {
        tagsQuickBtn.disabled = state.selectedTags.size === 0;
    };
    renderMultiSelectChips(chipsContainer, state.tags, state.selectedTags, {
        chipClass: "qb-chip qb-chip-action",
        selectedClass: "qb-chip-selected",
        emptyHint: "无可用标签",
        onChange: updateTagsQuickBtn,
    });
    updateTagsQuickBtn();
}

function positionQuickBlockOverlay(overlay, state, { animate = false } = {}) {
    const rect = overlay.getBoundingClientRect();
    const margin = 12;
    const offset = 10;
    let left = state.x + offset;
    let top = state.y + offset;
    let originX = "0%";
    let originY = "0%";

    if (left + rect.width > window.innerWidth - margin) {
        left = state.x - rect.width - offset;
        originX = "100%";
    }
    if (top + rect.height > window.innerHeight - margin) {
        top = state.y - rect.height - offset;
        originY = "100%";
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.transformOrigin = `${originX} ${originY}`;

    if (animate && !state.animated) {
        overlay.style.animation = "none";
        void overlay.offsetWidth;
        overlay.style.animation = "qbFadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";
        state.animated = true;
    }
}

function commitQuickBlock(context, videoElement, videoBv, mutate) {
    mutate();

    if (context.hooks?.afterQuickBlock) {
        context.hooks.afterQuickBlock(context, { videoElement, videoBv });
        return;
    }

    if (videoElement && context.rerunVideoCard) {
        context.rerunVideoCard(videoElement, { reevaluate: true });
        return;
    }

    context.refresh({ reevaluate: true });
}

function getPartitionBlockValue(state) {
    if (state.partitionName && state.partitionId) {
        return `${state.partitionName}（rid: ${state.partitionId}）`;
    }

    return state.partitionName || (state.partitionId ? `rid:${state.partitionId}` : "");
}

function getPartitionDisplayText(state) {
    if (!state.partitionName && !state.partitionId) {
        return "无可用分区";
    }

    const name = state.partitionName || "未知分区";
    return state.partitionId ? `${name}（rid: ${state.partitionId}）` : name;
}

function getUpDisplayText(videoInfo) {
    const name = String(videoInfo.videoUpName || "").trim();
    const uid = String(videoInfo.videoUpUid || "").trim();
    if (name && uid) {
        return `${name} · UID ${uid}`;
    }

    return name || (uid ? `UID ${uid}` : "");
}

function createQuickBlockEl(tag, className, text = "") {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
}

function injectQuickBlockStyles() {
    if (document.getElementById("bbvtQuickBlockStyles")) return;

    const css = `
        #${quickBlockId} {
            position: fixed;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        }

        @keyframes qbFadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }

        #${quickBlockId} .qb-panel {
            width: 380px;
            background: rgba(22, 25, 30, 0.94);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: rgb(239, 244, 248);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        #${quickBlockId} .qb-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: rgba(31, 36, 43, 0.86);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        #${quickBlockId} .qb-title { font-size: 14px; font-weight: 700; }

        #${quickBlockId} .qb-close {
            width: 24px; height: 24px; padding: 0; font-size: 13px;
            line-height: 24px; border: 0; border-radius: 6px;
            background: rgba(255, 255, 255, 0.08); color: rgb(222, 229, 235);
            cursor: pointer; transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center;
        }

        #${quickBlockId} .qb-close:hover {
            background: rgba(232, 93, 93, 0.9);
            color: white;
        }

        #${quickBlockId} .qb-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }

        #${quickBlockId} .qb-row { display: flex; align-items: center; gap: 8px; }
        #${quickBlockId} .qb-action-row,
        #${quickBlockId} .qb-tags-row { align-items: flex-start; }

        #${quickBlockId} .qb-row-label {
            width: 36px; flex: 0 0 36px; padding-top: 7px;
            color: rgb(170, 181, 193); font-size: 12px; font-weight: 700;
        }

        #${quickBlockId} .qb-field {
            flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px;
        }

        #${quickBlockId} .qb-subtext {
            color: rgb(142, 154, 168); font-size: 11px; line-height: 1.3;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        #${quickBlockId} .qb-input {
            flex: 1; width: 100%; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
            background: rgba(12, 15, 19, 0.72); color: rgb(239,244,248);
            padding: 6px 8px; font-size: 12px; outline: none; box-sizing: border-box;
            transition: border-color 0.2s;
        }
        #${quickBlockId} .qb-input:focus { border-color: rgb(18, 183, 219); }

        #${quickBlockId} .qb-info {
            flex: 1; min-width: 0; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
            background: rgba(12, 15, 19, 0.72); color: rgb(239,244,248);
            padding: 6px 8px; font-size: 12px; line-height: 1.35; box-sizing: border-box;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #${quickBlockId} .qb-info-muted { color: rgb(142,154,168); }

        #${quickBlockId} .qb-candidates {
            display: flex; flex-wrap: wrap; gap: 6px;
        }

        #${quickBlockId} .qb-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; padding-top: 1px; }

        #${quickBlockId} .qb-chip {
            display: inline-flex; align-items: center; border-radius: 99px;
            background: rgba(255,255,255,0.07); color: rgb(196,205,214); border: 1px solid rgba(255,255,255,0.08);
            padding: 3px 10px; font-size: 11px; cursor: pointer; user-select: none; transition: all 0.2s ease;
            max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            font-family: inherit;
        }

        #${quickBlockId} .qb-chip:hover {
            background: rgba(18, 183, 219, 0.82); color: white;
        }

        #${quickBlockId} .qb-chip-selected {
            background: rgba(18, 183, 219, 0.9); color: white;
            border-color: rgba(18, 183, 219, 0.45);
        }

        #${quickBlockId} .qb-chip-selected:hover {
            background: rgb(33, 202, 238); color: white;
        }

        #${quickBlockId} .qb-hint { font-size: 12px; color: rgb(142,154,168); padding-top: 4px; }

        #${quickBlockId} .qb-quick-btn {
            border: 0; border-radius: 6px; padding: 5px 10px; font-size: 12px;
            background: rgba(18,183,219,0.14); color: rgb(91,213,237); cursor: pointer;
            white-space: nowrap; flex-shrink: 0; transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        }
        #${quickBlockId} .qb-quick-btn:hover:not(:disabled) { background: rgb(18,183,219); color: white; }
        #${quickBlockId} .qb-quick-btn:disabled { background: rgba(62,70,80,0.45); color: rgb(116,126,138); cursor: default; }

        #${quickBlockId} .bbvt-icon {
            width: 13px;
            height: 13px;
            flex: 0 0 auto;
        }
    `;

    const style = document.createElement("style");
    style.id = "bbvtQuickBlockStyles";
    style.textContent = css;
    document.head.appendChild(style);
}

// ---- src/actions/comment-quick-block.js ----
const triggerId = "bbvtCommentQuickBlockTrigger";
const targetMarkerId = "bbvtCommentQuickBlockTargetMarker";
const popupId = "bbvtCommentQuickBlockPopup";
const styleId = "bbvtCommentQuickBlockStyles";
const maxQuickBlockTextLength = 160;

const commentQuickBlockStates = new WeakMap();
let hideTriggerTimer = null;
let popupCloseHandler = null;
let activeTargetCommentElement = null;
let targetMarkerListenersBound = false;
let targetPositionFrame = null;
function dismissCommentQuickBlockUi() {
    closeCommentQuickBlockPopup();
    hideCommentQuickBlockTrigger();
    clearHideTriggerTimer();
}
function mountCommentQuickBlock(context, commentElement, commentInfo) {
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

// ---- src/settings/rule-metadata.js ----
// == 规则元数据 ==============================================================
//
// 将拦截原因 type 映射到设置项，供追溯面板展示阈值/开关规则并关闭全局规则。const featureRuleMetadataByType = {
    "屏蔽低时长": {
        switchKey: "blockedShortDuration_Switch",
        valueKey: "blockedShortDuration",
        unit: "秒",
        kind: "number",
    },
    "屏蔽低播放量": {
        switchKey: "blockedBelowVideoViews_Switch",
        valueKey: "blockedBelowVideoViews",
        unit: "次",
        kind: "number",
    },
    "屏蔽低点赞率": {
        switchKey: "blockedBelowLikesRate_Switch",
        valueKey: "blockedBelowLikesRate",
        unit: "%",
        kind: "number",
    },
    "屏蔽低投币率": {
        switchKey: "blockedBelowCoinRate_Switch",
        valueKey: "blockedBelowCoinRate",
        unit: "%",
        kind: "number",
    },
    "屏蔽高收藏投币比": {
        switchKey: "blockedAboveFavoriteCoinRatio_Switch",
        valueKey: "blockedAboveFavoriteCoinRatio",
        unit: "",
        kind: "number",
    },
    "屏蔽低UP主等级": {
        switchKey: "blockedBelowUpLevel_Switch",
        valueKey: "blockedBelowUpLevel",
        unit: "级",
        kind: "number",
    },
    "屏蔽低UP主粉丝数": {
        switchKey: "blockedBelowUpFans_Switch",
        valueKey: "blockedBelowUpFans",
        unit: "人",
        kind: "number",
    },
    "屏蔽竖屏视频": {
        switchKey: "blockedPortraitVideo_Switch",
        kind: "boolean",
    },
    "屏蔽充电专属视频": {
        switchKey: "blockedChargingExclusive_Switch",
        kind: "boolean",
    },
    "屏蔽精选评论的视频": {
        switchKey: "blockedFilteredCommentsVideo_Switch",
        kind: "boolean",
    },
};function getFeatureRuleMetadata(reasonType) {
    return featureRuleMetadataByType[String(reasonType || "")] || null;
}function isListRule(reason) {
    return Boolean(reason?.canRemoveConfig && reason.configKey && reason.configValue);
}function isFeatureRule(reason) {
    return !isListRule(reason) && Boolean(getFeatureRuleMetadata(reason?.type));
}function partitionReviewReasons(reasons) {
    const listRules = [];
    const featureRules = [];
    const otherRules = [];

    for (const reason of reasons || []) {
        if (isListRule(reason)) {
            listRules.push(reason);
        } else if (isFeatureRule(reason)) {
            featureRules.push(reason);
        } else {
            otherRules.push(reason);
        }
    }

    return { listRules, featureRules, otherRules };
}function getListRuleChipLabel(reason, settings = {}) {
    if (settings.hideBlockedWordsInMenu_Switch) {
        return reason.type || "屏蔽规则";
    }

    return reason.configValue || reason.displayText || reason.type || "屏蔽规则";
}function formatFeatureRuleSummary(reason, settings, metadata = getFeatureRuleMetadata(reason?.type)) {
    if (!metadata) {
        return reason.displayText || reason.type || "未知原因";
    }

    const hitValue = reason.item || reason.matchedValue || "";
    const parts = [reason.type || metadata.switchKey];

    if (hitValue) {
        parts.push(`命中 ${hitValue}`);
    }

    if (metadata.kind === "number" && metadata.valueKey) {
        const threshold = settings?.[metadata.valueKey];
        if (threshold !== undefined && threshold !== null && threshold !== "") {
            parts.push(`当前阈值 ${threshold}${metadata.unit || ""}`);
        }
    }

    return parts.join(" · ");
}

// ---- src/actions/review-panel.js ----
const reviewPanelId = "bbvtReviewPanel";
function hideHoverReviewPanel() {
    const existing = document.getElementById(reviewPanelId);
    if (existing) {
        if (existing._restoreOverlay) {
            existing._restoreOverlay();
        }
        existing.remove();
    }
}
function showHoverReviewPanel(context, videoBv, videoElement, restoreOverlay, mouseX = 0, mouseY = 0) {
    if (!isMasterSwitchEnabled(context)) {
        return;
    }

    const existing = document.getElementById(reviewPanelId);
    if (existing && existing._videoBv === videoBv) {
        refreshReviewPanel(existing, context);
        return;
    }
    if (existing) {
        if (existing._restoreOverlay) {
            existing._restoreOverlay();
        }
        existing.remove();
    }

    injectReviewPanelStyles();

    const overlay = document.createElement("div");
    overlay.id = reviewPanelId;
    overlay._videoBv = videoBv;
    overlay._videoElement = videoElement;
    overlay._restoreOverlay = restoreOverlay;
    overlay._anchorX = mouseX;
    overlay._anchorY = mouseY;

    if (mouseX === 0 && mouseY === 0 && videoElement?.getBoundingClientRect) {
        const rect = videoElement.getBoundingClientRect();
        overlay._anchorX = rect.left + rect.width / 2;
        overlay._anchorY = rect.bottom + 10;
    }

    const closeHandler = (event) => {
        if (!overlay.contains(event.target)) {
            hideHoverReviewPanel();
            document.removeEventListener("mousedown", closeHandler);
        }
    };

    setTimeout(() => {
        document.addEventListener("mousedown", closeHandler);
    }, 0);

    document.body.appendChild(overlay);
    refreshReviewPanel(overlay, context, { animate: true });
}

function refreshReviewPanel(overlay, context, options = {}) {
    const videoBv = overlay._videoBv;
    const videoInfo = context.videoStore.getVideoInfo(videoBv) || {};
    const settings = context.settingsStore.getSettings();
    const reviewReasons = context.videoStore.getReviewBlockedReasons
        ? context.videoStore.getReviewBlockedReasons(videoBv, settings)
        : getReviewReasons(videoInfo);

    if (!videoInfo.blockedTarget) {
        hideHoverReviewPanel();
        return;
    }

    const state = {
        x: overlay._anchorX || 0,
        y: overlay._anchorY || 0,
        reasons: reviewReasons,
        upName: videoInfo.videoUpName || "",
        upUid: videoInfo.videoUpUid || "",
        title: videoInfo.videoTitle || "未知标题",
        bv: videoBv,
    };

    overlay._context = context;
    renderReviewPanelPopup(overlay, context, state, settings, options);
}

function renderReviewPanelPopup(overlay, context, state, settings, options = {}) {
    const hadPosition = Boolean(overlay.style.left);
    overlay.replaceChildren();

    const panel = document.createElement("div");
    panel.className = "qb-panel";

    const header = document.createElement("div");
    header.className = "qb-header";
    const titleEl = document.createElement("span");
    titleEl.className = "qb-title";
    titleEl.textContent = "拦截追溯面板";
    const closeButton = document.createElement("button");
    closeButton.className = "qb-close";
    closeButton.type = "button";
    setButtonIcon(closeButton, "close", "关闭追溯面板");
    closeButton.addEventListener("click", () => hideHoverReviewPanel());
    header.append(titleEl, closeButton);

    const body = document.createElement("div");
    body.className = "qb-body";

    body.appendChild(createVideoInfoSection(state));
    body.appendChild(createDivider());
    body.appendChild(createRulesSection(overlay, context, state, settings));
    body.appendChild(createDivider());
    body.appendChild(createWhitelistSection(context, state));

    panel.append(header, body);
    overlay.appendChild(panel);

    if (!hadPosition || options.animate) {
        positionReviewPanel(overlay, state, options.animate);
    }
}

function createVideoInfoSection(state) {
    const infoRow = document.createElement("div");
    infoRow.className = "qb-row qb-info-block";

    const titleText = document.createElement("div");
    titleText.className = "qb-video-title";
    titleText.textContent = state.title;

    const bvText = document.createElement("div");
    bvText.className = "qb-video-bv";
    bvText.textContent = state.bv;

    infoRow.append(titleText, bvText);
    return infoRow;
}

function createRulesSection(overlay, context, state, settings) {
    const wrapper = document.createElement("div");
    wrapper.className = "qb-rules-section";

    const { listRules, featureRules, otherRules } = partitionReviewReasons(state.reasons);

    if (listRules.length > 0) {
        wrapper.appendChild(createSectionTitle("列表规则（点击 × 从配置中删除）"));
        wrapper.appendChild(createListRuleChipList(overlay, context, listRules, settings));
    }

    if (featureRules.length > 0) {
        wrapper.appendChild(createSectionTitle("阈值 / 功能规则（全局生效）"));
        const featureList = document.createElement("div");
        featureList.className = "qb-feature-rules";
        featureRules.forEach((reason) => {
            featureList.appendChild(createFeatureRuleRow(overlay, context, reason, settings));
        });
        wrapper.appendChild(featureList);
    }

    if (otherRules.length > 0) {
        wrapper.appendChild(createSectionTitle("其他原因"));
        const otherList = document.createElement("div");
        otherList.className = "qb-feature-rules";
        otherRules.forEach((reason) => {
            otherList.appendChild(createOtherRuleRow(reason));
        });
        wrapper.appendChild(otherList);
    }

    if (listRules.length === 0 && featureRules.length === 0 && otherRules.length === 0) {
        const noRule = document.createElement("span");
        noRule.className = "qb-hint";
        noRule.textContent = "未知原因";
        wrapper.appendChild(noRule);
    }

    return wrapper;
}

function createSectionTitle(text) {
    const title = document.createElement("div");
    title.className = "qb-section-title";
    title.textContent = text;
    return title;
}

function createListRuleChipList(overlay, context, listRules, settings) {
    const list = document.createElement("div");
    list.className = "qb-chip-list";

    listRules.forEach((reason) => {
        const chip = document.createElement("span");
        chip.className = "qb-chip";

        const label = document.createElement("span");
        label.className = "qb-chip-label";
        label.textContent = getListRuleChipLabel(reason, settings);
        label.title = formatListRuleTooltip(reason);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "qb-chip-remove";
        setButtonIcon(removeButton, "close", "从配置中删除这条规则");
        removeButton.title = "从配置中删除这条规则";
        removeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            removeConfigArrayItem(context.settingsStore, reason.configKey, reason.configValue);
            context.refresh({ reevaluate: true });
            refreshReviewPanel(overlay, context);
        });

        chip.append(label, removeButton);
        list.appendChild(chip);
    });

    return list;
}

function createFeatureRuleRow(overlay, context, reason, settings) {
    const metadata = getFeatureRuleMetadata(reason.type);
    const row = document.createElement("div");
    row.className = "qb-feature-rule-row";

    const main = document.createElement("div");
    main.className = "qb-feature-rule-main";

    const type = document.createElement("div");
    type.className = "qb-feature-rule-type";
    type.textContent = reason.type || "未知规则";

    const detail = document.createElement("div");
    detail.className = "qb-feature-rule-detail";
    detail.textContent = formatFeatureRuleSummary(reason, settings, metadata);

    main.append(type, detail);

    const disableButton = document.createElement("button");
    disableButton.type = "button";
    disableButton.className = "qb-quick-btn qb-feature-disable";
    setButtonIcon(disableButton, "shield", "关闭此规则", "关闭此规则");
    disableButton.title = "关闭对应的全局规则（影响所有视频）";
    disableButton.addEventListener("click", () => {
        disableFeatureRuleSwitch(context.settingsStore, metadata.switchKey);
        context.refresh({ reevaluate: true });
        refreshReviewPanel(overlay, context);
    });

    row.append(main, disableButton);
    return row;
}

function createOtherRuleRow(reason) {
    const row = document.createElement("div");
    row.className = "qb-feature-rule-row qb-feature-rule-row-readonly";

    const main = document.createElement("div");
    main.className = "qb-feature-rule-main";

    const type = document.createElement("div");
    type.className = "qb-feature-rule-type";
    type.textContent = reason.type || reason.displayText || "未知原因";

    const detail = document.createElement("div");
    detail.className = "qb-feature-rule-detail";
    detail.textContent = reason.matchedValue || reason.item || reason.displayText || "";

    main.append(type, detail);
    row.appendChild(main);
    return row;
}

function createWhitelistSection(context, state) {
    const wrapper = document.createElement("div");
    wrapper.className = "qb-whitelist-section";

    wrapper.appendChild(createSectionTitle("一键解封（加入白名单）"));

    const upRow = document.createElement("div");
    upRow.className = "qb-row";
    const upInfo = document.createElement("div");
    upInfo.className = "qb-info";
    upInfo.textContent = "UP主: " + (state.upName || "未知") + (state.upUid ? ` (${state.upUid})` : "");
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "qb-quick-btn";
    setButtonIcon(upBtn, "userX", "解封 UP", "解封 UP");
    upBtn.disabled = !state.upUid;
    upBtn.addEventListener("click", () => {
        if (!state.upUid) {
            return;
        }
        appendWhitelistUp(context.settingsStore, state.upUid);
        context.refresh({ reevaluate: true });
        hideHoverReviewPanel();
    });
    upRow.append(upInfo, upBtn);

    const bvRow = document.createElement("div");
    bvRow.className = "qb-row";
    const bvInfo = document.createElement("div");
    bvInfo.className = "qb-info";
    bvInfo.textContent = `视频: ${state.bv}`;
    const bvBtn = document.createElement("button");
    bvBtn.type = "button";
    bvBtn.className = "qb-quick-btn";
    setButtonIcon(bvBtn, "shield", "解封视频", "解封视频");
    bvBtn.addEventListener("click", () => {
        appendWhitelistBv(context.settingsStore, state.bv);
        context.refresh({ reevaluate: true });
        hideHoverReviewPanel();
    });
    bvRow.append(bvInfo, bvBtn);

    wrapper.append(upRow, bvRow);
    return wrapper;
}

function createDivider() {
    const divider = document.createElement("div");
    divider.className = "qb-divider";
    return divider;
}

function formatListRuleTooltip(reason) {
    const parts = [];
    if (reason.type) {
        parts.push(reason.type);
    }
    if (reason.configValue) {
        parts.push(`规则：${reason.configValue}`);
    }
    if (reason.matchedValue && reason.matchedValue !== reason.configValue) {
        parts.push(`命中：${reason.matchedValue}`);
    }
    return parts.join(" · ") || reason.displayText || "";
}

function positionReviewPanel(overlay, state, animate = false) {
    const rect = overlay.getBoundingClientRect();
    const margin = 12;
    const offset = 10;
    let left = state.x + offset;
    let top = state.y + offset;
    let originX = "0%";
    let originY = "0%";

    if (left + rect.width > window.innerWidth - margin) {
        left = state.x - rect.width - offset;
        originX = "100%";
    }
    if (top + rect.height > window.innerHeight - margin) {
        top = state.y - rect.height - offset;
        originY = "100%";
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.transformOrigin = `${originX} ${originY}`;

    if (animate) {
        overlay.style.animation = "none";
        void overlay.offsetWidth;
        overlay.style.animation = "qbFadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";
    }
}

function getReviewReasons(videoInfo) {
    if (Array.isArray(videoInfo.blockedReasons) && videoInfo.blockedReasons.length > 0) {
        return videoInfo.blockedReasons;
    }

    return (videoInfo.triggeredBlockedRules || []).map((rule) => ({
        type: splitReasonText(rule).type,
        displayText: rule,
        matchedValue: splitReasonText(rule).item,
        canRemoveConfig: false,
    }));
}

function splitReasonText(rule) {
    const text = String(rule || "");
    const sep = text.indexOf(": ");
    if (sep < 0) {
        return { type: text, item: "" };
    }

    return {
        type: text.slice(0, sep),
        item: text.slice(sep + 2),
    };
}

function injectReviewPanelStyles() {
    if (document.getElementById("bbvtReviewPanelStyles")) {
        return;
    }

    const css = `
        #${reviewPanelId} {
            position: fixed;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        }

        @keyframes qbFadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }

        #${reviewPanelId} .qb-panel {
            width: 360px;
            background: rgba(22, 25, 30, 0.94);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: rgb(239, 244, 248);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        #${reviewPanelId} .qb-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: rgba(31, 36, 43, 0.86);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        #${reviewPanelId} .qb-title { font-size: 14px; font-weight: 700; }

        #${reviewPanelId} .qb-close {
            width: 24px; height: 24px; padding: 0; font-size: 13px;
            line-height: 24px; border: 0; border-radius: 6px;
            background: rgba(255, 255, 255, 0.08); color: rgb(222, 229, 235);
            cursor: pointer; transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center;
        }

        #${reviewPanelId} .qb-close:hover {
            background: rgba(232, 93, 93, 0.9);
            color: white;
        }

        #${reviewPanelId} .qb-body {
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: min(70vh, 560px);
            overflow: auto;
        }

        #${reviewPanelId} .qb-row { display: flex; align-items: center; gap: 8px; }

        #${reviewPanelId} .qb-info-block {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
        }

        #${reviewPanelId} .qb-video-title {
            font-size: 13px;
            font-weight: bold;
            color: rgb(91, 213, 237);
            line-height: 1.35;
        }

        #${reviewPanelId} .qb-video-bv {
            font-size: 11px;
            color: rgb(142, 154, 168);
        }

        #${reviewPanelId} .qb-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.05);
            margin: 2px 0;
        }

        #${reviewPanelId} .qb-section-title {
            font-size: 12px;
            color: rgb(142, 154, 168);
            margin-bottom: 6px;
        }

        #${reviewPanelId} .qb-rules-section,
        #${reviewPanelId} .qb-whitelist-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        #${reviewPanelId} .qb-chip-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            min-height: 26px;
        }

        #${reviewPanelId} .qb-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: rgb(239, 244, 248);
            padding: 5px 8px 5px 12px;
            font-size: 12px;
            transition: all 0.2s ease;
        }

        #${reviewPanelId} .qb-chip:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            background: rgba(255, 255, 255, 0.12);
        }

        #${reviewPanelId} .qb-chip-label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${reviewPanelId} .qb-chip-remove {
            width: 22px;
            height: 22px;
            padding: 0;
            line-height: 22px;
            border: 0;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            box-shadow: none;
            color: rgb(216, 224, 232);
            cursor: pointer;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        #${reviewPanelId} .qb-chip-remove:hover {
            background: rgba(232, 93, 93, 0.9);
            color: white;
            transform: scale(1.08);
        }

        #${reviewPanelId} .qb-feature-rules {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        #${reviewPanelId} .qb-feature-rule-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 8px;
            border: 1px solid rgba(255, 180, 80, 0.22);
            border-radius: 8px;
            background: rgba(255, 180, 80, 0.08);
            padding: 8px 9px;
        }

        #${reviewPanelId} .qb-feature-rule-row-readonly {
            grid-template-columns: minmax(0, 1fr);
            border-color: rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.04);
        }

        #${reviewPanelId} .qb-feature-rule-main {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        #${reviewPanelId} .qb-feature-rule-type {
            color: rgb(255, 196, 120);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
        }

        #${reviewPanelId} .qb-feature-rule-detail {
            color: rgb(216, 224, 232);
            font-size: 11px;
            line-height: 1.4;
        }

        #${reviewPanelId} .qb-info {
            flex: 1; min-width: 0; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
            background: rgba(12,15,19,0.72); color: rgb(239,244,248);
            padding: 6px 8px; font-size: 12px; line-height: 1.35; box-sizing: border-box;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        #${reviewPanelId} .qb-hint { font-size: 12px; color: rgb(142,154,168); }

        #${reviewPanelId} .qb-quick-btn {
            border: 0; border-radius: 6px; padding: 5px 10px; font-size: 12px;
            background: rgba(18,183,219,0.14); color: rgb(91,213,237); cursor: pointer;
            white-space: nowrap; flex-shrink: 0; transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        }

        #${reviewPanelId} .qb-feature-disable {
            background: rgba(255,255,255,0.08);
            color: rgb(216,224,232);
        }

        #${reviewPanelId} .qb-quick-btn:hover:not(:disabled) {
            background: rgb(18,183,219);
            color: white;
        }

        #${reviewPanelId} .qb-feature-disable:hover:not(:disabled) {
            background: rgba(255, 140, 80, 0.88);
            color: white;
        }

        #${reviewPanelId} .qb-quick-btn:disabled {
            background: rgba(62,70,80,0.45);
            color: rgb(116,126,138);
            cursor: default;
        }

        #${reviewPanelId} .bbvt-icon {
            width: 13px;
            height: 13px;
            flex: 0 0 auto;
        }
    `;

    const style = document.createElement("style");
    style.id = "bbvtReviewPanelStyles";
    style.textContent = css;
    document.head.appendChild(style);
}

// ---- src/orchestration/pipeline.js ----
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



let pipelineRunning = false;
let pendingPipelineOptions = null;
function isPipelineRunning() {
    return pipelineRunning;
}
function runPipeline(context, options = {}) {
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
function runVideoCardPipeline(context, videoElement, options = {}) {
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
function clearScriptEffects(context) {
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

// ---- src/runtime/context.js ----
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
function createRuntimeContext(parts) {
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
        floatingEntry: parts.floatingEntry || null,
        hooks: parts.hooks || {},
        refresh: parts.refresh || (() => {}),
        rerunVideoCard: parts.rerunVideoCard || (() => {}),
    };
}

// ---- src/features/page-cleanup.js ----
// == 页面清理功能组 ==========================================================
//
// 职责：
// - 隐藏首页、搜索页、播放页里的非视频元素。
// - 处理广告、直播推广、课堂等不属于视频屏蔽规则的内容。
//
// 不负责：
// - 不处理具体视频卡片是否命中屏蔽。
// - 不处理热搜项。
//
// 原脚本迁移来源：
// - hideNonVideoElements()
const pageCleanupFeature = {
    name: "page-cleanup",
    enabled: ({ settings }) => settings.hideNonVideoElements_Switch,
    run: ({ domAdapter }) => {
        domAdapter.hideNonVideoElements();
    },
};

// ---- src/utils/regex.js ----
function safeRegexTest(pattern, value) {
    try {
        return new RegExp(pattern).test(value);
    } catch {
        return false;
    }
}

// ---- src/utils/comment-filter.js ----
function findBlockedCommentTextMatch(text, patterns, useRegular) {
    return findBlockedCommentTextMatches(text, patterns, useRegular)[0] || "";
}
function findBlockedCommentTextMatches(text, patterns, useRegular) {
    const commentText = String(text || "");
    if (!commentText || !Array.isArray(patterns) || patterns.length === 0) {
        return [];
    }

    return patterns.filter((pattern) => {
        const normalizedPattern = String(pattern || "").trim();
        if (!normalizedPattern) {
            return false;
        }

        if (useRegular) {
            return safeRegexTest(normalizedPattern, commentText);
        }

        return commentText.includes(normalizedPattern);
    });
}
function findBlockedCommentUserMatch(commentInfo, users) {
    return findBlockedCommentUserMatches(commentInfo, users)[0] || "";
}
function findBlockedCommentUserMatches(commentInfo, users) {
    if (!Array.isArray(users) || users.length === 0) {
        return [];
    }

    const userId = normalizeToken(commentInfo?.userId);
    const userName = normalizeToken(commentInfo?.userName);

    if (!userId && !userName) {
        return [];
    }

    return users.filter((user) => {
        const normalizedUser = normalizeToken(user);
        if (!normalizedUser) {
            return false;
        }

        const lowerUser = normalizedUser.toLowerCase();
        if (userId && (lowerUser === userId.toLowerCase() || lowerUser === `uid:${userId}`.toLowerCase())) {
            return true;
        }

        return Boolean(userName && (
            lowerUser === userName.toLowerCase() ||
            lowerUser === `name:${userName}`.toLowerCase()
        ));
    });
}

function normalizeToken(value) {
    return String(value || "").trim();
}

// ---- src/features/comment-filter.js ----
// == 评论内容过滤 ============================================================
//
// 职责：
// - 在视频页评论区中按关键词或正则折叠单条评论。
// - 只处理页面已经渲染出来的评论，新增评论由页面 MutationObserver 触发重跑。
//
// 不负责：
// - 不主动请求评论 API。
// - 不做评论用户、图片、链接等后续规则。
// - 不处理视频卡片屏蔽。



const blockedCommentTextType = "按评论内容屏蔽";
const blockedCommentUserType = "按评论用户屏蔽";
const blockedCommentImageType = "按带图评论屏蔽";
const retryDelayMs = 1000;
const maxRetryAttempts = 8;

let retryTimer = null;
let retryAttempts = 0;
let lastObservedCommentCount = -1;
const commentFilterFeature = {
    name: "comment-filter",
    enabled: ({ domAdapter }) => domAdapter.shouldHandleCommentFiltering(window.location.href),
    run: (context) => {
        const { settings, domAdapter, renderer, statsStore, refresh, settingsStore } = context;
        const commentElements = domAdapter.getCommentElements();
        const enabled = hasEnabledCommentRules(settings);
        const shouldTrackComments = enabled || Boolean(settingsStore);

        if (shouldTrackComments) {
            domAdapter.observeCommentChanges?.(() => {
                resetRetry();
                refresh?.();
            });
            scheduleCommentSettlingRetry(refresh, commentElements.length);
        } else {
            resetRetry();
        }

        const blockedTargets = new Set();
        commentElements.forEach((commentElement) => {
            if (isInsideBlockedCommentTarget(commentElement, blockedTargets)) {
                return;
            }

            const commentInfo = domAdapter.readCommentInfo(commentElement);
            const blockResult = getCommentBlockResult(settings, commentInfo);
            blockResult.commentKey = getCommentKey(commentInfo);
            const blockTarget = domAdapter.getCommentBlockTarget?.(commentElement, commentInfo, blockResult) || commentElement;

            mountCommentQuickBlock(context, commentElement, commentInfo);

            const changedToBlocked = renderer.renderCommentBlockedState(blockTarget, blockResult, {
                mode: settings.hideCommentMode_Switch ? "hide" : "overlay",
                sourceElement: commentElement,
                reasonItems: createCommentReasonItems(blockResult, settings, {
                    isThreadTarget: blockTarget !== commentElement,
                    settingsStore,
                    refresh,
                }),
            });
            if (blockResult.blocked) {
                blockedTargets.add(blockTarget);
            }
            if (changedToBlocked) {
                getCommentBlockReasons(blockResult).forEach((reason) => {
                    if (reason.item) {
                        statsStore?.increment(`${reason.type}: ${reason.item}`);
                    }
                });
            }
        });
    },
};

function hasEnabledCommentRules(settings) {
    return Boolean(
        (settings.blockedCommentUser_Switch && settings.blockedCommentUser_Array?.length > 0) ||
        (settings.blockedCommentText_Switch && settings.blockedCommentText_Array?.length > 0) ||
        settings.blockedCommentImage_Switch
    );
}

function createCommentReasonItems(blockResult, settings, { isThreadTarget = false, settingsStore, refresh } = {}) {
    const reasons = getCommentBlockReasons(blockResult);
    const scopeLabel = isThreadTarget ? "主楼命中" : "";

    return reasons.map((reason) => {
        const canRemove = Boolean(reason.canRemoveConfig && reason.configKey && reason.configValue && settingsStore);

        return {
            id: reason.id || [reason.type, reason.configKey, reason.configValue, reason.matchedValue].join("\u0001"),
            label: formatCommentReasonLabel(reason, settings, scopeLabel),
            title: formatCommentReasonTitle(reason),
            canRemove,
            removeTitle: "从配置中删除这条评论规则",
            onRemove: canRemove
                ? () => {
                    removeConfigArrayItem(settingsStore, reason.configKey, reason.configValue);
                    refresh?.({ reevaluate: true });
                }
                : null,
        };
    });
}

function getCommentBlockReasons(blockResult) {
    if (Array.isArray(blockResult?.blockedReasons) && blockResult.blockedReasons.length > 0) {
        return blockResult.blockedReasons;
    }

    if (blockResult?.blockReason) {
        return [blockResult.blockReason];
    }

    return [];
}

function formatCommentReasonLabel(reason, settings = {}, scopeLabel = "") {
    const parts = [];
    if (scopeLabel) {
        parts.push(scopeLabel);
    }

    parts.push(reason.type || reason.displayText || "评论屏蔽规则");

    if (!settings.hideBlockedWordsInMenu_Switch) {
        const item = reason.configValue || reason.item || "";
        if (item) {
            parts.push(item);
        }
    }

    return parts.filter(Boolean).join(" · ");
}

function formatCommentReasonTitle(reason) {
    const parts = [];
    if (reason.type) {
        parts.push(reason.type);
    }
    if (reason.configValue) {
        parts.push(`规则：${reason.configValue}`);
    }
    if (reason.matchedValue && reason.matchedValue !== reason.configValue) {
        parts.push(`命中：${reason.matchedValue}`);
    }
    return parts.join(" · ") || reason.displayText || "";
}

function isInsideBlockedCommentTarget(commentElement, blockedTargets) {
    for (const target of blockedTargets) {
        if (target !== commentElement && target?.contains?.(commentElement)) {
            return true;
        }
    }

    return false;
}

function getCommentBlockResult(settings, commentInfo) {
    const blockedReasons = [];
    const matchedUsers = settings.blockedCommentUser_Switch
        ? findBlockedCommentUserMatches(commentInfo, settings.blockedCommentUser_Array)
        : [];

    matchedUsers.forEach((matchedUser) => {
        blockedReasons.push(createCommentBlockReason({
            type: blockedCommentUserType,
            item: matchedUser,
            reasonItem: formatCommentUserReason(commentInfo, matchedUser),
            configKey: "blockedCommentUser_Array",
            configValue: matchedUser,
            matchedValue: formatCommentUserReason(commentInfo, matchedUser),
        }));
    });

    const matchedTexts = settings.blockedCommentText_Switch
        ? findBlockedCommentTextMatches(
            commentInfo.text,
            settings.blockedCommentText_Array,
            settings.blockedCommentText_UseRegular
        )
        : [];

    matchedTexts.forEach((matchedText) => {
        blockedReasons.push(createCommentBlockReason({
            type: blockedCommentTextType,
            item: matchedText,
            reasonItem: matchedText,
            configKey: "blockedCommentText_Array",
            regularKey: "blockedCommentText_UseRegular",
            configValue: matchedText,
            matchedValue: commentInfo.text,
        }));
    });

    if (settings.blockedCommentImage_Switch && commentInfo.hasImage) {
        blockedReasons.push(createCommentBlockReason({
            type: blockedCommentImageType,
            item: "带图评论",
            reasonItem: "",
            matchedValue: "带图评论",
        }));
    }

    return createCommentBlockResult(blockedReasons);
}

function getCommentKey(commentInfo) {
    const text = String(commentInfo?.text || "").replace(/\s+/g, " ").trim();
    const userId = String(commentInfo?.userId || "").trim();
    const userName = String(commentInfo?.userName || "").replace(/\s+/g, " ").trim();

    if (!text && !userId && !userName) {
        return "";
    }

    return JSON.stringify([userId, userName, text.slice(0, 240)]);
}

function createCommentBlockReason({ type, item, reasonItem, configKey = "", regularKey = "", configValue = "", matchedValue = "" }) {
    const reason = reasonItem ? `${type}: ${reasonItem}` : type;
    return {
        id: [type, configKey, configValue, matchedValue, reason].join("\u0001"),
        type,
        item,
        displayText: reason,
        configKey,
        regularKey,
        configValue,
        matchedValue,
        canRemoveConfig: Boolean(configKey && configValue),
    };
}

function createCommentBlockResult(blockedReasons) {
    if (!blockedReasons.length) {
        return { blocked: false };
    }

    const blockReason = blockedReasons[0];

    return {
        blocked: true,
        type: blockReason.type,
        item: blockReason.item,
        reason: blockReason.displayText,
        blockReason,
        blockedReasons,
    };
}

function formatCommentUserReason(commentInfo, matchedUser) {
    const userName = String(commentInfo?.userName || "").trim();
    const userId = String(commentInfo?.userId || "").trim();

    if (userName && userId) {
        return `${userName} (${userId})`;
    }

    return userName || userId || matchedUser;
}

function scheduleCommentSettlingRetry(refresh, commentCount) {
    if (!refresh) {
        return;
    }

    if (commentCount !== lastObservedCommentCount) {
        lastObservedCommentCount = commentCount;
        retryAttempts = 0;
    }

    if (retryTimer || retryAttempts >= maxRetryAttempts) {
        return;
    }

    retryAttempts++;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        refresh();
    }, retryDelayMs);
}

function resetRetry() {
    retryAttempts = 0;
    lastObservedCommentCount = -1;
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
}

// ---- src/features/trending.js ----
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
const trendingFeature = {
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

// ---- src/features/basic-video-info.js ----
// == 视频基础信息准备 ========================================================
//
// 职责：
// - 从视频卡片 DOM 中提取 BV、标题、链接。
// - 尽量从 DOM 中提取 UP 名称和 UID。
// - 只做 DOM 基础读取；需要 API 的功能由各自 feature 按需触发。
//
// 不负责：
// - 不判断是否应该屏蔽。
// - 不渲染叠加层。
//
// 原脚本迁移来源：
// - getBvAndTitle()
// - getNameAndUid()
const basicVideoInfoFeature = {
    name: "basic-video-info",
    enabled: () => true,
    run: ({ videoBv, videoElement, domAdapter, videoStore }) => {
        const domInfo = domAdapter.readVideoBasicInfo(videoElement);
        videoStore.mergeVideoInfo(videoBv, domInfo);
    },
};

// ---- src/features/title-up.js ----
// == 标题和 UP 基础屏蔽 ======================================================
//
// 职责：
// - 按标题屏蔽。
// - 按 UP UID 精确屏蔽。
// - 按 UP 名称关键词屏蔽。
//
// 不负责：
// - 不处理白名单；白名单必须放到屏蔽规则之后作为覆盖逻辑。
// - 不请求 UP 详细资料，例如等级、粉丝数、简介。
//
// 原脚本迁移来源：
// - handleBlockedTitle()
// - handleBlockedNameOrUid()
const titleUpFeature = {
    name: "title-up",
    enabled: ({ settings }) =>
        (settings.blockedTitle_Switch && settings.blockedTitle_Array.length > 0) ||
        (settings.blockedUpUid_Switch && (settings.blockedUpUid_Array || []).length > 0) ||
        (settings.blockedUpNameKeyword_Switch && (settings.blockedUpNameKeyword_Array || []).length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        if (
            (settings.blockedUpUid_Switch && (settings.blockedUpUid_Array || []).length > 0) ||
            (settings.blockedUpNameKeyword_Switch && (settings.blockedUpNameKeyword_Array || []).length > 0)
        ) {
            apiClient.requestVideoInfoIfNeeded(videoBv, videoStore);
        }

        videoStore.applyTitleAndUpRules(videoBv, settings);
        return true;
    },
};

// ---- src/platform/api-health.js ----
// == API 健康状态记录 ========================================================
//
// 职责：
// - 记录脚本侧观察到的 API 请求结果。
// - 按 endpoint 和 capability 聚合最近状态。
// - 只提供状态，不做熔断、不决定规则是否启用。
const API_DATA_STATUS = {
    UNKNOWN: "unknown",
    PENDING: "pending",
    READY: "ready",
    EMPTY: "empty",
    UNAVAILABLE: "unavailable",
};
const API_DATA_KEYS = {
    VIDEO_VIEW: "videoView",
    VIDEO_TAGS: "videoTags",
    UP_PROFILE: "upProfile",
    VIDEO_COMMENTS: "videoComments",
};
const API_EVENT_OUTCOME = {
    SUCCESS: "success",
    EMPTY: "empty",
    FAILURE: "failure",
};
const API_HEALTH_STATUS = {
    UNOBSERVED: "unobserved",
    NORMAL: "normal",
    UNSTABLE: "unstable",
    UNAVAILABLE: "unavailable",
};
function createApiHealthStore({ recentLimit = 10, unavailableThreshold = 5 } = {}) {
    const capabilityStates = {};
    const endpointStates = {};

    return {
        recordSuccess(details) {
            recordEvent({
                ...details,
                outcome: API_EVENT_OUTCOME.SUCCESS,
            });
        },

        recordEmpty(details) {
            recordEvent({
                ...details,
                outcome: API_EVENT_OUTCOME.EMPTY,
            });
        },

        recordFailure(details) {
            recordEvent({
                ...details,
                outcome: API_EVENT_OUTCOME.FAILURE,
            });
        },

        getCapabilitySnapshot(capabilityId) {
            return snapshotState(capabilityStates[capabilityId]);
        },

        getEndpointSnapshot(endpointId) {
            return snapshotState(endpointStates[endpointId]);
        },

        getSnapshot() {
            return {
                capabilities: snapshotStates(capabilityStates),
                endpoints: snapshotStates(endpointStates),
            };
        },
    };

    function recordEvent(details) {
        const event = normalizeEvent(details);
        updateState(ensureState(capabilityStates, event.capabilityId), event);
        updateState(ensureState(endpointStates, event.endpointId), event);
    }

    function updateState(state, event) {
        state.lastEvent = event;
        state.recentEvents.push(event);
        if (state.recentEvents.length > recentLimit) {
            state.recentEvents.shift();
        }

        if (event.outcome === API_EVENT_OUTCOME.FAILURE) {
            state.failureCount++;
            state.consecutiveFailures++;
        } else {
            state.successCount++;
            state.consecutiveFailures = 0;
        }

        if (event.outcome === API_EVENT_OUTCOME.EMPTY) {
            state.emptyCount++;
        }

        state.status = resolveHealthStatus(state);
    }

    function resolveHealthStatus(state) {
        if (!state.lastEvent) {
            return API_HEALTH_STATUS.UNOBSERVED;
        }

        if (state.consecutiveFailures >= unavailableThreshold) {
            return API_HEALTH_STATUS.UNAVAILABLE;
        }

        const hasRecentFailure = state.recentEvents.some((event) => event.outcome === API_EVENT_OUTCOME.FAILURE);
        return hasRecentFailure ? API_HEALTH_STATUS.UNSTABLE : API_HEALTH_STATUS.NORMAL;
    }
}

function ensureState(states, id) {
    if (!states[id]) {
        states[id] = {
            status: API_HEALTH_STATUS.UNOBSERVED,
            successCount: 0,
            emptyCount: 0,
            failureCount: 0,
            consecutiveFailures: 0,
            recentEvents: [],
            lastEvent: null,
        };
    }

    return states[id];
}

function normalizeEvent(details) {
    return {
        capabilityId: details.capabilityId || "unknown",
        endpointId: details.endpointId || "unknown",
        outcome: details.outcome,
        time: details.time || new Date().toISOString(),
        durationMs: details.durationMs ?? null,
        httpStatus: details.httpStatus ?? null,
        apiCode: details.apiCode ?? null,
        errorKind: details.errorKind || "",
        message: details.message || "",
    };
}

function snapshotStates(states) {
    const snapshots = {};
    for (const id in states) {
        snapshots[id] = snapshotState(states[id]);
    }
    return snapshots;
}

function snapshotState(state) {
    if (!state) {
        return {
            status: API_HEALTH_STATUS.UNOBSERVED,
            successCount: 0,
            emptyCount: 0,
            failureCount: 0,
            consecutiveFailures: 0,
            recentEvents: [],
            lastEvent: null,
        };
    }

    return {
        status: state.status,
        successCount: state.successCount,
        emptyCount: state.emptyCount,
        failureCount: state.failureCount,
        consecutiveFailures: state.consecutiveFailures,
        recentEvents: state.recentEvents.map((event) => ({ ...event })),
        lastEvent: state.lastEvent ? { ...state.lastEvent } : null,
    };
}

// ---- src/features/video-stats.js ----
// == 视频统计和基础属性屏蔽 ==================================================
//
// 职责：
// - 按时长屏蔽。
// - 按播放量屏蔽。
// - 按点赞率、投币率屏蔽。
// - 按收藏/投币比屏蔽。
// - 按竖屏视频屏蔽。
// - 按充电专属屏蔽。
// - 按视频分区屏蔽。
//
// 不负责：
// - 不处理标签。
// - 不处理评论。
// - 不处理 UP 主页资料。
//
// 原脚本迁移来源：
// - handleBlockedShortDuration()
// - handleBlockedBelowVideoViews()
// - handleBlockedBelowLikesRate()
// - handleBlockedBelowCoinRate()
// - handleBlockedAboveFavoriteCoinRatio()
// - handleBlockedPortraitVideo()
// - handleBlockedChargingExclusive()
// - handleBlockedVideoPartitions()
const videoStatsFeature = {
    name: "video-stats",
    enabled: ({ settings }) =>
        (settings.blockedShortDuration_Switch && settings.blockedShortDuration > 0) ||
        (settings.blockedBelowVideoViews_Switch && settings.blockedBelowVideoViews > 0) ||
        (settings.blockedBelowLikesRate_Switch && settings.blockedBelowLikesRate > 0) ||
        (settings.blockedBelowCoinRate_Switch && settings.blockedBelowCoinRate > 0) ||
        (settings.blockedAboveFavoriteCoinRatio_Switch && settings.blockedAboveFavoriteCoinRatio > 0) ||
        settings.blockedPortraitVideo_Switch ||
        settings.blockedChargingExclusive_Switch ||
        (settings.blockedVideoPartitions_Switch && settings.blockedVideoPartitions_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);
        if (!info || info.videoDuration === undefined) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW).status;
            if (isVideoStatsApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestVideoInfoIfNeeded(videoBv, videoStore);
            return false;
        }
        videoStore.applyVideoStatsRules(videoBv, settings);
        return true;
    },
};

function isVideoStatsApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

// ---- src/features/tags.js ----
// == 标签屏蔽功能组 ==========================================================
//
// 职责：
// - 按单标签屏蔽。
// - 按双重标签屏蔽。
// - 只在相关开关打开时请求标签 API。
//
// 不负责：
// - 不处理标题。
// - 不处理热搜。
//
// 原脚本迁移来源：
// - getVideoApiTags()
// - handleBlockedTag()
// - handleDoubleBlockedTag()
const tagsFeature = {
    name: "tags",
    enabled: ({ settings }) =>
        (settings.blockedTag_Switch && settings.blockedTag_Array.length > 0) ||
        (settings.doubleBlockedTag_Switch && settings.doubleBlockedTag_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);
        if (!info || info.videoTags === undefined) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS).status;
            if (isTagsApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestVideoTagsIfNeeded(videoBv, videoStore);
            return false;
        }
        videoStore.applyTagRules(videoBv, settings);
        return true;
    },
};

function isTagsApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

// ---- src/features/up-profile.js ----
// == UP 主页资料屏蔽功能组 ===================================================
//
// 职责：
// - 按 UP 等级屏蔽。
// - 按 UP 粉丝数屏蔽。
// - 按 UP 简介屏蔽。
// - 只在相关开关打开时请求 UP 资料 API。
//
// 不负责：
// - 不处理 UP 名称或 UID 的基础屏蔽；那部分在 title-up.js。
//
// 原脚本迁移来源：
// - getVideoApiUpInfo()
// - handleBlockedBelowUpLevel()
// - handleBlockedBelowUpFans()
// - handleBlockedUpSigns()
function isUpProfileDataReady(videoStore, videoBv) {
    const info = videoStore.getVideoInfo(videoBv);
    if (!info?.videoUpUid) {
        return false;
    }

    const upCached = videoStore.getUpInfo(info.videoUpUid);
    return Boolean(upCached && upCached.upLevel != null);
}
const upProfileFeature = {
    name: "up-profile",
    enabled: ({ settings }) =>
        (settings.blockedBelowUpLevel_Switch && settings.blockedBelowUpLevel > 0) ||
        (settings.blockedBelowUpFans_Switch && settings.blockedBelowUpFans > 0) ||
        (settings.blockedUpSigns_Switch && settings.blockedUpSigns_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);

        if (!info?.videoUpUid) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW).status;
            if (isUpProfileApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestVideoInfoIfNeeded(videoBv, videoStore);
            return false;
        }

        if (!isUpProfileDataReady(videoStore, videoBv)) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE).status;
            if (isUpProfileApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestUpInfoIfNeeded(videoBv, videoStore);
            return false;
        }

        videoStore.applyUpProfileRules(videoBv, settings);
        return true;
    },
};

function isUpProfileApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

// ---- src/features/comments.js ----
// == 评论区屏蔽功能组 ========================================================
//
// 职责：
// - 按精选评论状态屏蔽视频。
// - 按置顶评论内容屏蔽视频。
// - 管理评论 API 的请求需要，但具体节流策略放在 api-client.js。
//
// 不负责：
// - 不处理普通标签。
// - 不处理 UP 资料。
//
// 原脚本迁移来源：
// - getVideoApiComments()
// - handleBlockedFilteredCommentsVideo()
// - handleBlockedTopComment()
const commentsFeature = {
    name: "comments",
    enabled: ({ settings }) =>
        settings.blockedFilteredCommentsVideo_Switch ||
        (settings.blockedTopComment_Switch && settings.blockedTopComment_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);
        if (!info || info.filteredComments === undefined) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS).status;
            if (isCommentsApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestCommentsIfNeeded(videoBv, videoStore);
            return false;
        }
        videoStore.applyCommentRules(videoBv, settings);
        return true;
    },
};

function isCommentsApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

// ---- src/features/whitelist.js ----
// == 白名单覆盖功能 ==========================================================
//
// 职责：
// - 在所有屏蔽规则执行之后，检查 BV、UP UID 白名单。
// - 命中白名单时清除 blockedTarget，让 renderer 取消隐藏或叠加层。
//
// 为什么放最后：
// - 原脚本逻辑是“先判黑，再判白”。
// - 白名单不是普通屏蔽规则，而是对屏蔽结果的覆盖。
//
// 原脚本迁移来源：
// - handleWhitelistNameOrUid()
const whitelistFeature = {
    name: "whitelist",
    enabled: ({ settings }) =>
        (settings.whitelistUpUid_Switch && (settings.whitelistUpUid_Array || []).length > 0) ||
        (settings.whitelistNameOrUid_Switch && (settings.whitelistNameOrUid_Array || []).length > 0) ||
        (settings.whitelistBv_Switch && settings.whitelistBv_Array?.length > 0),
    run: ({ videoBv, settings, videoStore }) => {
        videoStore.applyWhitelistRules(videoBv, settings);
    },
};

// ---- src/features/up-block-suggestions.js ----
// == UP 屏蔽建议统计 ========================================================
//
// 职责：
// - 在视频最终被屏蔽后，按 UP 维度记录本脚本自己的本地统计。
// - 使用 videoBv + upUid 去重，避免刷新或重复 pipeline 把同一视频刷爆。
//
// 不负责：
// - 不渲染建议列表。
// - 不修改用户的屏蔽配置。
const upBlockSuggestionsFeature = {
    name: "up-block-suggestions",
    enabled: ({ upBlockStatsStore }) => Boolean(upBlockStatsStore),
    run: ({ videoBv, videoStore, upBlockStatsStore }) => {
        const videoInfo = videoStore.getVideoInfo(videoBv);
        if (!videoInfo?.blockedTarget) {
            return;
        }

        upBlockStatsStore.recordBlockedVideo(videoBv, videoInfo);
    },
};

// ---- src/features/index.js ----
// == 功能注册表 ==============================================================
//
// 新增/删除功能时，优先改这个文件。
//
// 原则：
// - 删除一个功能：移除对应 import 和数组项。
// - 新增一个功能：新增 feature 文件，然后挂到合适阶段。
// - 主 pipeline 不关心功能细节，只遍历这些列表。
function createFeatureRegistry() {
    return {
        pageFeatures: [
            pageCleanupFeature,
            commentFilterFeature,
        ],

        trendingFeatures: [
            trendingFeature,
        ],

        videoPrepareFeatures: [
            basicVideoInfoFeature,
        ],

        videoRuleFeatures: [
            titleUpFeature,
            videoStatsFeature,
            upProfileFeature,
            tagsFeature,
            commentsFeature,
        ],

        videoPostRuleFeatures: [
            whitelistFeature,
            upBlockSuggestionsFeature,
        ],
    };
}

// ---- src/settings/defaults.js ----
// == 默认配置 ================================================================
//
// 职责：
// - 保存完整的默认配置结构。
// - 作为菜单 UI、导入导出、GM 存储的统一字段来源。
//
// 后续迁移：
// - 从原脚本顶部的 GM_getValue 默认对象迁移到这里。
//
// 注意：
// - 不在这里读写 GM_* API。
// - 不在这里做旧配置兼容。const defaultSettings = {
    uiFeatureSwitchVersion: 1,
    scriptEnabled_Switch: true,

    blockedTitle_Switch: true,
    blockedTitle_UseRegular: true,
    blockedTitle_Array: [],

    blockedUpUid_Switch: true,
    blockedUpUid_Array: [],

    blockedUpNameKeyword_Switch: true,
    blockedUpNameKeyword_UseRegular: false,
    blockedUpNameKeyword_Array: [],

    blockedVideoPartitions_Switch: true,
    blockedVideoPartitions_UseRegular: false,
    blockedVideoPartitions_Array: [],

    blockedTag_Switch: true,
    blockedTag_UseRegular: true,
    blockedTag_Array: [],

    doubleBlockedTag_Switch: true,
    doubleBlockedTag_UseRegular: true,
    doubleBlockedTag_Array: [],

    blockedShortDuration_Switch: false,
    blockedShortDuration: 0,

    blockedBelowVideoViews_Switch: false,
    blockedBelowVideoViews: 0,

    blockedBelowLikesRate_Switch: false,
    blockedBelowLikesRate: 0,

    blockedBelowCoinRate_Switch: false,
    blockedBelowCoinRate: 0,

    blockedAboveFavoriteCoinRatio_Switch: false,
    blockedAboveFavoriteCoinRatio: 10,

    blockedPortraitVideo_Switch: false,
    blockedChargingExclusive_Switch: false,
    blockedFilteredCommentsVideo_Switch: false,

    blockedTopComment_Switch: false,
    blockedTopComment_UseRegular: true,
    blockedTopComment_Array: [],

    blockedCommentText_Switch: true,
    blockedCommentText_UseRegular: false,
    blockedCommentText_Array: [],
    blockedCommentUser_Switch: true,
    blockedCommentUser_Array: [],
    blockedCommentImage_Switch: false,
    hideCommentMode_Switch: false,

    blockedBelowUpLevel_Switch: false,
    blockedBelowUpLevel: 0,

    blockedBelowUpFans_Switch: false,
    blockedBelowUpFans: 0,

    blockedUpSigns_Switch: false,
    blockedUpSigns_UseRegular: true,
    blockedUpSigns_Array: [],

    whitelistUpUid_Switch: false,
    whitelistUpUid_Array: [],
    whitelistBv_Switch: false,
    whitelistBv_Array: [],

    hideTrending_Switch: false,
    blockedTrendingItemByTitleTag_Switch: false,
    blockedTrendingItem_Switch: false,
    blockedTrendingItem_UseRegular: true,
    blockedTrendingItem_Array: [],

    hideNonVideoElements_Switch: true,
    floatingEntryVisible_Switch: true,
    blockedOverlayOnlyDisplaysType_Switch: false,
    hideVideoMode_Switch: false,
    legacyCardBoxOverlayDelay_Switch: false,
    consoleOutputLog_Switch: false,
    hideBlockedWordsInMenu_Switch: false,
    accumulateBlockedRules_Switch: false,

    // none | shift | ctrl | alt — 精准匹配对应右键组合时打开脚本菜单
    contextMenuScriptModifier: "none",
};

// ---- src/utils/context-menu-modifier.js ----
const CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS = [
    { value: "none", label: "绑定右键", hint: "普通右键打开脚本菜单" },
    { value: "shift", label: "Shift", hint: "只有 Shift + 右键打开脚本菜单" },
    { value: "ctrl", label: "Ctrl", hint: "只有 Ctrl + 右键打开脚本菜单" },
    { value: "alt", label: "Alt", hint: "只有 Alt + 右键打开脚本菜单" },
];

const VALID_MODIFIERS = new Set(CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS.map((option) => option.value));function normalizeContextMenuScriptModifier(value) {
    return VALID_MODIFIERS.has(value) ? value : "none";
}function shouldOpenScriptContextMenu(event, modifierSetting) {
    const modifier = normalizeContextMenuScriptModifier(modifierSetting);
    const shift = event.shiftKey === true;
    const ctrl = event.ctrlKey === true;
    const alt = event.altKey === true;
    const meta = event.metaKey === true;

    if (modifier === "none") {
        return !shift && !ctrl && !alt && !meta;
    }

    if (modifier === "shift") {
        return shift && !ctrl && !alt && !meta;
    }

    if (modifier === "ctrl") {
        return ctrl && !shift && !alt && !meta;
    }

    if (modifier === "alt") {
        return alt && !shift && !ctrl && !meta;
    }

    return false;
}function getContextMenuScriptModifierHint(modifierSetting) {
    const modifier = normalizeContextMenuScriptModifier(modifierSetting);
    return CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS.find((option) => option.value === modifier)?.hint || "";
}

// ---- src/settings/storage.js ----
// == 设置存储 ================================================================
//
// 职责：
// - 从 GM_getValue 读取配置。
// - 写入 GM_setValue。
// - 调用旧配置兼容函数。
// - 给 UI 和 pipeline 提供 getSettings / saveSettings。
//
// 不负责：
// - 不关心配置具体如何影响屏蔽规则。
// - 不关心菜单 UI 如何展示。
//
// 原脚本迁移来源：
// - GM_getValue("GM_blockedParameter", ...)
// - oldParameterAdaptation()
// - GM_setValue("GM_blockedParameter", blockedParameter)



const storageKey = "GM_blockedParameter";

const numericSettingKeys = Object.values(featureRuleMetadataByType)
    .filter((metadata) => metadata.kind === "number" && metadata.valueKey)
    .map((metadata) => metadata.valueKey);
function createSettingsStore() {
    let currentSettings = loadSettings();

    return {
        getSettings() {
            return currentSettings;
        },

        saveSettings(nextSettings) {
            currentSettings = normalizeSettings(nextSettings);
            if (typeof GM_setValue === "function") {
                GM_setValue(storageKey, currentSettings);
            }
            return currentSettings;
        },

        reloadSettings() {
            currentSettings = loadSettings();
            return currentSettings;
        },

        exportSettings() {
            return deepCloneStorage(currentSettings);
        },

        normalizeSettings(nextSettings) {
            return normalizeSettings(nextSettings);
        },
    };
}

function loadSettings() {
    const storedSettings = typeof GM_getValue === "function" ? GM_getValue(storageKey, {}) : {};
    const normalizedSettings = normalizeSettings(storedSettings);

    if (typeof GM_setValue === "function") {
        GM_setValue(storageKey, normalizedSettings);
    }

    return normalizedSettings;
}

function normalizeSettings(settings) {
    const settingsCopy = deepCloneStorage(settings || {});
    oldParameterAdaptation(settingsCopy);
    normalizeUpIdentitySettings(settingsCopy);
    normalizePartitionSettings(settingsCopy);
    normalizeArraySettings(settingsCopy);
    normalizeUiFeatureSwitches(settingsCopy);
    normalizeNumericSettings(settingsCopy);

    settingsCopy.contextMenuScriptModifier = normalizeContextMenuScriptModifier(
        settingsCopy.contextMenuScriptModifier ?? settingsCopy.contextMenuNativeModifier
    );
    delete settingsCopy.contextMenuNativeModifier;

    return {
        ...deepCloneStorage(defaultSettings),
        ...settingsCopy,
    };
}

function normalizeUiFeatureSwitches(obj) {
    if (obj.uiFeatureSwitchVersion >= 1) {
        return;
    }

    if (Array.isArray(obj.blockedCommentText_Array) && obj.blockedCommentText_Array.length === 0) {
        obj.blockedCommentText_Switch = true;
    }

    if (Array.isArray(obj.blockedCommentUser_Array) && obj.blockedCommentUser_Array.length === 0) {
        obj.blockedCommentUser_Switch = true;
    }

    obj.uiFeatureSwitchVersion = 1;
}

function normalizePartitionSettings(obj) {
    if (!Array.isArray(obj.blockedVideoPartitions_Array)) {
        return;
    }

    obj.blockedVideoPartitions_Array = obj.blockedVideoPartitions_Array
        .map((item) => {
            if (!item || typeof item !== "object") {
                return item;
            }

            const name = item.name || item.partitionName || item.tname || "";
            const id = item.id || item.rid || item.tid || "";
            if (name && id) {
                return `${name}（rid: ${id}）`;
            }

            return name || (id ? `rid:${id}` : "");
        })
        .filter(Boolean);
}

function normalizeArraySettings(obj) {
    for (const key in defaultSettings) {
        if (!key.endsWith("_Array") || !Array.isArray(defaultSettings[key])) {
            continue;
        }

        if (Array.isArray(obj[key])) {
            continue;
        }

        obj[key] = [];
    }
}

function normalizeNumericSettings(obj) {
    for (const key of numericSettingKeys) {
        if (!(key in obj)) {
            continue;
        }

        const number = Number(obj[key]);
        obj[key] = Number.isFinite(number) ? number : 0;
    }
}

function normalizeUpIdentitySettings(obj) {
    migrateBlockedUpIdentitySettings(obj);
    migrateWhitelistUpIdentitySettings(obj);
    enforceUpIdentityExclusivity(obj);
}

function migrateBlockedUpIdentitySettings(obj) {
    const legacyItems = normalizeStringArray(obj.blockedNameOrUid_Array);
    if (legacyItems.length === 0) {
        delete obj.blockedNameOrUid_Switch;
        delete obj.blockedNameOrUid_UseRegular;
        delete obj.blockedNameOrUid_Array;
        return;
    }

    const uidItems = legacyItems.filter(isStoragePlainUid);
    const nameItems = legacyItems.filter((item) => !isStoragePlainUid(item));
    const legacyEnabled = obj.blockedNameOrUid_Switch !== false;

    if (uidItems.length > 0) {
        obj.blockedUpUid_Array = appendUniqueStorage(obj.blockedUpUid_Array, uidItems);
        if (legacyEnabled) {
            obj.blockedUpUid_Switch = true;
        }
    }

    if (nameItems.length > 0) {
        obj.blockedUpNameKeyword_Array = appendUniqueStorage(obj.blockedUpNameKeyword_Array, nameItems);
        if (legacyEnabled) {
            obj.blockedUpNameKeyword_Switch = true;
        }
        if (obj.blockedNameOrUid_UseRegular) {
            obj.blockedUpNameKeyword_UseRegular = true;
        }
    }

    delete obj.blockedNameOrUid_Switch;
    delete obj.blockedNameOrUid_UseRegular;
    delete obj.blockedNameOrUid_Array;
}

function migrateWhitelistUpIdentitySettings(obj) {
    const legacyItems = normalizeStringArray(obj.whitelistNameOrUid_Array);
    if (legacyItems.length === 0) {
        delete obj.whitelistNameOrUid_Switch;
        delete obj.whitelistNameOrUid_Array;
        return;
    }

    const uidItems = legacyItems.filter(isStoragePlainUid);
    const nameItems = legacyItems.filter((item) => !isStoragePlainUid(item));
    const legacyEnabled = obj.whitelistNameOrUid_Switch !== false;

    if (uidItems.length > 0) {
        obj.whitelistUpUid_Array = appendUniqueStorage(obj.whitelistUpUid_Array, uidItems);
        if (legacyEnabled) {
            obj.whitelistUpUid_Switch = true;
        }
    }

    if (nameItems.length > 0) {
        obj.whitelistNameOrUid_Array = nameItems;
        obj.whitelistNameOrUid_Switch = legacyEnabled;
    } else {
        delete obj.whitelistNameOrUid_Switch;
        delete obj.whitelistNameOrUid_Array;
    }
}

function enforceUpIdentityExclusivity(obj) {
    const whitelistUidSet = new Set(normalizeStringArray(obj.whitelistUpUid_Array));
    if (whitelistUidSet.size === 0) {
        return;
    }

    obj.blockedUpUid_Array = normalizeStringArray(obj.blockedUpUid_Array).filter((item) => !whitelistUidSet.has(item));
    if (Object.prototype.hasOwnProperty.call(obj, "blockedNameOrUid_Array")) {
        obj.blockedNameOrUid_Array = normalizeStringArray(obj.blockedNameOrUid_Array).filter(
            (item) => !whitelistUidSet.has(item)
        );
    }
}

function normalizeStringArray(value) {
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function appendUniqueStorage(currentItems, nextItems) {
    return [...new Set([...normalizeStringArray(currentItems), ...normalizeStringArray(nextItems)])];
}

function isStoragePlainUid(value) {
    return /^\d+$/.test(String(value || "").trim());
}

function oldParameterAdaptation(obj) {
    if (Object.prototype.hasOwnProperty.call(obj, "blockedTitleArray")) {
        obj.blockedTitle_Switch = true;
        obj.blockedTitle_UseRegular = true;
        obj.blockedTitle_Array = obj.blockedTitleArray;
        delete obj.blockedTitleArray;

        obj.blockedNameOrUid_Switch = true;
        obj.blockedNameOrUid_UseRegular = true;
        obj.blockedNameOrUid_Array = obj.blockedNameOrUidArray;
        delete obj.blockedNameOrUidArray;

        obj.blockedVideoPartitions_Switch = false;
        obj.blockedVideoPartitions_UseRegular = false;
        obj.blockedVideoPartitions_Array = [];

        obj.blockedTag_Switch = true;
        obj.blockedTag_UseRegular = true;
        obj.blockedTag_Array = obj.blockedTagArray;
        delete obj.blockedTagArray;

        obj.doubleBlockedTag_Switch = true;
        obj.doubleBlockedTag_UseRegular = true;
        obj.doubleBlockedTag_Array = obj.doubleBlockedTagArray;
        delete obj.doubleBlockedTagArray;

        obj.blockedShortDuration_Switch = true;

        obj.whitelistNameOrUid_Switch = false;
        obj.whitelistNameOrUid_Array = [];

        obj.hideVideoMode_Switch = obj.hideVideoModeSwitch;
        delete obj.hideVideoModeSwitch;

        obj.consoleOutputLog_Switch = obj.consoleOutputLogSwitch;
        delete obj.consoleOutputLogSwitch;
    }
}

function deepCloneStorage(value) {
    return JSON.parse(JSON.stringify(value));
}

// ---- src/state/stats-store.js ----
const statsStorageKey = "GM_blockedStats";
function createStatsStore() {
    const data = typeof GM_getValue === "function" ? (GM_getValue(statsStorageKey, null) || {}) : {};

    return {
        increment(ruleKey) {
            data[ruleKey] = (data[ruleKey] || 0) + 1;
            if (typeof GM_setValue === "function") {
                GM_setValue(statsStorageKey, data);
            }
        },
        getData() {
            return { ...data };
        },
        clear() {
            Object.keys(data).forEach((k) => delete data[k]);
            if (typeof GM_setValue === "function") {
                GM_setValue(statsStorageKey, {});
            }
        },
    };
}

// ---- src/state/up-block-stats-store.js ----
const upBlockStatsStorageKey = "GM_blockedUpStats";
const upBlockStatsStorageVersion = 2;
function createUpBlockStatsStore() {
    const normalized = normalizeData(typeof GM_getValue === "function" ? GM_getValue(upBlockStatsStorageKey, null) : null);
    const data = normalized.data;
    const sessionCountedVideoKeys = new Set();

    if (normalized.shouldPersist) {
        persist(data);
    }

    return {
        recordBlockedVideo(videoBv, videoInfo) {
            const normalizedVideoBv = normalizeUpBlockStatsText(videoBv || videoInfo?.videoBv);
            const upUid = normalizeUpBlockStatsText(videoInfo?.videoUpUid);

            if (!normalizedVideoBv || !upUid) {
                return false;
            }

            const countedKey = `${normalizedVideoBv}:${upUid}`;
            if (sessionCountedVideoKeys.has(countedKey)) {
                return false;
            }

            const now = Date.now();
            const previous = data.ups[upUid] || {
                upUid,
                upName: "",
                blockedCount: 0,
                lastReason: "",
                lastVideoTitle: "",
                lastVideoBv: "",
                updatedAt: 0,
            };

            sessionCountedVideoKeys.add(countedKey);
            data.ups[upUid] = {
                ...previous,
                upUid,
                upName: normalizeUpBlockStatsText(videoInfo?.videoUpName) || previous.upName,
                blockedCount: normalizeCount(previous.blockedCount) + 1,
                lastReason: getLatestReason(videoInfo),
                lastVideoTitle: normalizeUpBlockStatsText(videoInfo?.videoTitle),
                lastVideoBv: normalizedVideoBv,
                updatedAt: now,
            };

            persist(data);
            return true;
        },

        getSuggestions(minBlockedCount = 5) {
            return Object.values(data.ups)
                .filter((item) => normalizeCount(item.blockedCount) >= minBlockedCount)
                .sort((a, b) =>
                    normalizeCount(b.blockedCount) - normalizeCount(a.blockedCount) ||
                    normalizeCount(b.updatedAt) - normalizeCount(a.updatedAt)
                )
                .map((item) => ({ ...item }));
        },
    };
}

function normalizeData(rawData) {
    const source = rawData && typeof rawData === "object" ? rawData : {};
    const hadStoredObject = rawData && typeof rawData === "object";
    const rawUps = source.ups && typeof source.ups === "object" ? source.ups : {};
    const legacyCountsByUp = countLegacyVideoKeysByUp(source.countedVideoKeys);

    const ups = Object.fromEntries(
        Object.entries(rawUps)
            .filter(([upUid, item]) => upUid && item && typeof item === "object")
            .map(([upUid, item]) => [
                upUid,
                {
                    upUid: normalizeUpBlockStatsText(item.upUid) || upUid,
                    upName: normalizeUpBlockStatsText(item.upName),
                    blockedCount: hasValidCount(item.blockedCount)
                        ? normalizeCount(item.blockedCount)
                        : normalizeCount(legacyCountsByUp[upUid]),
                    lastReason: normalizeUpBlockStatsText(item.lastReason),
                    lastVideoTitle: normalizeUpBlockStatsText(item.lastVideoTitle),
                    lastVideoBv: normalizeUpBlockStatsText(item.lastVideoBv),
                    updatedAt: normalizeCount(item.updatedAt),
                },
            ])
    );

    for (const [upUid, blockedCount] of Object.entries(legacyCountsByUp)) {
        if (!ups[upUid]) {
            ups[upUid] = {
                upUid,
                upName: "",
                blockedCount: normalizeCount(blockedCount),
                lastReason: "",
                lastVideoTitle: "",
                lastVideoBv: "",
                updatedAt: 0,
            };
        }
    }

    return {
        data: { version: upBlockStatsStorageVersion, ups },
        shouldPersist: hadStoredObject && shouldRewriteStoredData(source),
    };
}

function shouldRewriteStoredData(source) {
    if (source.version !== upBlockStatsStorageVersion) {
        return true;
    }

    return Object.keys(source).some((key) => key !== "version" && key !== "ups");
}

function countLegacyVideoKeysByUp(rawCountedVideoKeys) {
    if (!rawCountedVideoKeys || typeof rawCountedVideoKeys !== "object") {
        return {};
    }

    const countsByUp = {};
    for (const [key, value] of Object.entries(rawCountedVideoKeys)) {
        if (!key) {
            continue;
        }

        const upUid = value && typeof value === "object"
            ? normalizeUpBlockStatsText(value.upUid) || parseUpUidFromKey(key)
            : parseUpUidFromKey(key);
        if (upUid) {
            countsByUp[upUid] = (countsByUp[upUid] || 0) + 1;
        }
    }

    return countsByUp;
}

function parseUpUidFromKey(key) {
    const sep = key.lastIndexOf(":");
    return sep >= 0 ? key.slice(sep + 1) : "";
}

function getLatestReason(videoInfo) {
    const rules = Array.isArray(videoInfo?.triggeredBlockedRules) ? videoInfo.triggeredBlockedRules : [];
    return normalizeUpBlockStatsText(rules[0]);
}

function persist(data) {
    if (typeof GM_setValue === "function") {
        GM_setValue(upBlockStatsStorageKey, {
            version: upBlockStatsStorageVersion,
            ups: data.ups,
        });
    }
}

function normalizeUpBlockStatsText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function hasValidCount(value) {
    return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

// ---- src/utils/log.js ----
// == 调试日志 ================================================================
//
// 职责：
// - 根据 consoleOutputLog_Switch 决定是否输出日志。
// - 提供对象浅对比，避免重复打印 videoInfoDict。

let getSettings = () => ({ consoleOutputLog_Switch: false });function bindLoggerSettings(settingsProvider) {
    getSettings = settingsProvider;
}function consoleLogOutput(...args) {
    if (!getSettings().consoleOutputLog_Switch) {
        return;
    }

    console.log(...args);
}function objectDifferent(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return true;
    }

    for (const key of keys1) {
        if (obj1[key] !== obj2[key]) {
            return true;
        }
    }

    return false;
}

// ---- src/state/video-store.js ----
// == 视频运行时状态 ==========================================================
//
// 职责：
// - 管理 videoInfoDict。
// - 管理 videoUpInfoDict。
// - 管理 lastConsoleVideoInfoDict。
// - 提供“标记命中屏蔽规则”的统一入口。
//
// 不负责：
// - 不直接 fetch。
// - 不直接操作 DOM。
// - 不直接读写 GM 存储。
//
// 原脚本迁移来源：
// - videoInfoDict
// - videoUpInfoDict
// - lastConsoleVideoInfoDict
// - markAsBlockedTarget()
// - handleBlockedXXX() 里对 videoInfoDict 的修改逻辑


const FAV_COIN_RATIO_MIN_VIEWS = 5000;
const FAV_COIN_RATIO_MIN_FAVORITES = 50;
const FAV_COIN_RATIO_MIN_AGE_SECONDS = 7200;
// 视频卡片滚出视口后，缓存保留的宽限期：在此窗口内滚回视口可直接复用缓存，
// 避免重新拉 API + 重跑规则导致的 overlay 闪烁。超过宽限期才真正 prune。
const STALE_VIDEO_INFO_GRACE_MS = 60_000;
function createVideoStore(onRuleHit) {
    const videoInfoDict = {};
    const videoUpInfoDict = {};
    let lastConsoleVideoInfoDict = {};

    return {
        videoInfoDict,
        videoUpInfoDict,

        mergeVideoInfo(videoBv, nextInfo) {
            const previous = videoInfoDict[videoBv];
            // 调用方一般不传 lastSeenAt，此时刷新为当前时间；若显式传入（如测试做时间旅行）则尊重之。
            const lastSeenAt = nextInfo && Object.prototype.hasOwnProperty.call(nextInfo, "lastSeenAt")
                ? nextInfo.lastSeenAt
                : Date.now();
            videoInfoDict[videoBv] = {
                ...previous,
                ...nextInfo,
                lastSeenAt,
            };
        },

        getVideoInfo(videoBv) {
            return videoInfoDict[videoBv];
        },

        getReviewBlockedReasons(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return [];
            }

            return collectReviewBlockedReasons(videoInfo, videoUpInfoDict[videoInfo.videoUpUid], settings);
        },

        getUpInfo(upUid) {
            return videoUpInfoDict[upUid];
        },

        mergeUpInfo(upUid, nextInfo) {
            videoUpInfoDict[upUid] = nextInfo;
        },

        getBlockStats() {
            let total = 0;
            let blocked = 0;
            for (const key in videoInfoDict) {
                total++;
                if (videoInfoDict[key].blockedTarget) {
                    blocked++;
                }
            }
            return { total, blocked, rate: total > 0 ? (blocked / total) : 0 };
        },

        logVideoInfoDictIfChanged(settings) {
            if (!settings.consoleOutputLog_Switch) {
                return;
            }

            if (objectDifferent(lastConsoleVideoInfoDict, videoInfoDict)) {
                consoleLogOutput(Object.keys(videoInfoDict).length, "个视频信息: ", videoInfoDict);
                lastConsoleVideoInfoDict = Object.assign({}, videoInfoDict);
            }
        },

        applyTitleAndUpRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyTitleRule(videoInfo, settings);
            applyUpRule(videoInfo, settings);
        },

        applyVideoStatsRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyShortDurationRule(videoInfo, settings);
            applyBelowVideoViewsRule(videoInfo, settings);
            applyBelowLikesRateRule(videoInfo, settings);
            applyBelowCoinRateRule(videoInfo, settings);
            applyAboveFavoriteCoinRatioRule(videoInfo, settings);
            applyPortraitVideoRule(videoInfo, settings);
            applyChargingExclusiveRule(videoInfo, settings);
            applyVideoPartitionsRule(videoInfo, settings);
        },

        applyTagRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyBlockedTagRule(videoInfo, settings);
            applyDoubleBlockedTagRule(videoInfo, settings);
        },

        applyUpProfileRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo?.videoUpUid) {
                return;
            }

            const upInfo = videoUpInfoDict[videoInfo.videoUpUid];
            if (!upInfo) {
                return;
            }

            applyBelowUpLevelRule(videoInfo, upInfo, settings);
            applyBelowUpFansRule(videoInfo, upInfo, settings);
            applyUpSignsRule(videoInfo, upInfo, settings);
        },

        applyCommentRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            applyFilteredCommentsRule(videoInfo, settings);
            applyTopCommentRule(videoInfo, settings);
        },

        applyWhitelistRules(videoBv, settings) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            const bvWhitelisted =
                settings.whitelistBv_Switch &&
                (settings.whitelistBv_Array || []).some((item) => item == videoBv);
            if (bvWhitelisted) {
                videoInfo.blockedTarget = false;
                return;
            }

            const upUidWhitelisted =
                settings.whitelistUpUid_Switch &&
                (settings.whitelistUpUid_Array || []).some((item) => item == videoInfo.videoUpUid);
            if (upUidWhitelisted) {
                videoInfo.blockedTarget = false;
                return;
            }

            if (settings.whitelistNameOrUid_Switch && videoInfo.videoUpUid) {
                const matched = (settings.whitelistNameOrUid_Array || []).find(
                    (item) => item == videoInfo.videoUpName || item == videoInfo.videoUpUid
                );

                if (matched) {
                    videoInfo.blockedTarget = false;
                }
            }
        },

        resetBlockEvaluation(videoBv) {
            const videoInfo = videoInfoDict[videoBv];
            if (!videoInfo) {
                return;
            }

            videoInfo.blockedTarget = false;
            videoInfo.triggeredBlockedRules = [];
            videoInfo.blockedReasons = [];
        },

        resetAllBlockEvaluations() {
            for (const videoBv in videoInfoDict) {
                const videoInfo = videoInfoDict[videoBv];
                if (!videoInfo) {
                    continue;
                }

                videoInfo.blockedTarget = false;
                videoInfo.triggeredBlockedRules = [];
                videoInfo.blockedReasons = [];
            }
        },

        pruneStaleVideoInfo({ keepBvs = new Set() } = {}) {
            const keepSet = keepBvs instanceof Set ? keepBvs : new Set(keepBvs);
            const now = Date.now();
            for (const videoBv in videoInfoDict) {
                if (keepSet.has(videoBv)) {
                    continue;
                }
                // 宽限期内的条目保留：滚出视口后短期内滚回可直接复用缓存，避免 overlay 闪烁。
                const lastSeenAt = videoInfoDict[videoBv]?.lastSeenAt;
                if (typeof lastSeenAt === "number" && now - lastSeenAt < STALE_VIDEO_INFO_GRACE_MS) {
                    continue;
                }
                delete videoInfoDict[videoBv];
            }
        },
    };

    function applyTitleRule(videoInfo, settings) {
        if (!settings.blockedTitle_Switch || settings.blockedTitle_Array.length === 0 || !videoInfo.videoTitle) {
            return;
        }

        const blockedTitleHitItem = findMatch(
            settings.blockedTitle_Array,
            videoInfo.videoTitle,
            settings.blockedTitle_UseRegular
        );

        if (blockedTitleHitItem) {
            markAsBlockedTarget(videoInfo, settings, "按标题屏蔽", blockedTitleHitItem, {
                configKey: "blockedTitle_Array",
                regularKey: "blockedTitle_UseRegular",
                configValue: blockedTitleHitItem,
                matchedValue: videoInfo.videoTitle,
            });
        }
    }

    function applyUpRule(videoInfo, settings) {
        applyUpUidRule(videoInfo, settings);
        applyUpNameKeywordRule(videoInfo, settings);
    }

    function applyUpUidRule(videoInfo, settings) {
        const blockedUpUidItems = settings.blockedUpUid_Array || [];
        if (!settings.blockedUpUid_Switch || blockedUpUidItems.length === 0 || !videoInfo.videoUpUid) {
            return;
        }

        const matchedUid = blockedUpUidItems.find((item) => item == videoInfo.videoUpUid);
        if (matchedUid) {
            markAsBlockedTarget(videoInfo, settings, "按UP主屏蔽", videoInfo.videoUpUid, {
                configKey: "blockedUpUid_Array",
                configValue: matchedUid,
                matchedValue: videoInfo.videoUpUid,
            });
        }
    }

    function applyUpNameKeywordRule(videoInfo, settings) {
        const keywordItems = settings.blockedUpNameKeyword_Array || [];
        if (!settings.blockedUpNameKeyword_Switch || keywordItems.length === 0 || !videoInfo.videoUpName) {
            return;
        }

        const matchedKeyword = findTextMatch(
            keywordItems,
            videoInfo.videoUpName,
            settings.blockedUpNameKeyword_UseRegular
        );
        if (matchedKeyword) {
            markAsBlockedTarget(videoInfo, settings, "按UP名称关键词屏蔽", matchedKeyword, {
                configKey: "blockedUpNameKeyword_Array",
                regularKey: "blockedUpNameKeyword_UseRegular",
                configValue: matchedKeyword,
                matchedValue: videoInfo.videoUpName,
            });
        }
    }

    function findMatch(patterns, value, useRegular) {
        if (useRegular) {
            return patterns.find((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.find((pattern) => pattern === value);
    }

    function findTextMatch(patterns, value, useRegular) {
        if (useRegular) {
            return patterns.find((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.find((pattern) => String(value).includes(String(pattern)));
    }

    function findMatchInArray(patterns, values, useRegular) {
        let matchedValue = "";
        const matchedPattern = patterns.find((pattern) => {
            const value = values.find((item) => {
                if (useRegular) {
                    return safeRegexTest(pattern, item);
                }

                return pattern == item;
            });

            if (value) {
                matchedValue = value;
                return true;
            }
        });

        return {
            matchedPattern,
            matchedValue,
        };
    }

    function findAllMatches(patterns = [], value, useRegular) {
        if (value === undefined || value === null) {
            return [];
        }

        if (useRegular) {
            return patterns.filter((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.filter((pattern) => pattern === value);
    }

    function findAllTextMatches(patterns = [], value, useRegular) {
        if (value === undefined || value === null) {
            return [];
        }

        if (useRegular) {
            return patterns.filter((pattern) => safeRegexTest(pattern, value));
        }

        return patterns.filter((pattern) => String(value).includes(String(pattern)));
    }

    function findAllMatchesInArray(patterns = [], values = [], useRegular) {
        const matches = [];
        patterns.forEach((pattern) => {
            const matchedValue = values.find((item) => {
                if (useRegular) {
                    return safeRegexTest(pattern, item);
                }

                return pattern == item;
            });

            if (matchedValue) {
                matches.push({ matchedPattern: pattern, matchedValue });
            }
        });

        return matches;
    }

    function applyShortDurationRule(videoInfo, settings) {
        if (!settings.blockedShortDuration_Switch || settings.blockedShortDuration <= 0 || !videoInfo.videoDuration) {
            return;
        }

        if (settings.blockedShortDuration > videoInfo.videoDuration) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低时长", videoInfo.videoDuration + "秒");
        }
    }

    function applyBelowVideoViewsRule(videoInfo, settings) {
        if (
            !settings.blockedBelowVideoViews_Switch ||
            settings.blockedBelowVideoViews <= 0 ||
            videoInfo.videoView == null
        ) {
            return;
        }

        if (settings.blockedBelowVideoViews > videoInfo.videoView) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低播放量", videoInfo.videoView + "次");
        }
    }

    function applyBelowLikesRateRule(videoInfo, settings) {
        if (!settings.blockedBelowLikesRate_Switch || settings.blockedBelowLikesRate <= 0) {
            return;
        }

        // safeRatio 只在数据缺失/分母为 0 时返回 null；真实的 0% 点赞率必须能命中低点赞率规则。
        if (videoInfo.videoLikesRate == null) {
            return;
        }

        if (settings.blockedBelowLikesRate > videoInfo.videoLikesRate) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低点赞率", formatRatio(videoInfo.videoLikesRate) + "%");
        }
    }

    function applyBelowCoinRateRule(videoInfo, settings) {
        if (!settings.blockedBelowCoinRate_Switch || settings.blockedBelowCoinRate <= 0) {
            return;
        }

        if (videoInfo.videoCoinRate == null) {
            return;
        }

        if (settings.blockedBelowCoinRate > videoInfo.videoCoinRate) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低投币率", formatRatio(videoInfo.videoCoinRate) + "%");
        }
    }

    function applyAboveFavoriteCoinRatioRule(videoInfo, settings) {
        if (!settings.blockedAboveFavoriteCoinRatio_Switch || settings.blockedAboveFavoriteCoinRatio <= 0) {
            return;
        }

        if (videoInfo.videoView < FAV_COIN_RATIO_MIN_VIEWS || videoInfo.videoFavorite < FAV_COIN_RATIO_MIN_FAVORITES) {
            return;
        }

        const currentTimeInSeconds = Math.floor(Date.now() / 1000);
        if (currentTimeInSeconds - videoInfo.videoPubdate < FAV_COIN_RATIO_MIN_AGE_SECONDS) {
            return;
        }

        // safeRatio 在投币为 0 时返回 null；此时若有足够收藏，收藏/投币比趋近无穷，直接命中高比值规则。
        const ratio = videoInfo.videoFavoriteCoinRatio == null ? Number.POSITIVE_INFINITY : videoInfo.videoFavoriteCoinRatio;

        if (ratio > settings.blockedAboveFavoriteCoinRatio) {
            markAsBlockedTarget(
                videoInfo,
                settings,
                "屏蔽高收藏投币比",
                (Number.isFinite(ratio) ? formatRatio(ratio) : "∞") + "\nUP主: " + videoInfo.videoUpName
            );
        }
    }

    function applyPortraitVideoRule(videoInfo, settings) {
        if (!settings.blockedPortraitVideo_Switch || !videoInfo.videoResolution?.width) {
            return;
        }

        if (videoInfo.videoResolution.width < videoInfo.videoResolution.height) {
            markAsBlockedTarget(
                videoInfo,
                settings,
                "屏蔽竖屏视频",
                `${videoInfo.videoResolution.width} x ${videoInfo.videoResolution.height}`
            );
        }
    }

    function applyChargingExclusiveRule(videoInfo, settings) {
        if (settings.blockedChargingExclusive_Switch && videoInfo.videoChargingExclusive) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽充电专属视频", videoInfo.videoUpName);
        }
    }

    function applyVideoPartitionsRule(videoInfo, settings) {
        if (
            !settings.blockedVideoPartitions_Switch ||
            settings.blockedVideoPartitions_Array.length === 0 ||
            (!videoInfo.videoPartitions && !videoInfo.videoPartitionId)
        ) {
            return;
        }

        const partitionCandidates = [
            videoInfo.videoPartitions,
            videoInfo.videoPartitionId ? `rid:${videoInfo.videoPartitionId}` : "",
            videoInfo.videoPartitionId ? String(videoInfo.videoPartitionId) : "",
        ].filter(Boolean);

        const matchedPartition = findPartitionMatchInArray(
            settings.blockedVideoPartitions_Array,
            partitionCandidates,
            settings.blockedVideoPartitions_UseRegular
        );

        if (matchedPartition.matchedPattern) {
            markAsBlockedTarget(videoInfo, settings, "按视频分区屏蔽", videoInfo.videoPartitions || matchedPartition.matchedValue, {
                configKey: "blockedVideoPartitions_Array",
                regularKey: "blockedVideoPartitions_UseRegular",
                configValue: matchedPartition.matchedPattern,
                matchedValue: matchedPartition.matchedValue,
            });
        }
    }

    function findPartitionMatchInArray(patterns, values, useRegular) {
        let matchedValue = "";
        const matchedPattern = patterns.find((pattern) => {
            const candidates = getPartitionPatternCandidates(pattern);
            const value = values.find((item) => {
                if (useRegular) {
                    return candidates.some((candidate) => safeRegexTest(candidate, item));
                }

                return candidates.some((candidate) => candidate === item);
            });

            if (value) {
                matchedValue = value;
                return true;
            }
        });

        return {
            matchedPattern,
            matchedValue,
        };
    }

    function getPartitionPatternCandidates(pattern) {
        const value = String(pattern).trim();
        const ridMatch = value.match(/^(.*?)（rid:\s*(\d+)）$/);
        if (!ridMatch) {
            return [value];
        }

        const name = ridMatch[1].trim();
        const rid = ridMatch[2].trim();
        return [value, name, `rid:${rid}`, rid].filter(Boolean);
    }

    function applyBlockedTagRule(videoInfo, settings) {
        if (!settings.blockedTag_Switch || settings.blockedTag_Array.length === 0 || !videoInfo.videoTags) {
            return;
        }

        const { matchedPattern, matchedValue } = findMatchInArray(
            settings.blockedTag_Array,
            videoInfo.videoTags,
            settings.blockedTag_UseRegular
        );

        if (matchedPattern) {
            markAsBlockedTarget(videoInfo, settings, "按标签屏蔽", matchedValue, {
                configKey: "blockedTag_Array",
                regularKey: "blockedTag_UseRegular",
                configValue: matchedPattern,
                matchedValue,
            });
        }
    }

    function applyDoubleBlockedTagRule(videoInfo, settings) {
        if (!settings.doubleBlockedTag_Switch || settings.doubleBlockedTag_Array.length === 0 || !videoInfo.videoTags) {
            return;
        }

        let blockedRulesItemText = "";
        const matchedDoubleTag = settings.doubleBlockedTag_Array.find((doubleBlockedTag) => {
            const doubleBlockedTagSplitArray = doubleBlockedTag.split("|");

            const videoTagHitItem0 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[0], videoTagItem);
                }

                return doubleBlockedTagSplitArray[0] == videoTagItem;
            });

            const videoTagHitItem1 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[1], videoTagItem);
                }

                return doubleBlockedTagSplitArray[1] == videoTagItem;
            });

            if (videoTagHitItem0 && videoTagHitItem1) {
                blockedRulesItemText = `${videoTagHitItem0},${videoTagHitItem1}`;
                return true;
            }
        });

        if (matchedDoubleTag) {
            markAsBlockedTarget(videoInfo, settings, "按双重标签屏蔽", blockedRulesItemText, {
                configKey: "doubleBlockedTag_Array",
                regularKey: "doubleBlockedTag_UseRegular",
                configValue: matchedDoubleTag,
                matchedValue: blockedRulesItemText,
            });
        }
    }

    function applyBelowUpLevelRule(videoInfo, upInfo, settings) {
        if (
            !settings.blockedBelowUpLevel_Switch ||
            settings.blockedBelowUpLevel <= 0 ||
            upInfo.upLevel == null
        ) {
            return;
        }

        if (settings.blockedBelowUpLevel > upInfo.upLevel) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低UP主等级", upInfo.upLevel + "级");
        }
    }

    function applyBelowUpFansRule(videoInfo, upInfo, settings) {
        if (
            !settings.blockedBelowUpFans_Switch ||
            settings.blockedBelowUpFans <= 0 ||
            upInfo.upFans == null
        ) {
            return;
        }

        if (settings.blockedBelowUpFans > upInfo.upFans) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽低UP主粉丝数");
        }
    }

    function applyUpSignsRule(videoInfo, upInfo, settings) {
        if (!settings.blockedUpSigns_Switch || settings.blockedUpSigns_Array.length === 0 || !upInfo.upSign) {
            return;
        }

        const matchedSign = findMatch(settings.blockedUpSigns_Array, upInfo.upSign, settings.blockedUpSigns_UseRegular);

        if (matchedSign) {
            markAsBlockedTarget(videoInfo, settings, "按UP主简介屏蔽", matchedSign, {
                configKey: "blockedUpSigns_Array",
                regularKey: "blockedUpSigns_UseRegular",
                configValue: matchedSign,
                matchedValue: upInfo.upSign,
            });
        }
    }

    // filteredComments 仅在评论 API 成功返回后写入；undefined 表示尚未拉取或请求失败，此时不屏蔽。
    function applyFilteredCommentsRule(videoInfo, settings) {
        if (settings.blockedFilteredCommentsVideo_Switch && videoInfo.filteredComments) {
            markAsBlockedTarget(videoInfo, settings, "屏蔽精选评论的视频", videoInfo.videoUpName);
        }
    }

    function applyTopCommentRule(videoInfo, settings) {
        if (
            !settings.blockedTopComment_Switch ||
            settings.blockedTopComment_Array.length === 0 ||
            !videoInfo.topComment
        ) {
            return;
        }

        const matchedComment = findMatch(
            settings.blockedTopComment_Array,
            videoInfo.topComment,
            settings.blockedTopComment_UseRegular
        );

        if (matchedComment) {
            markAsBlockedTarget(videoInfo, settings, "按置顶评论屏蔽", matchedComment, {
                configKey: "blockedTopComment_Array",
                regularKey: "blockedTopComment_UseRegular",
                configValue: matchedComment,
                matchedValue: videoInfo.topComment,
            });
        }
    }

    function collectReviewBlockedReasons(videoInfo, upInfo, settings) {
        const reasons = [];

        for (const reason of videoInfo.blockedReasons || []) {
            pushUniqueReason(reasons, reason);
        }

        const addReason = (blockedType, blockedItem, metadata = {}) => {
            const hasBlockedItem = blockedItem !== undefined && blockedItem !== null && blockedItem !== "";
            const displayText = settings.hideBlockedRules_Switch || !hasBlockedItem
                ? blockedType
                : blockedType + ": " + blockedItem;
            pushUniqueReason(reasons, createBlockedReason(blockedType, blockedItem, displayText, metadata));
        };

        collectTitleReviewReasons(videoInfo, settings, addReason);
        collectUpReviewReasons(videoInfo, settings, addReason);
        collectVideoPartitionReviewReasons(videoInfo, settings, addReason);
        collectTagReviewReasons(videoInfo, settings, addReason);
        collectUpProfileReviewReasons(upInfo, settings, addReason);
        collectCommentReviewReasons(videoInfo, settings, addReason);

        return reasons;
    }

    function pushUniqueReason(reasons, reason) {
        if (!reason || reasons.some((item) => item.id === reason.id)) {
            return;
        }

        reasons.push(reason);
    }

    function collectTitleReviewReasons(videoInfo, settings, addReason) {
        if (!settings.blockedTitle_Switch || settings.blockedTitle_Array.length === 0 || !videoInfo.videoTitle) {
            return;
        }

        findAllMatches(settings.blockedTitle_Array, videoInfo.videoTitle, settings.blockedTitle_UseRegular)
            .forEach((matchedTitle) => {
                addReason("按标题屏蔽", matchedTitle, {
                    configKey: "blockedTitle_Array",
                    regularKey: "blockedTitle_UseRegular",
                    configValue: matchedTitle,
                    matchedValue: videoInfo.videoTitle,
                });
            });
    }

    function collectUpReviewReasons(videoInfo, settings, addReason) {
        if (settings.blockedUpUid_Switch && videoInfo.videoUpUid) {
            (settings.blockedUpUid_Array || [])
                .filter((item) => item == videoInfo.videoUpUid)
                .forEach((matchedUid) => {
                    addReason("按UP主屏蔽", videoInfo.videoUpUid, {
                        configKey: "blockedUpUid_Array",
                        configValue: matchedUid,
                        matchedValue: videoInfo.videoUpUid,
                    });
                });
        }

        if (!settings.blockedUpNameKeyword_Switch || !videoInfo.videoUpName) {
            return;
        }

        findAllTextMatches(
            settings.blockedUpNameKeyword_Array,
            videoInfo.videoUpName,
            settings.blockedUpNameKeyword_UseRegular
        ).forEach((matchedKeyword) => {
            addReason("按UP名称关键词屏蔽", matchedKeyword, {
                configKey: "blockedUpNameKeyword_Array",
                regularKey: "blockedUpNameKeyword_UseRegular",
                configValue: matchedKeyword,
                matchedValue: videoInfo.videoUpName,
            });
        });
    }

    function collectVideoPartitionReviewReasons(videoInfo, settings, addReason) {
        if (
            !settings.blockedVideoPartitions_Switch ||
            settings.blockedVideoPartitions_Array.length === 0 ||
            (!videoInfo.videoPartitions && !videoInfo.videoPartitionId)
        ) {
            return;
        }

        const partitionCandidates = [
            videoInfo.videoPartitions,
            videoInfo.videoPartitionId ? `rid:${videoInfo.videoPartitionId}` : "",
            videoInfo.videoPartitionId ? String(videoInfo.videoPartitionId) : "",
        ].filter(Boolean);

        findAllPartitionMatchesInArray(
            settings.blockedVideoPartitions_Array,
            partitionCandidates,
            settings.blockedVideoPartitions_UseRegular
        ).forEach(({ matchedPattern, matchedValue }) => {
            addReason("按视频分区屏蔽", videoInfo.videoPartitions || matchedValue, {
                configKey: "blockedVideoPartitions_Array",
                regularKey: "blockedVideoPartitions_UseRegular",
                configValue: matchedPattern,
                matchedValue,
            });
        });
    }

    function collectTagReviewReasons(videoInfo, settings, addReason) {
        if (!videoInfo.videoTags) {
            return;
        }

        if (settings.blockedTag_Switch && settings.blockedTag_Array.length > 0) {
            findAllMatchesInArray(
                settings.blockedTag_Array,
                videoInfo.videoTags,
                settings.blockedTag_UseRegular
            ).forEach(({ matchedPattern, matchedValue }) => {
                addReason("按标签屏蔽", matchedValue, {
                    configKey: "blockedTag_Array",
                    regularKey: "blockedTag_UseRegular",
                    configValue: matchedPattern,
                    matchedValue,
                });
            });
        }

        if (!settings.doubleBlockedTag_Switch || settings.doubleBlockedTag_Array.length === 0) {
            return;
        }

        settings.doubleBlockedTag_Array.forEach((doubleBlockedTag) => {
            const doubleBlockedTagSplitArray = String(doubleBlockedTag).split("|");
            if (doubleBlockedTagSplitArray.length < 2) {
                return;
            }

            const videoTagHitItem0 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[0], videoTagItem);
                }

                return doubleBlockedTagSplitArray[0] == videoTagItem;
            });

            const videoTagHitItem1 = videoInfo.videoTags.find((videoTagItem) => {
                if (settings.doubleBlockedTag_UseRegular) {
                    return safeRegexTest(doubleBlockedTagSplitArray[1], videoTagItem);
                }

                return doubleBlockedTagSplitArray[1] == videoTagItem;
            });

            if (videoTagHitItem0 && videoTagHitItem1) {
                const matchedValue = `${videoTagHitItem0},${videoTagHitItem1}`;
                addReason("按双重标签屏蔽", matchedValue, {
                    configKey: "doubleBlockedTag_Array",
                    regularKey: "doubleBlockedTag_UseRegular",
                    configValue: doubleBlockedTag,
                    matchedValue,
                });
            }
        });
    }

    function collectUpProfileReviewReasons(upInfo, settings, addReason) {
        if (!upInfo || !settings.blockedUpSigns_Switch || settings.blockedUpSigns_Array.length === 0 || !upInfo.upSign) {
            return;
        }

        findAllMatches(settings.blockedUpSigns_Array, upInfo.upSign, settings.blockedUpSigns_UseRegular)
            .forEach((matchedSign) => {
                addReason("按UP主简介屏蔽", matchedSign, {
                    configKey: "blockedUpSigns_Array",
                    regularKey: "blockedUpSigns_UseRegular",
                    configValue: matchedSign,
                    matchedValue: upInfo.upSign,
                });
            });
    }

    function collectCommentReviewReasons(videoInfo, settings, addReason) {
        if (!settings.blockedTopComment_Switch || settings.blockedTopComment_Array.length === 0 || !videoInfo.topComment) {
            return;
        }

        findAllMatches(settings.blockedTopComment_Array, videoInfo.topComment, settings.blockedTopComment_UseRegular)
            .forEach((matchedComment) => {
                addReason("按置顶评论屏蔽", matchedComment, {
                    configKey: "blockedTopComment_Array",
                    regularKey: "blockedTopComment_UseRegular",
                    configValue: matchedComment,
                    matchedValue: videoInfo.topComment,
                });
            });
    }

    function findAllPartitionMatchesInArray(patterns = [], values = [], useRegular) {
        const matches = [];
        patterns.forEach((pattern) => {
            const candidates = getPartitionPatternCandidates(pattern);
            const matchedValue = values.find((item) => {
                if (useRegular) {
                    return candidates.some((candidate) => safeRegexTest(candidate, item));
                }

                return candidates.some((candidate) => candidate === item);
            });

            if (matchedValue) {
                matches.push({ matchedPattern: pattern, matchedValue });
            }
        });

        return matches;
    }

    function markAsBlockedTarget(videoInfo, settings, blockedType, blockedItem, metadata = {}) {
        videoInfo.blockedTarget = true;

        if (!videoInfo.triggeredBlockedRules) {
            videoInfo.triggeredBlockedRules = [];
        }

        if (!videoInfo.blockedReasons) {
            videoInfo.blockedReasons = [];
        }

        const hasBlockedItem = blockedItem !== undefined && blockedItem !== null && blockedItem !== "";
        const blockedRulesItem = settings.blockedOverlayOnlyDisplaysType_Switch || !hasBlockedItem
            ? blockedType
            : blockedType + ": " + blockedItem;

        if (!videoInfo.triggeredBlockedRules.includes(blockedRulesItem)) {
            videoInfo.triggeredBlockedRules.push(blockedRulesItem);
        }

        const blockedReason = createBlockedReason(blockedType, blockedItem, blockedRulesItem, metadata);
        if (!videoInfo.blockedReasons.some((reason) => reason.id === blockedReason.id)) {
            videoInfo.blockedReasons.push(blockedReason);
        }

        if (!videoInfo._recordedStatRules) {
            videoInfo._recordedStatRules = new Set();
        }

        if (!videoInfo._recordedStatRules.has(blockedRulesItem)) {
            videoInfo._recordedStatRules.add(blockedRulesItem);
            onRuleHit?.(hasBlockedItem ? `${blockedType}: ${blockedItem}` : blockedType);
        }
    }

    function createBlockedReason(blockedType, blockedItem, displayText, metadata) {
        const configKey = normalizeReasonValue(metadata.configKey);
        const configValue = normalizeReasonValue(metadata.configValue);
        const matchedValue = normalizeReasonValue(metadata.matchedValue ?? blockedItem);

        return {
            id: [blockedType, configKey, configValue, matchedValue, displayText].join("\u0001"),
            type: blockedType,
            item: normalizeReasonValue(blockedItem),
            displayText,
            configKey,
            regularKey: normalizeReasonValue(metadata.regularKey),
            configValue,
            matchedValue,
            canRemoveConfig: Boolean(configKey && configValue),
        };
    }

    function normalizeReasonValue(value) {
        return value === undefined || value === null ? "" : String(value);
    }

    function formatRatio(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return "";
        }
        return number.toFixed(2);
    }
}

// ---- src/capabilities/registry.js ----
// == 能力边界元信息 ==========================================================
//
// 职责：
// - 维护功能的数据来源、风险等级、关联设置和 API 端点。
// - 给设置 UI、调试输出、文档生成提供同一份结构化来源。
const DATA_SOURCE = {
    DOM: "dom",
    API: "api",
    MIXED: "mixed",
    LOCAL: "local",
};
const RISK_LEVEL = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
};
const CAPABILITY_IDS = {
    TITLE_UP_DOM: "title-up-dom",
    TRENDING_DOM: "trending-dom",
    COMMENT_DOM: "comment-dom",
    PAGE_CLEANUP: "page-cleanup",
    LOCAL_TOOLS: "local-tools",
    VIDEO_VIEW_API: "video-view-api",
    VIDEO_TAGS_API: "video-tags-api",
    VIDEO_REGION_FALLBACK_API: "video-region-fallback-api",
    UP_PROFILE_API: "up-profile-api",
    COMMENT_API: "comment-api",
};
const API_ENDPOINT_IDS = {
    VIDEO_VIEW: "video-view",
    VIDEO_TAGS: "video-tags",
    REGION_NAME: "region-name",
    UP_CARD: "up-card",
    COMMENT_MAIN: "comment-main",
    COMMENT_LEGACY: "comment-legacy",
};
const capabilities = [
    {
        id: CAPABILITY_IDS.TITLE_UP_DOM,
        label: "标题 / UP 屏蔽",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "blockedTitle_Switch",
            "blockedUpUid_Switch",
            "blockedUpNameKeyword_Switch",
        ],
        failurePolicy: "DOM 选择器失效时该能力不判定，不影响其他规则。",
    },
    {
        id: CAPABILITY_IDS.TRENDING_DOM,
        label: "热搜屏蔽",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "hideTrending_Switch",
            "blockedTrendingItemByTitleTag_Switch",
            "blockedTrendingItem_Switch",
        ],
        failurePolicy: "DOM 选择器失效时该能力不判定，不影响视频卡片规则。",
    },
    {
        id: CAPABILITY_IDS.COMMENT_DOM,
        label: "已渲染评论屏蔽",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "blockedCommentText_Switch",
            "blockedCommentUser_Switch",
            "blockedCommentImage_Switch",
            "hideCommentMode_Switch",
        ],
        failurePolicy: "只读取页面已渲染评论，不主动请求评论 API。",
    },
    {
        id: CAPABILITY_IDS.PAGE_CLEANUP,
        label: "页面清理",
        dataSource: DATA_SOURCE.DOM,
        risk: RISK_LEVEL.LOW,
        settings: [
            "hideNonVideoElements_Switch",
        ],
        failurePolicy: "DOM 选择器失效时只影响对应页面元素隐藏。",
    },
    {
        id: CAPABILITY_IDS.LOCAL_TOOLS,
        label: "叠加层 / 导入导出",
        dataSource: DATA_SOURCE.LOCAL,
        risk: RISK_LEVEL.LOW,
        settings: [
            "blockedOverlayOnlyDisplaysType_Switch",
            "hideVideoMode_Switch",
        ],
        failurePolicy: "不依赖外部数据源。",
    },
    {
        id: CAPABILITY_IDS.VIDEO_VIEW_API,
        label: "视频基础 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedVideoPartitions_Switch",
            "blockedShortDuration_Switch",
            "blockedBelowVideoViews_Switch",
            "blockedBelowLikesRate_Switch",
            "blockedBelowCoinRate_Switch",
            "blockedAboveFavoriteCoinRatio_Switch",
            "blockedPortraitVideo_Switch",
            "blockedChargingExclusive_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.VIDEO_VIEW,
        ],
        failurePolicy: "API 不可用时相关规则未判定，并继续执行后续能力。",
    },
    {
        id: CAPABILITY_IDS.VIDEO_TAGS_API,
        label: "标签 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedTag_Switch",
            "doubleBlockedTag_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.VIDEO_TAGS,
        ],
        failurePolicy: "API 不可用时标签规则未判定，并继续执行后续能力。",
    },
    {
        id: CAPABILITY_IDS.VIDEO_REGION_FALLBACK_API,
        label: "分区名称补全 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedVideoPartitions_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.REGION_NAME,
        ],
        failurePolicy: "补全失败时保留 rid 作为可见降级值。",
    },
    {
        id: CAPABILITY_IDS.UP_PROFILE_API,
        label: "UP 资料 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.MEDIUM,
        settings: [
            "blockedBelowUpLevel_Switch",
            "blockedBelowUpFans_Switch",
            "blockedUpSigns_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.UP_CARD,
        ],
        failurePolicy: "API 不可用时 UP 资料规则未判定，并继续执行后续能力。",
    },
    {
        id: CAPABILITY_IDS.COMMENT_API,
        label: "评论 API",
        dataSource: DATA_SOURCE.API,
        risk: RISK_LEVEL.HIGH,
        settings: [
            "blockedFilteredCommentsVideo_Switch",
            "blockedTopComment_Switch",
        ],
        endpoints: [
            API_ENDPOINT_IDS.COMMENT_MAIN,
            API_ENDPOINT_IDS.COMMENT_LEGACY,
        ],
        failurePolicy: "API 不可用时评论相关视频规则未判定，并继续执行后续能力。",
    },
];
function listCapabilities() {
    return capabilities.map((capability) => ({ ...capability }));
}
function getCapability(capabilityId) {
    return capabilities.find((capability) => capability.id === capabilityId) || null;
}

// ---- src/platform/api-client.js ----
// == B 站 API 适配层 =========================================================
//
// 职责：
// - 集中管理所有 B 站 API URL。
// - 处理请求频率限制。
// - 记录 API 请求健康状态。
// - 写入 videoStore，而不是直接操作全局对象。
//
// 不负责：
// - 不判断规则是否命中。
// - 不操作 DOM。
// - 不决定功能是否启用；启用判断在 feature 文件。



const API_RETRY_DELAY_MS = 3000;
const COMMENT_QUEUE_INTERVAL_MS = 100;
const COMMENT_QUEUE_MAX_INTERVAL_MS = 2000;

let getApiSettings = () => ({ accumulateBlockedRules_Switch: false });

function shouldSkipApiWhenBlocked(videoBv, videoStore) {
    const videoInfo = videoStore.getVideoInfo(videoBv);
    if (!videoInfo?.blockedTarget) {
        return false;
    }

    return !getApiSettings().accumulateBlockedRules_Switch;
}
function createBilibiliApiClient() {
    let refreshCallback = () => {};
    const apiHealth = createApiHealthStore();
    const regionNameCache = {};
    const inFlightViewFetches = new Map();
    const inFlightTagFetches = new Map();
    const inFlightCommentFetches = new Map();
    const inFlightUpInfoFetches = new Map();

    const commentRequestQueue = new Set();
    let commentQueueTimer = null;
    let commentQueueInFlight = false;

    function getFallbackRegionName(regionId) {
        return regionId ? `rid:${regionId}` : "";
    }

    function requestRegionNameIfNeeded(regionId, videoStore, videoBv) {
        const cached = regionNameCache[regionId];
        if (cached?.name) {
            videoStore.mergeVideoInfo(videoBv, {
                videoPartitions: cached.name,
            });
            refreshCallback();
            return;
        }

        if (cached?.pending) {
            return;
        }

        regionNameCache[regionId] = {
            name: "",
            pending: true,
        };

        requestApiJson({
            capabilityId: CAPABILITY_IDS.VIDEO_REGION_FALLBACK_API,
            endpointId: API_ENDPOINT_IDS.REGION_NAME,
            url: `https://api.bilibili.com/x/web-interface/dynamic/region?ps=1&rid=${regionId}`,
            emptyWhen: (json) => !json.data?.archives?.[0]?.tname,
        }).then((result) => {
            const regionName = result.json?.data?.archives?.[0]?.tname || "";
            regionNameCache[regionId] = {
                name: regionName || getFallbackRegionName(regionId),
                pending: false,
            };

            videoStore.mergeVideoInfo(videoBv, {
                videoPartitions: regionNameCache[regionId].name,
            });

            if (!result.ok) {
                consoleLogOutput("region API request failed:", result.errorKind, result.message);
            }

            refreshCallback();
        });
    }

    function fetchVideoView(videoBv, videoStore) {
        if (inFlightViewFetches.has(videoBv)) {
            return inFlightViewFetches.get(videoBv);
        }

        if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW)) {
            return Promise.resolve();
        }

        const currentTime = new Date();
        videoStore.mergeVideoInfo(videoBv, {
            lastVideoInfoApiRequestTime: currentTime,
        });
        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.VIDEO_VIEW_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_VIEW,
        });

        const promise = requestApiJson({
            capabilityId: CAPABILITY_IDS.VIDEO_VIEW_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_VIEW,
            url: `https://api.bilibili.com/x/web-interface/view?bvid=${videoBv}`,
            emptyWhen: (json) => !json.data,
        }).then((result) => {
            if (!result.ok) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.UNAVAILABLE, result);
                consoleLogOutput("video view API request failed:", result.errorKind, result.message);
                return;
            }

            const data = result.json?.data;
            if (!data) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.EMPTY, result);
                return;
            }

            const videoView = data.stat?.view;
            const videoLike = data.stat?.like;
            const videoCoin = data.stat?.coin;
            const videoFavorite = data.stat?.favorite;

            const videoPartitionId = data.tid || data.tid_v2;
            const videoPartitionName = data.tname_v2 || data.tname || "";

            videoStore.mergeVideoInfo(videoBv, {
                videoUpName: data.owner?.name || "",
                videoUpUid: data.owner?.mid || "",
                videoAVid: data.aid,
                videoPubdate: data.pubdate,
                videoDuration: data.duration,
                videoPartitionId,
                videoPartitions: videoPartitionName || getFallbackRegionName(videoPartitionId),
                videoView,
                videoLike,
                videoLikesRate: safeRatio(videoLike, videoView, 100),
                videoCoin,
                videoCoinRate: safeRatio(videoCoin, videoView, 100),
                videoFavorite,
                videoFavoriteCoinRatio: safeRatio(videoFavorite, videoCoin, 1),
                videoChargingExclusive: data.is_upower_exclusive,
                videoResolution: {
                    width: data.dimension?.width || 0,
                    height: data.dimension?.height || 0,
                },
            });
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.READY, result);

            if (!videoPartitionName && videoPartitionId) {
                requestRegionNameIfNeeded(videoPartitionId, videoStore, videoBv);
            }
        }).catch((error) => {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW, API_DATA_STATUS.UNAVAILABLE, {
                capabilityId: CAPABILITY_IDS.VIDEO_VIEW_API,
                endpointId: API_ENDPOINT_IDS.VIDEO_VIEW,
                errorKind: "unexpected",
                message: error.message,
            });
            consoleLogOutput("video view API request failed:", error);
        }).finally(() => {
            inFlightViewFetches.delete(videoBv);
        });

        inFlightViewFetches.set(videoBv, promise);
        return promise;
    }

    function fetchVideoTags(videoBv, videoStore) {
        if (inFlightTagFetches.has(videoBv)) {
            return inFlightTagFetches.get(videoBv);
        }

        if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS)) {
            return Promise.resolve();
        }

        const currentTime = new Date();
        videoStore.mergeVideoInfo(videoBv, {
            lastVideoTagApiRequestTime: currentTime,
        });
        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.VIDEO_TAGS_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_TAGS,
        });

        const promise = requestApiJson({
            capabilityId: CAPABILITY_IDS.VIDEO_TAGS_API,
            endpointId: API_ENDPOINT_IDS.VIDEO_TAGS,
            url: `https://api.bilibili.com/x/web-interface/view/detail/tag?bvid=${videoBv}`,
            emptyWhen: (json) => !Array.isArray(json.data) || json.data.length === 0,
        }).then((result) => {
            if (!result.ok) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS, API_DATA_STATUS.UNAVAILABLE, result);
                consoleLogOutput("video tags API request failed:", result.errorKind, result.message);
                return;
            }

            const tags = Array.isArray(result.json?.data)
                ? result.json.data.map((tagsArray) => tagsArray.tag_name).filter(Boolean)
                : [];
            videoStore.mergeVideoInfo(videoBv, {
                videoTags: tags,
            });
            markVideoDataState(
                videoBv,
                videoStore,
                API_DATA_KEYS.VIDEO_TAGS,
                tags.length > 0 ? API_DATA_STATUS.READY : API_DATA_STATUS.EMPTY,
                result
            );
        }).catch((error) => {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS, API_DATA_STATUS.UNAVAILABLE, {
                capabilityId: CAPABILITY_IDS.VIDEO_TAGS_API,
                endpointId: API_ENDPOINT_IDS.VIDEO_TAGS,
                errorKind: "unexpected",
                message: error.message,
            });
            consoleLogOutput("video tags API request failed:", error);
        }).finally(() => {
            inFlightTagFetches.delete(videoBv);
        });

        inFlightTagFetches.set(videoBv, promise);
        return promise;
    }

    function fetchVideoComments(videoBv, videoStore, { force = false } = {}) {
        if (inFlightCommentFetches.has(videoBv)) {
            return inFlightCommentFetches.get(videoBv);
        }

        if (!force && !shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS)) {
            return Promise.resolve(null);
        }

        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.COMMENT_API,
            endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
        });

        const promise = ensureVideoAid(videoBv, videoStore)
            .then((aid) => requestVideoCommentsByOid(aid || videoBv))
            .then((result) => {
                if (!result.ok) {
                    markVideoDataState(
                        videoBv,
                        videoStore,
                        API_DATA_KEYS.VIDEO_COMMENTS,
                        API_DATA_STATUS.UNAVAILABLE,
                        result
                    );
                    consoleLogOutput("video comments API request failed:", result.errorKind, result.message);
                    return null;
                }

                const commentData = result.json?.data;
                if (!commentData) {
                    markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.EMPTY, result);
                    return {
                        filteredComments: false,
                        topComment: "",
                    };
                }

                const nextInfo = {
                    filteredComments: Boolean(commentData.control?.web_selection),
                    topComment: readTopCommentMessage(commentData),
                };
                const hasCommentSignal = nextInfo.filteredComments || nextInfo.topComment;
                markVideoDataState(
                    videoBv,
                    videoStore,
                    API_DATA_KEYS.VIDEO_COMMENTS,
                    hasCommentSignal ? API_DATA_STATUS.READY : API_DATA_STATUS.EMPTY,
                    result
                );
                return nextInfo;
            })
            .catch((error) => {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.UNAVAILABLE, {
                    capabilityId: CAPABILITY_IDS.COMMENT_API,
                    endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
                    errorKind: "unexpected",
                    message: error.message,
                });
                consoleLogOutput("video comments API request failed:", error);
                return null;
            })
            .finally(() => {
                inFlightCommentFetches.delete(videoBv);
            });

        inFlightCommentFetches.set(videoBv, promise);
        return promise;
    }

    function ensureVideoAid(videoBv, videoStore) {
        const videoInfo = videoStore.getVideoInfo(videoBv);
        if (videoInfo?.videoAVid) {
            return Promise.resolve(videoInfo.videoAVid);
        }

        return fetchVideoView(videoBv, videoStore)
            .then(() => videoStore.getVideoInfo(videoBv)?.videoAVid || "");
    }

    function requestVideoCommentsByOid(oid) {
        const params = new URLSearchParams({
            type: 1,
            oid,
            mode: 3,
            next: 0,
            ps: 1,
        }).toString();

        return requestApiJson({
            capabilityId: CAPABILITY_IDS.COMMENT_API,
            endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
            url: `https://api.bilibili.com/x/v2/reply/main?${params}`,
            emptyWhen: (json) => !json.data,
        }).then((result) => {
            if (result.ok) {
                return result;
            }

            return requestLegacyVideoCommentsByOid(oid);
        });
    }

    function requestLegacyVideoCommentsByOid(oid) {
        const params = new URLSearchParams({
            type: 1,
            oid,
            sort: 0,
            ps: 1,
            pn: 1,
            nohot: 0,
        }).toString();

        return requestApiJson({
            capabilityId: CAPABILITY_IDS.COMMENT_API,
            endpointId: API_ENDPOINT_IDS.COMMENT_LEGACY,
            url: `https://api.bilibili.com/x/v2/reply?${params}`,
            emptyWhen: (json) => !json.data,
        });
    }

    function requestUpInfo(videoBv, videoStore, upUid) {
        if (inFlightUpInfoFetches.has(upUid)) {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.PENDING, {
                capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
                endpointId: API_ENDPOINT_IDS.UP_CARD,
            });
            return inFlightUpInfoFetches.get(upUid);
        }

        if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, { allowReady: true })) {
            return Promise.resolve();
        }

        const currentTime = new Date();
        videoStore.mergeVideoInfo(videoBv, {
            lastVideoUpInfoApiRequestTime: currentTime,
        });
        markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.PENDING, {
            capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
            endpointId: API_ENDPOINT_IDS.UP_CARD,
        });

        const promise = requestApiJson({
            capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
            endpointId: API_ENDPOINT_IDS.UP_CARD,
            url: `https://api.bilibili.com/x/web-interface/card?mid=${upUid}`,
            emptyWhen: (json) => !json.data?.card,
        }).then((result) => {
            if (!result.ok) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.UNAVAILABLE, result);
                consoleLogOutput("UP profile API request failed:", result.errorKind, result.message);
                return;
            }

            const card = result.json?.data?.card;
            if (!card) {
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.EMPTY, result);
                return;
            }

            videoStore.mergeUpInfo(upUid, {
                upName: card.name,
                upLevel: card.level_info?.current_level,
                upFans: card.fans,
                upSign: card.sign,
                updateTime: new Date(),
            });

            videoStore.mergeVideoInfo(videoBv, {
                videoUpLevel: card.level_info?.current_level,
                videoUpFans: card.fans,
                videoUpSign: card.sign,
            });
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.READY, result);
        }).catch((error) => {
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.UNAVAILABLE, {
                capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
                endpointId: API_ENDPOINT_IDS.UP_CARD,
                errorKind: "unexpected",
                message: error.message,
            });
            consoleLogOutput("UP profile API request failed:", error);
        }).finally(() => {
            inFlightUpInfoFetches.delete(upUid);
            refreshCallback();
        });

        inFlightUpInfoFetches.set(upUid, promise);
        return promise;
    }

    function requestApiJson({ capabilityId, endpointId, url, emptyWhen = () => false }) {
        const startedAt = Date.now();
        let httpStatus = null;

        return fetch(url)
            .then((response) => {
                httpStatus = response.status;
                return response.json().then((json) => ({ response, json }));
            })
            .then(({ response, json }) => {
                const durationMs = Date.now() - startedAt;
                const apiCode = readApiCode(json);
                const baseDetails = {
                    capabilityId,
                    endpointId,
                    httpStatus,
                    apiCode,
                    durationMs,
                };

                if (!response.ok) {
                    const result = {
                        ...baseDetails,
                        ok: false,
                        dataStatus: API_DATA_STATUS.UNAVAILABLE,
                        json,
                        errorKind: "http",
                        message: response.statusText || `HTTP ${response.status}`,
                    };
                    apiHealth.recordFailure(result);
                    return result;
                }

                if (apiCode !== null && apiCode !== 0) {
                    const result = {
                        ...baseDetails,
                        ok: false,
                        dataStatus: API_DATA_STATUS.UNAVAILABLE,
                        json,
                        errorKind: "api-code",
                        message: readApiMessage(json) || `code ${apiCode}`,
                    };
                    apiHealth.recordFailure(result);
                    return result;
                }

                if (emptyWhen(json)) {
                    const result = {
                        ...baseDetails,
                        ok: true,
                        dataStatus: API_DATA_STATUS.EMPTY,
                        json,
                    };
                    apiHealth.recordEmpty(result);
                    return result;
                }

                const result = {
                    ...baseDetails,
                    ok: true,
                    dataStatus: API_DATA_STATUS.READY,
                    json,
                };
                apiHealth.recordSuccess(result);
                return result;
            })
            .catch((error) => {
                const result = {
                    capabilityId,
                    endpointId,
                    ok: false,
                    dataStatus: API_DATA_STATUS.UNAVAILABLE,
                    httpStatus,
                    apiCode: null,
                    durationMs: Date.now() - startedAt,
                    json: null,
                    errorKind: "network",
                    message: error.message || String(error),
                };
                apiHealth.recordFailure(result);
                return result;
            });
    }

    return {
        setRefreshCallback(callback) {
            refreshCallback = callback;
        },

        setSettingsProvider(settingsProvider) {
            getApiSettings = settingsProvider;
        },

        getApiHealthSnapshot() {
            return apiHealth.getSnapshot();
        },

        getCapability(capabilityId) {
            return getCapabilityMetadata(capabilityId);
        },

        listCapabilities() {
            return listCapabilities();
        },

        getVideoDataStatus(videoBv, videoStore, dataKey) {
            return readVideoDataState(videoBv, videoStore, dataKey);
        },

        ensurePartitionData(videoBv, videoStore, { bypassBlockedSkip = false } = {}) {
            const cached = partitionFromVideoInfo(videoStore.getVideoInfo(videoBv));
            if (cached && (cached.name || cached.id)) {
                return Promise.resolve(cached);
            }

            if (!bypassBlockedSkip && shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return Promise.resolve({ name: "", id: "" });
            }

            return fetchVideoView(videoBv, videoStore).then(() => {
                return partitionFromVideoInfo(videoStore.getVideoInfo(videoBv)) || { name: "", id: "" };
            });
        },

        ensureTagsData(videoBv, videoStore, { bypassBlockedSkip = false } = {}) {
            const videoTags = videoStore.getVideoInfo(videoBv)?.videoTags;
            if (videoTags) {
                return Promise.resolve(videoTags);
            }

            if (!bypassBlockedSkip && shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return Promise.resolve([]);
            }

            return fetchVideoTags(videoBv, videoStore).then(() => {
                return videoStore.getVideoInfo(videoBv)?.videoTags || [];
            });
        },

        requestVideoInfoIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo || videoInfo.videoDuration !== undefined) {
                return;
            }

            if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW)) {
                return;
            }

            fetchVideoView(videoBv, videoStore)
                .then(() => refreshCallback());
        },

        requestVideoTagsIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo || videoInfo.videoTags) {
                return;
            }

            if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS)) {
                return;
            }

            fetchVideoTags(videoBv, videoStore)
                .then(() => refreshCallback());
        },

        requestUpInfoIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo?.videoUpUid) {
                return;
            }

            const upUid = videoInfo.videoUpUid;
            const videoUpInfo = videoStore.getUpInfo(upUid);
            const currentTime = new Date();

            if (videoUpInfo?.upLevel && currentTime - videoUpInfo.updateTime < 3600000) {
                videoStore.mergeVideoInfo(videoBv, {
                    videoUpLevel: videoUpInfo.upLevel,
                    videoUpFans: videoUpInfo.upFans,
                    videoUpSign: videoUpInfo.upSign,
                });
                markVideoDataState(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE, API_DATA_STATUS.READY, {
                    capabilityId: CAPABILITY_IDS.UP_PROFILE_API,
                    endpointId: API_ENDPOINT_IDS.UP_CARD,
                });
                return;
            }

            requestUpInfo(videoBv, videoStore, upUid);
        },

        requestCommentsIfNeeded(videoBv, videoStore) {
            if (shouldSkipApiWhenBlocked(videoBv, videoStore)) {
                return;
            }

            const videoInfo = videoStore.getVideoInfo(videoBv);
            if (!videoInfo || videoInfo.filteredComments === false || videoInfo.filteredComments === true) {
                return;
            }

            const currentTime = new Date();
            if (
                videoInfo.lastVideoCommentsApiRequestTime &&
                currentTime - videoInfo.lastVideoCommentsApiRequestTime < API_RETRY_DELAY_MS
            ) {
                return;
            }

            if (!shouldRequestVideoData(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS)) {
                return;
            }

            videoStore.mergeVideoInfo(videoBv, {
                lastVideoCommentsApiRequestTime: new Date(),
            });
            markVideoDataState(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS, API_DATA_STATUS.PENDING, {
                capabilityId: CAPABILITY_IDS.COMMENT_API,
                endpointId: API_ENDPOINT_IDS.COMMENT_MAIN,
            });

            commentRequestQueue.add(videoBv);
            scheduleCommentQueue(videoStore);
        },
    };

    function scheduleCommentQueue(videoStore) {
        if (commentQueueTimer || commentQueueInFlight) {
            return;
        }

        const interval = Math.min(
            commentRequestQueue.size * COMMENT_QUEUE_INTERVAL_MS,
            COMMENT_QUEUE_MAX_INTERVAL_MS
        );

        commentQueueTimer = setTimeout(() => {
            commentQueueTimer = null;
            drainCommentQueue(videoStore);
        }, interval);
    }

    function drainCommentQueue(videoStore) {
        if (commentQueueInFlight) {
            return;
        }

        const nextBv = commentRequestQueue.values().next().value;
        if (!nextBv) {
            return;
        }

        commentRequestQueue.delete(nextBv);
        commentQueueInFlight = true;

        fetchVideoComments(nextBv, videoStore, { force: true })
            .then((commentData) => {
                if (commentData) {
                    videoStore.mergeVideoInfo(nextBv, commentData);
                }
            })
            .catch((error) => {
                consoleLogOutput("comment queue processing failed:", error);
            })
            .finally(() => {
                commentQueueInFlight = false;
                refreshCallback();
                if (commentRequestQueue.size > 0) {
                    scheduleCommentQueue(videoStore);
                }
            });
    }
}

function shouldRequestVideoData(videoBv, videoStore, dataKey, { allowReady = false } = {}) {
    const state = readVideoDataState(videoBv, videoStore, dataKey);
    if (state.status === API_DATA_STATUS.PENDING || (state.status === API_DATA_STATUS.READY && !allowReady)) {
        return false;
    }

    if (
        (state.status === API_DATA_STATUS.EMPTY || state.status === API_DATA_STATUS.UNAVAILABLE) &&
        state.updatedAtMs &&
        Date.now() - state.updatedAtMs < API_RETRY_DELAY_MS
    ) {
        return false;
    }

    return true;
}

function readVideoDataState(videoBv, videoStore, dataKey) {
    const state = videoStore.getVideoInfo(videoBv)?.apiDataStates?.[dataKey];
    if (!state) {
        return {
            status: API_DATA_STATUS.UNKNOWN,
            updatedAtMs: null,
            capabilityId: "",
            endpointId: "",
            errorKind: "",
            message: "",
        };
    }

    return { ...state };
}

function markVideoDataState(videoBv, videoStore, dataKey, status, details = {}) {
    const videoInfo = videoStore.getVideoInfo(videoBv) || {};
    videoStore.mergeVideoInfo(videoBv, {
        apiDataStates: {
            ...(videoInfo.apiDataStates || {}),
            [dataKey]: {
                status,
                updatedAtMs: Date.now(),
                capabilityId: details.capabilityId || videoInfo.apiDataStates?.[dataKey]?.capabilityId || "",
                endpointId: details.endpointId || videoInfo.apiDataStates?.[dataKey]?.endpointId || "",
                httpStatus: details.httpStatus ?? null,
                apiCode: details.apiCode ?? null,
                errorKind: details.errorKind || "",
                message: details.message || "",
            },
        },
    });
}

function partitionFromVideoInfo(info) {
    if (!info?.videoPartitions && !info?.videoPartitionId) {
        return null;
    }

    const id = info.videoPartitionId ? String(info.videoPartitionId) : "";
    let name = info.videoPartitions || "";
    if (/^rid:\d+$/.test(name)) {
        name = "";
    }

    return { name, id };
}

function readTopCommentMessage(commentData) {
    return commentData?.top?.upper?.content?.message || commentData?.upper?.top?.content?.message || "";
}

function readApiCode(json) {
    if (!json || typeof json.code === "undefined") {
        return null;
    }

    return Number(json.code);
}

function readApiMessage(json) {
    return json?.message || json?.msg || "";
}

function safeRatio(numerator, denominator, scale) {
    const n = Number(numerator);
    const d = Number(denominator);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
        return null;
    }

    return Number(((n / d) * scale).toFixed(2));
}

// ---- src/platform/dom-adapter.js ----
// == B 站 DOM 适配层 =========================================================
//
// 职责：
// - 集中管理 B 站页面 selector。
// - 判断哪些 URL 不需要处理视频屏蔽。
// - 获取视频卡片元素。
// - 从视频卡片读取 BV、标题、链接、UP 名称、UID。
// - 获取热搜项。
// - 隐藏非视频元素。
//
// 不负责：
// - 不判断具体屏蔽规则。
// - 不请求 API。
// - 不创建叠加层。
//
// 原脚本迁移来源：
// - noBlockedVideoUrls
// - determineURL()
// - getVideoElements()
// - isAlreadyBlockedChildElement()
// - getBvAndTitle()
// - getNameAndUid()
// - getTrendingItemElements()
// - hideNonVideoElements()

const noBlockedVideoUrls = [
    /^https:\/\/www\.bilibili\.com\/anime\//,
    /^https:\/\/live\.bilibili\.com\//,
    /^https:\/\/account\.bilibili\.com\//,
    /^https:\/\/message\.bilibili\.com\//,
    /^https:\/\/t\.bilibili\.com\//,
    /^https:\/\/space\.bilibili\.com\/[0-9]+/,
    /^https:\/\/www\.bilibili\.com\/history/,
    /^https:\/\/link\.bilibili\.com\//,
];

const commentShadowRootObservers = new WeakMap();
let commentDocumentObserver = null;
let commentChangeCallback = null;
let commentChangeTimer = null;
let commentShadowRootDiscoveryTimer = null;

const commentContentSelectors = [
    ".reply-content",
    ".sub-reply-content",
    ".reply-content-text",
    ".sub-reply-content-text",
    ".reply-content-container",
    ".reply-text",
    ".comment-content",
    ".content",
    "#contents",
    "bili-rich-text",
    "bili-comment-rich-text",
    "bili-comment-content-renderer",
    "[class*='reply-content']",
    "[class*='reply-text']",
    "[class*='comment-content']",
    "[class*='rich-text']",
];

const commentUserSelectors = [
    ".reply-name",
    ".sub-user-name",
    ".user-name",
    ".name",
    "a[href*='space.bilibili.com/']",
    "[class*='reply-name']",
    "[class*='user-name']",
];

const excludedCommentImageUrlParts = [
    "bfs/face",
    "bfs/emote",
    "bfs/garb",
    "bfs/vip",
    "bfs/member",
    "bfs/pendant",
    "avatar",
];

const commentObservedAttributeNames = [
    "aria-label",
    "data-mid",
    "data-original",
    "data-src",
    "data-uid",
    "data-uname",
    "data-url",
    "data-user-id",
    "data-user-name",
    "href",
    "mid",
    "src",
    "style",
    "title",
    "uid",
    "uname",
    "user-id",
    "user-name",
];

const videoCardSelectors = [
    "div.bili-video-card",
    "div.video-page-card-small",
    "li.bili-rank-list-video__item",
    "div.video-card",
    "li.rank-item",
    "div.video-card-reco",
    "div.video-card-common",
    "div.rank-wrap",
].join(", ");function createBilibiliDomAdapter() {
    return {
        shouldSkipVideoBlocking(currentUrl) {
            return noBlockedVideoUrls.some((urlRule) => urlRule.test(currentUrl));
        },

        getVideoElements() {
            return collectVideoElements([document]);
        },

        getVideoElementsFromMutationRecords(records) {
            const addedNodes = [];

            for (const record of records || []) {
                if (record?.type !== "childList") {
                    continue;
                }

                addedNodes.push(...record.addedNodes);
            }

            return collectVideoElements(addedNodes);
        },

        isAlreadyBlockedChildElement(videoElement) {
            // 仅跳过 card-box 延迟叠加层动画中的卡片（与 legacy 仅跳过 blur pending 一致）
            return videoElement.dataset.bbvtBlocked === "pending";
        },

        readVideoRef(videoElement) {
            const videoLinkElements = videoElement.querySelectorAll("a");
            let videoBv;
            let videoLink;

            for (let videoLinkElement of videoLinkElements) {
                if (videoBv) {
                    continue;
                }

                if (videoLinkElement.className == "other-link") {
                    continue;
                }

                const videoBvTemp = videoLinkElement.href.match(/\/(BV\w+)/);
                if (videoBvTemp) {
                    videoBv = videoBvTemp[1];
                    videoLink = videoLinkElement.href;
                    continue;
                }

                const videoAvTemp = videoLinkElement.href.match(/\/(av)(\d+)/);
                if (videoAvTemp) {
                    videoBv = av2bv(videoAvTemp[2]);
                    videoLink = videoLinkElement.href;
                }
            }

            if (!videoBv) {
                return null;
            }

            const titleElement = videoElement.querySelector("[title]:not(span)");

            return {
                videoBv,
                videoLink,
                videoTitle: titleElement?.title || "",
            };
        },

        readVideoBasicInfo(videoElement) {
            const videoLinkElements = videoElement.querySelectorAll("a");

            for (let videoLinkElement of videoLinkElements) {
                const uidLink = videoLinkElement.href.match(/space\.bilibili\.com\/(\d+)/);
                if (uidLink) {
                    return {
                        videoUpUid: uidLink[1],
                        videoUpName: videoLinkElement.querySelector("span")?.innerText || "",
                    };
                }
            }

            return {};
        },

        getTrendingItemElements() {
            return Array.from(document.querySelectorAll("div.trending-item"));
        },

        hideTrendingModule(settings) {
            if (!settings.hideTrending_Switch) return;
            document.querySelectorAll("div.trending").forEach((el) => {
                el.style.display = "none";
            });
        },

        shouldHandleCommentFiltering(currentUrl) {
            return /^https:\/\/www\.bilibili\.com\/video\//.test(currentUrl);
        },

        getCommentElements() {
            const primarySelectors = [
                "div.reply-item",
                "div.root-reply-container",
                "div.sub-reply-item",
                "bili-comment-renderer",
                "bili-comment-reply-renderer",
            ];
            const fallbackSelectors = [
                "div.reply-wrap",
                "bili-comment-thread-renderer",
            ];

            const primaryElements = querySelectorAllDeep(document, primarySelectors.join(","))
                .filter(isFilterableCommentElement);

            if (primaryElements.length > 0) {
                return primaryElements;
            }

            return querySelectorAllDeep(document, fallbackSelectors.join(","))
                .filter(isFilterableCommentElement);
        },

        readCommentInfo(commentElement) {
            const contentElement = getCommentContentElement(commentElement);
            return {
                text: readCommentText(commentElement),
                userId: readCommentUserId(commentElement),
                userName: readCommentUserName(commentElement),
                hasImage: hasCommentContentImage(commentElement, contentElement),
            };
        },

        getCommentBlockTarget(commentElement) {
            return getCommentBlockTarget(commentElement);
        },

        observeCommentChanges(callback) {
            observeCommentShadowRoots(callback);
        },

        hideNonVideoElements() {
            if (window.location.href.startsWith("https://www.bilibili.com/")) {
                hideElementsBySelector(
                    `div.floor-single-card,
                    div.feed-card:has(a[href^="//cm.bilibili.com/"]),
                    div.bili-feed-card:has(a[href^="//cm.bilibili.com/"]),
                    div.bili-feed-card:has(a[href^="https://live.bilibili.com/"])`,
                    `div.floor-single-card, div.feed-card, div.bili-feed-card`,
                    (el) =>
                        el.querySelector(`a[href^="//cm.bilibili.com/"], a[href^="https://live.bilibili.com/"]`),
                    (el) => el.classList.add("hideAD")
                );
            }

            if (window.location.href.startsWith("https://search.bilibili.com/all")) {
                hideElementsBySelector(
                    `div.bili-video-card:has(a[href^="https://www.bilibili.com/cheese/"]),
                    div.bili-video-card:has(a[href^="//cm.bilibili.com/"]),
                    div.bili-video-card:has(a[href^="//live.bilibili.com/"])`,
                    `div.bili-video-card`,
                    (el) =>
                        el.querySelector(
                            `a[href^="https://www.bilibili.com/cheese/"], a[href^="//cm.bilibili.com/"], a[href^="//live.bilibili.com/"]`
                        ),
                    (el) => el.parentNode?.classList.add("hideAD")
                );
            }

            if (window.location.href.startsWith("https://www.bilibili.com/video/")) {
                document
                    .querySelectorAll(
                        `div#slide_ad,
                        .ad-report,
                        div.video-page-game-card-small,
                        div.video-page-special-card-small,
                        div.video-page-operator-card-small,
                        div.pop-live-small-mode,
                        div.activity-m-v1,
                        div.video-card-ad-small`
                    )
                    .forEach((el) => el.classList.add("hideAD"));
            }
        },
    };
}

function hideElementsBySelector(selector, fallbackSelector, matchesPredicate, applyFn) {
    let elements;
    try {
        elements = document.querySelectorAll(selector);
    } catch {
        // :has() 等选择器不被支持时浏览器抛 SyntaxError，降级为父选择器 + 二次过滤
        elements = [...(document.querySelectorAll(fallbackSelector) || [])].filter(matchesPredicate);
    }
    elements.forEach(applyFn);
}

function readCommentText(commentElement) {
    const contentElement = getCommentContentElement(commentElement);
    return combineCommentTexts(
        readCommentDataText(commentElement),
        readTextDeep(contentElement || commentElement)
    );
}

function getCommentContentElement(commentElement) {
    return querySelectorDeep(commentElement, commentContentSelectors.join(","));
}

function getCommentBlockTarget(commentElement) {
    if (isSubCommentElement(commentElement)) {
        return commentElement;
    }

    return closestComposed(
        commentElement,
        [
            "bili-comment-thread-renderer",
            "div.reply-item",
            "div.reply-wrap",
            "div.comment-list-item",
        ]
    ) || commentElement;
}

function isSubCommentElement(commentElement) {
    const tagName = commentElement?.tagName?.toLowerCase?.() || "";
    const className = String(commentElement?.className || "");
    return tagName === "bili-comment-reply-renderer" ||
        commentElement?.classList?.contains?.("sub-reply-item") ||
        className.split(/\s+/).includes("sub-reply-item");
}

function closestComposed(element, selectors) {
    let current = element;
    while (current) {
        if (current.nodeType === 1 && selectors.some((selector) => current.matches?.(selector))) {
            return current;
        }

        current = getComposedParent(current);
    }

    return null;
}

function getComposedParent(node) {
    if (node?.parentElement) {
        return node.parentElement;
    }

    if (node?.parentNode?.host) {
        return node.parentNode.host;
    }

    return node?.parentNode?.nodeType === 1 ? node.parentNode : null;
}

function readCommentDataText(commentElement) {
    const parts = [];
    collectCommentDataText(commentElement, parts, new WeakSet());
    return parts.join(" ");
}

function collectCommentDataText(node, parts, visitedShadowRoots) {
    if (!node) {
        return;
    }

    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) {
        return;
    }

    const dataText = readCommentDataMessage(node.__data) || readCommentDataMessage(node.data);
    if (dataText) {
        parts.push(dataText);
    }

    if (node.nodeType === 1 && node.shadowRoot && !visitedShadowRoots.has(node.shadowRoot)) {
        visitedShadowRoots.add(node.shadowRoot);
        collectCommentDataText(node.shadowRoot, parts, visitedShadowRoots);
    }

    node.childNodes?.forEach((child) => collectCommentDataText(child, parts, visitedShadowRoots));
}

function readCommentDataMessage(data) {
    if (typeof data === "string") {
        return normalizeDomText(data);
    }

    if (!data || typeof data !== "object") {
        return "";
    }

    const candidates = [
        data.content?.message,
        data.reply?.content?.message,
        data.comment?.content?.message,
        data.item?.content?.message,
        data.root?.content?.message,
        data.message,
    ];

    return normalizeDomText(candidates.find((value) => typeof value === "string" && value.trim()) || "");
}

function combineCommentTexts(...texts) {
    const normalizedTexts = texts.map(normalizeDomText).filter(Boolean);
    const uniqueTexts = [];

    normalizedTexts.forEach((text) => {
        if (uniqueTexts.some((existingText) => existingText === text || existingText.includes(text))) {
            return;
        }

        const shorterTextIndex = uniqueTexts.findIndex((existingText) => text.includes(existingText));
        if (shorterTextIndex >= 0) {
            uniqueTexts.splice(shorterTextIndex, 1);
        }

        uniqueTexts.push(text);
    });

    return uniqueTexts.join(" ");
}

function readCommentUserId(commentElement) {
    const dataId = readCommentDataUserId(commentElement);
    if (dataId) {
        return dataId;
    }

    const directId = readElementValue(commentElement, ["mid", "uid", "userId"], ["mid", "uid", "user-id", "data-mid", "data-uid", "data-user-id"]);
    if (directId) {
        return directId;
    }

    const userElement = querySelectorDeep(commentElement, "[mid], [uid], [user-id], [data-mid], [data-uid], [data-user-id]");
    const userElementId = readElementValue(userElement, ["mid", "uid", "userId"], ["mid", "uid", "user-id", "data-mid", "data-uid", "data-user-id"]);
    if (userElementId) {
        return userElementId;
    }

    const userLink = querySelectorDeep(commentElement, "a[href*='space.bilibili.com/']");
    const href = userLink?.href || userLink?.getAttribute?.("href") || "";
    const match = href.match(/space\.bilibili\.com\/(\d+)/);
    return match?.[1] || "";
}

function readCommentUserName(commentElement) {
    const dataName = readCommentDataUserName(commentElement);
    if (dataName) {
        return dataName;
    }

    const directName = readElementValue(commentElement, ["userName", "uname"], ["user-name", "uname", "data-user-name", "data-uname"]);
    if (directName) {
        return directName;
    }

    const userElement = querySelectorDeep(commentElement, commentUserSelectors.join(","));
    if (!userElement) {
        return "";
    }

    return normalizeDomText(
        readElementValue(userElement, ["userName", "uname"], ["title", "aria-label", "user-name", "uname", "data-user-name", "data-uname"]) ||
        readTextDeep(userElement)
    );
}

function readCommentDataUserId(commentElement) {
    return readFirstCommentDataValue(commentElement, (data) => readCommentDataCandidate([
        data?.member?.mid,
        data?.member?.mid_str,
        data?.member?.uid,
        data?.user?.mid,
        data?.user?.mid_str,
        data?.user?.uid,
        data?.reply?.member?.mid,
        data?.reply?.member?.mid_str,
        data?.comment?.member?.mid,
        data?.comment?.member?.mid_str,
        data?.item?.member?.mid,
        data?.item?.member?.mid_str,
        data?.mid,
        data?.mid_str,
        data?.uid,
    ]));
}

function readCommentDataUserName(commentElement) {
    return readFirstCommentDataValue(commentElement, (data) => readCommentDataCandidate([
        data?.member?.uname,
        data?.member?.name,
        data?.user?.uname,
        data?.user?.name,
        data?.reply?.member?.uname,
        data?.reply?.member?.name,
        data?.comment?.member?.uname,
        data?.comment?.member?.name,
        data?.item?.member?.uname,
        data?.item?.member?.name,
        data?.userName,
        data?.uname,
        data?.name,
    ]));
}

function readFirstCommentDataValue(node, reader, visitedShadowRoots = new WeakSet()) {
    if (!node || (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11)) {
        return "";
    }

    const dataValue = reader(node.__data) || reader(node.data);
    if (dataValue) {
        return dataValue;
    }

    if (node.nodeType === 1 && node.shadowRoot && !visitedShadowRoots.has(node.shadowRoot)) {
        visitedShadowRoots.add(node.shadowRoot);
        const shadowValue = readFirstCommentDataValue(node.shadowRoot, reader, visitedShadowRoots);
        if (shadowValue) {
            return shadowValue;
        }
    }

    for (const child of node.childNodes || []) {
        const childValue = readFirstCommentDataValue(child, reader, visitedShadowRoots);
        if (childValue) {
            return childValue;
        }
    }

    return "";
}

function readCommentDataCandidate(candidates) {
    const value = candidates.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
    return normalizeDomText(value);
}

function hasCommentContentImage(commentElement, contentElement) {
    if (contentElement && hasCommentImageInRoot(contentElement, { allowSizeFallback: true })) {
        return true;
    }

    return hasCommentImageInRoot(commentElement, { allowSizeFallback: false });
}

function hasCommentImageInRoot(root, { allowSizeFallback }) {
    const imageElements = querySelectorAllDeep(
        root,
        "img, picture, source, a[href*='bfs/new_dyn'], [src*='bfs/new_dyn'], [data-src*='bfs/new_dyn'], [style*='bfs/new_dyn']"
    );

    return imageElements.some((imageElement) => isCommentBodyImageElement(imageElement, allowSizeFallback));
}

function isCommentBodyImageElement(imageElement, allowSizeFallback) {
    const imageUrl = extractImageUrl(imageElement).toLowerCase();
    if (isExcludedCommentImageUrl(imageUrl)) {
        return false;
    }

    if (imageUrl.includes("bfs/new_dyn")) {
        return true;
    }

    if (!allowSizeFallback || !imageUrl) {
        return false;
    }

    const { width, height } = getElementImageSize(imageElement);
    return width >= 72 && height >= 72;
}

function extractImageUrl(element) {
    const values = [
        element?.currentSrc,
        element?.src,
        element?.href,
        element?.getAttribute?.("src"),
        element?.getAttribute?.("data-src"),
        element?.getAttribute?.("data-original"),
        element?.getAttribute?.("data-url"),
        element?.getAttribute?.("href"),
        element?.getAttribute?.("style"),
        element?.style?.backgroundImage,
    ];

    return values.find(Boolean) || "";
}

function isExcludedCommentImageUrl(imageUrl) {
    return excludedCommentImageUrlParts.some((part) => imageUrl.includes(part));
}

function getElementImageSize(element) {
    const rect = element?.getBoundingClientRect?.();
    const width = Number(element?.naturalWidth || element?.width || element?.getAttribute?.("width") || rect?.width || 0);
    const height = Number(element?.naturalHeight || element?.height || element?.getAttribute?.("height") || rect?.height || 0);
    return { width, height };
}

function readElementValue(element, dataKeys, attributeNames) {
    if (!element) {
        return "";
    }

    for (const dataKey of dataKeys) {
        const value = element.dataset?.[dataKey];
        if (value) {
            return normalizeDomText(value);
        }
    }

    for (const attributeName of attributeNames) {
        const value = element.getAttribute?.(attributeName);
        if (value) {
            return normalizeDomText(value);
        }
    }

    return "";
}

function isFilterableCommentElement(element) {
    if (element.closest?.(".bbvt-comment-filter-placeholder")) {
        return false;
    }

    if (element.closest?.(".bbvt-comment-filter-overlay")) {
        return false;
    }

    return Boolean(readCommentText(element) || hasCommentContentImage(element, getCommentContentElement(element)));
}

function querySelectorDeep(root, selector) {
    return querySelectorAllDeep(root, selector)[0] || null;
}

function querySelectorAllDeep(root, selector) {
    const results = [];
    const visitedShadowRoots = new WeakSet();

    collectMatches(root, selector, results, visitedShadowRoots);
    return [...new Set(results)];
}

function observeCommentShadowRoots(callback) {
    if (typeof MutationObserver !== "function" || typeof callback !== "function") {
        return;
    }

    commentChangeCallback = callback;
    observeCommentDocumentChanges();
    attachCommentShadowRootObservers();
}

function attachCommentShadowRootObservers() {
    collectOpenShadowRoots(document).forEach((shadowRoot) => {
        if (commentShadowRootObservers.has(shadowRoot)) {
            return;
        }

        const observer = new MutationObserver((records) => {
            if (shouldIgnoreCommentMutationRecords(records)) {
                return;
            }

            scheduleCommentShadowRootDiscovery();
            scheduleCommentChange();
        });

        observer.observe(shadowRoot, {
            attributes: true,
            attributeFilter: commentObservedAttributeNames,
            characterData: true,
            childList: true,
            subtree: true,
        });
        commentShadowRootObservers.set(shadowRoot, observer);
    });
}

function observeCommentDocumentChanges() {
    if (commentDocumentObserver || typeof document === "undefined" || !document.body) {
        return;
    }

    commentDocumentObserver = new MutationObserver((records) => {
        if (shouldIgnoreCommentMutationRecords(records)) {
            return;
        }

        scheduleCommentShadowRootDiscovery();
        scheduleCommentChange();
    });

    commentDocumentObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function collectOpenShadowRoots(root) {
    const shadowRoots = [];
    collectShadowRoots(root, shadowRoots, new WeakSet());
    return shadowRoots;
}

function collectShadowRoots(root, shadowRoots, visitedShadowRoots) {
    if (!root?.querySelectorAll) {
        return;
    }

    if (root.shadowRoot && !visitedShadowRoots.has(root.shadowRoot)) {
        visitedShadowRoots.add(root.shadowRoot);
        shadowRoots.push(root.shadowRoot);
        collectShadowRoots(root.shadowRoot, shadowRoots, visitedShadowRoots);
    }

    root.querySelectorAll("*").forEach((element) => {
        if (!element.shadowRoot || visitedShadowRoots.has(element.shadowRoot)) {
            return;
        }

        visitedShadowRoots.add(element.shadowRoot);
        shadowRoots.push(element.shadowRoot);
        collectShadowRoots(element.shadowRoot, shadowRoots, visitedShadowRoots);
    });
}

function scheduleCommentChange() {
    if (!commentChangeCallback || commentChangeTimer) {
        return;
    }

    commentChangeTimer = setTimeout(() => {
        commentChangeTimer = null;
        commentChangeCallback?.();
    }, 200);
}

function scheduleCommentShadowRootDiscovery() {
    if (!commentChangeCallback || commentShadowRootDiscoveryTimer) {
        return;
    }

    commentShadowRootDiscoveryTimer = setTimeout(() => {
        commentShadowRootDiscoveryTimer = null;
        observeCommentShadowRoots(commentChangeCallback);
    }, 50);
}

function shouldIgnoreCommentMutationRecords(records) {
    return records.every((record) => {
        if (record.type === "attributes") {
            return isCommentFilterOwnedAttributeMutation(record);
        }

        if (record.type === "characterData") {
            return isCommentFilterOwnedNode(record.target?.parentElement);
        }

        if (record.type === "childList") {
            const nodes = [...record.addedNodes, ...record.removedNodes];
            if (nodes.length === 0) {
                return true;
            }

            return nodes.every(isCommentFilterOwnedNode);
        }

        return true;
    });
}

function isCommentFilterOwnedAttributeMutation(record) {
    if (String(record.attributeName || "").startsWith("data-bbvt")) {
        return true;
    }

    return isCommentFilterOwnedNode(record.target);
}

function isCommentFilterOwnedNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.classList?.contains("bbvt-comment-filter-placeholder")) {
        return true;
    }

    if (node.classList?.contains("bbvt-comment-filter-overlay")) {
        return true;
    }

    if (node.dataset?.bbvtCommentFilterPlaceholder !== undefined) {
        return true;
    }

    if (node.dataset?.bbvtCommentFilterOverlay !== undefined) {
        return true;
    }

    if (
        node.dataset?.bbvtCommentBlocked !== undefined ||
        node.dataset?.bbvtCommentBlockReason !== undefined ||
        node.dataset?.bbvtCommentBlockMode !== undefined ||
        node.dataset?.bbvtCommentOriginalDisplay !== undefined ||
        node.dataset?.bbvtCommentOriginalVisibility !== undefined
    ) {
        return true;
    }

    return Boolean(node.closest?.(".bbvt-comment-filter-placeholder, .bbvt-comment-filter-overlay"));
}

function collectMatches(root, selector, results, visitedShadowRoots) {
    if (!root?.querySelectorAll) {
        return;
    }

    if (root.matches?.(selector)) {
        results.push(root);
    }

    if (root.shadowRoot && !visitedShadowRoots.has(root.shadowRoot)) {
        visitedShadowRoots.add(root.shadowRoot);
        collectMatches(root.shadowRoot, selector, results, visitedShadowRoots);
    }

    results.push(...root.querySelectorAll(selector));

    root.querySelectorAll("*").forEach((element) => {
        if (!element.shadowRoot || visitedShadowRoots.has(element.shadowRoot)) {
            return;
        }

        visitedShadowRoots.add(element.shadowRoot);
        collectMatches(element.shadowRoot, selector, results, visitedShadowRoots);
    });
}

function collectVideoElements(roots) {
    let videoElements = [];

    for (const root of roots || []) {
        videoElements.push(...querySelectorAllDeep(root, videoCardSelectors));
    }

    videoElements = videoElements.filter((element) => element?.querySelector?.("a"));

    if (document.querySelector("div.recommend-container__2-line") == null) {
        videoElements = videoElements.filter((element) => element.classList.value !== "bili-video-card is-rcmd");
    }

    return [...new Set(videoElements)];
}

function readTextDeep(node) {
    const parts = [];
    collectText(node, parts, new WeakSet());
    return parts.join(" ");
}

function collectText(node, parts, visitedShadowRoots) {
    if (!node) {
        return;
    }

    if (node.nodeType === 3) {
        parts.push(node.nodeValue || "");
        return;
    }

    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) {
        return;
    }

    if (node.nodeType === 1) {
        const tagName = node.tagName?.toLowerCase();
        if (["script", "style", "noscript", "svg", "img", "button"].includes(tagName)) {
            return;
        }

        if (node.classList?.contains("bbvt-comment-filter-placeholder")) {
            return;
        }

        if (node.classList?.contains("bbvt-comment-filter-overlay")) {
            return;
        }

        if (node.shadowRoot && !visitedShadowRoots.has(node.shadowRoot)) {
            visitedShadowRoots.add(node.shadowRoot);
            collectText(node.shadowRoot, parts, visitedShadowRoots);
        }
    }

    node.childNodes?.forEach((child) => collectText(child, parts, visitedShadowRoots));
}

function normalizeDomText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}


function av2bv(aid) {
    const XOR_CODE = 23442827791579n;
    const MAX_AID = 1n << 51n;
    const BASE = 58n;
    const data = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
    const bytes = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
    let bvIndex = bytes.length - 1;
    let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE;

    while (tmp > 0) {
        bytes[bvIndex] = data[Number(tmp % BigInt(BASE))];
        tmp = tmp / BigInt(BASE);
        bvIndex -= 1;
    }

    [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
    [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
    return bytes.join("");
}

// ---- src/platform/renderer.js ----
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
let blockedOverlayGeneration = 0;

const VIDEO_OVERLAY_STYLE_ID = "bbvtVideoBlockedOverlayStyles";function createBlockedOverlayRestoreHandler(videoElement) {
    setVideoBlockedOverlayLocked(videoElement, true);
    return () => setVideoBlockedOverlayLocked(videoElement, false);
}function setVideoBlockedOverlayLocked(videoElement, locked) {
    if (!videoElement?.dataset) {
        return;
    }

    if (locked) {
        videoElement.dataset.bbvtOverlayLocked = "true";
    } else {
        delete videoElement.dataset.bbvtOverlayLocked;
    }
}function createBlockedRenderer() {
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

// peeking 状态的唯一事实来源用 WeakSet 维护，避免写进 DOM dataset 后被 re-evaluation
// （resize / MutationObserver / settling retry 触发的 restoreCommentElement）顺手清掉，
// 导致用户还在悬停的评论在重跑渲染时丢失 peek。
const peekingCommentElements = new WeakSet();

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
        endCommentPeek(commentElement);
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
        const detailsOpen = overlay.dataset.bbvtCommentDetailsOpen === "true";
        overlay.replaceChildren();
        const veil = document.createElement("div");
        veil.className = "bbvt-comment-filter-overlay-veil";

        const body = createCommentOverlayBody(overlay, reason, normalizedReasonItems);

        overlay.append(veil, body);
        if (detailsOpen) {
            showCommentDetailsPanel(overlay, reason, normalizedReasonItems);
        }
        overlay.dataset.bbvtCommentOverlaySignature = overlaySignature;
    }

    overlay.style.zIndex = overlay.dataset.bbvtCommentDetailsOpen === "true" ? "30" : "20";
    syncCommentPeekDataset(commentElement, overlay);

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

function createCommentOverlayBody(overlay, reason, reasonItems) {
    const body = document.createElement("div");
    body.className = "bbvt-comment-filter-overlay-body";
    body.title = createCommentOverlaySummaryTitle(reason, reasonItems);

    const label = document.createElement("span");
    label.className = "bbvt-comment-filter-overlay-text";
    label.textContent = createCommentOverlaySummaryText(reasonItems);
    body.appendChild(label);

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "bbvt-comment-filter-details-toggle";
    detailsButton.textContent = overlay.dataset.bbvtCommentDetailsOpen === "true" ? "收起" : "展开";
    detailsButton.title = "查看并删除命中的评论规则";
    stopCommentOverlayControlEvents(detailsButton);
    detailsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCommentDetailsPanel(overlay, reason, reasonItems);
    });
    body.appendChild(detailsButton);

    return body;
}

function createCommentOverlaySummaryText(reasonItems) {
    if (reasonItems.length > 0) {
        return `已屏蔽评论 · ${reasonItems.length} 条规则`;
    }

    return "已屏蔽评论";
}

function createCommentOverlaySummaryTitle(reason, reasonItems) {
    if (reasonItems.length > 0) {
        return reasonItems.map((item) => item.title || item.label).filter(Boolean).join("\n");
    }

    return String(reason || "已屏蔽评论");
}

function toggleCommentDetailsPanel(overlay, reason, reasonItems) {
    if (overlay.dataset.bbvtCommentDetailsOpen === "true") {
        hideCommentDetailsPanel(overlay);
        return;
    }

    showCommentDetailsPanel(overlay, reason, reasonItems);
}

function showCommentDetailsPanel(overlay, reason, reasonItems) {
    hideCommentDetailsPanel(overlay);
    overlay.dataset.bbvtCommentDetailsOpen = "true";
    overlay.style.zIndex = "30";

    const panel = createCommentDetailsPanel(overlay, reason, reasonItems);
    overlay.appendChild(panel);
    positionCommentDetailsPanel(overlay, panel);
    syncCommentDetailsToggle(overlay);
}

function hideCommentDetailsPanel(overlay) {
    overlay.querySelector?.(".bbvt-comment-filter-details-panel")?.remove();
    delete overlay.dataset.bbvtCommentDetailsOpen;
    overlay.style.zIndex = "20";
    syncCommentDetailsToggle(overlay);
}

function syncCommentDetailsToggle(overlay) {
    const toggle = overlay.querySelector?.(".bbvt-comment-filter-details-toggle");
    if (toggle) {
        toggle.textContent = overlay.dataset.bbvtCommentDetailsOpen === "true" ? "收起" : "展开";
    }
}

function createCommentDetailsPanel(overlay, reason, reasonItems) {
    const panel = document.createElement("div");
    panel.className = "bbvt-comment-filter-details-panel";
    stopCommentOverlayControlEvents(panel);

    const header = document.createElement("div");
    header.className = "bbvt-comment-filter-details-header";

    const title = document.createElement("span");
    title.className = "bbvt-comment-filter-details-title";
    title.textContent = "屏蔽原因";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "bbvt-comment-filter-details-close";
    closeButton.textContent = "×";
    closeButton.title = "收起";
    stopCommentOverlayControlEvents(closeButton);
    closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideCommentDetailsPanel(overlay);
    });

    header.append(title, closeButton);

    const list = document.createElement("div");
    list.className = "bbvt-comment-filter-details-list";
    const items = reasonItems.length > 0
        ? reasonItems
        : [{ label: String(reason || "已屏蔽评论"), title: String(reason || ""), canRemove: false }];
    items.forEach((item) => {
        list.appendChild(createCommentReasonRow(item));
    });

    panel.append(header, list);
    return panel;
}

function createCommentReasonRow(item) {
    const row = document.createElement("div");
    row.className = "bbvt-comment-filter-reason-row";

    const label = document.createElement("span");
    label.className = "bbvt-comment-filter-reason-row-label";
    label.textContent = item.label;
    label.title = item.title || item.label;
    row.appendChild(label);

    if (item.canRemove && typeof item.onRemove === "function") {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "bbvt-comment-filter-reason-remove";
        removeButton.textContent = "删除";
        removeButton.title = item.removeTitle || "从配置中删除这条规则";
        stopCommentOverlayControlEvents(removeButton);
        removeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            item.onRemove(item);
        });
        row.appendChild(removeButton);
    }

    return row;
}

function positionCommentDetailsPanel(overlay, panel) {
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 800;
    const margin = 12;
    const gap = 6;
    const overlayRect = overlay.getBoundingClientRect?.() || {
        top: 0,
        left: 0,
        width: overlay.offsetWidth || viewportWidth,
        height: overlay.offsetHeight || 44,
        right: viewportWidth,
        bottom: overlay.offsetHeight || 44,
    };
    const overlayWidth = overlayRect.width || overlay.offsetWidth || viewportWidth;
    const overlayHeight = overlayRect.height || overlay.offsetHeight || 44;
    const body = overlay.querySelector?.(".bbvt-comment-filter-overlay-body") || null;
    const bodyRect = body?.getBoundingClientRect?.() || null;
    const bodyLeft = bodyRect ? bodyRect.left - overlayRect.left : Math.max(8, overlayWidth - 280);
    const bodyTop = bodyRect ? bodyRect.top - overlayRect.top : 8;
    const bodyRight = bodyRect ? bodyRect.right - overlayRect.left : overlayWidth - 8;
    const bodyBottom = bodyRect ? bodyRect.bottom - overlayRect.top : 38;
    const panelWidth = Math.min(360, viewportWidth - margin * 2);
    const viewportMinLeft = margin - (overlayRect.left || 0);
    const viewportMaxLeft = viewportWidth - margin - (overlayRect.left || 0) - panelWidth;
    const preferredLeft = Math.min(bodyLeft, bodyRight - panelWidth);
    const left = clampNumber(preferredLeft, viewportMinLeft, viewportMaxLeft);
    const spaceBelow = viewportHeight - ((overlayRect.top || 0) + bodyBottom) - margin - gap;
    const spaceAbove = (overlayRect.top || 0) + bodyTop - margin - gap;
    const placeBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const availableHeight = Math.max(120, placeBelow ? spaceBelow : spaceAbove);
    const maxHeight = Math.min(340, availableHeight);

    panel.style.left = `${left}px`;
    panel.style.right = "";
    panel.style.width = `${panelWidth}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    if (placeBelow) {
        panel.style.top = `${bodyBottom + gap}px`;
        panel.style.bottom = "";
    } else {
        panel.style.top = "";
        panel.style.bottom = `${Math.max(0, overlayHeight - bodyTop + gap)}px`;
    }
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

function stopCommentOverlayControlEvents(element) {
    ["mousemove", "mousedown", "pointerdown", "click"].forEach((eventName) => {
        element.addEventListener(eventName, (event) => {
            event.stopPropagation();
        });
    });
}

function isCommentOverlayControlTarget(target, overlay) {
    let current = target;
    while (current && current !== overlay) {
        if (
            current.classList?.contains?.("bbvt-comment-filter-overlay-body") ||
            current.classList?.contains?.("bbvt-comment-filter-details-panel")
        ) {
            return true;
        }
        current = current.parentNode;
    }

    return false;
}

function clampNumber(value, min, max) {
    if (max < min) {
        return min;
    }

    return Math.max(min, Math.min(value, max));
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

    // 评论不再命中规则时彻底恢复：overlay 已被移除，peek 也没有继续存在的意义，
    // 这里同时清掉 WeakSet 与 DOM 标记，确保下次重新命中时是干净的初始态。
    endCommentPeek(commentElement, overlay);
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

    peekingCommentElements.add(commentElement);
    if (overlay) {
        commentFilterOverlays.set(commentElement, overlay);
    }
    syncCommentPeekDataset(commentElement, overlay);
    showCommentElement(commentElement, { keepBlockState: true });
}

function endCommentOverlayPeek(commentElement, overlay = commentFilterOverlays.get(commentElement)) {
    if (!isCommentPeeking(commentElement)) {
        return;
    }

    endCommentPeek(commentElement, overlay);
    if (commentElement.dataset.bbvtCommentBlocked === "true") {
        hideCommentElementForOverlay(commentElement);
    }
}

// 真正结束 peek：只在鼠标离开、切换到 hide 模式、或评论彻底恢复时调用。
// re-evaluation 期间被重新 block 的评论不会走到这里，因此 peek 能跨 resize 保持。
function endCommentPeek(commentElement, overlay = commentFilterOverlays.get(commentElement)) {
    peekingCommentElements.delete(commentElement);
    delete commentElement.dataset.bbvtCommentFilterPeeking;
    if (overlay) {
        delete overlay.dataset.bbvtCommentFilterPeeking;
    }
}

// 把 WeakSet 中的 peek 真值同步回 DOM dataset，仅供 CSS 选择器与 smoke 校验读取。
// 重新渲染 overlay 时调用，确保 dataset 始终跟随唯一的 WeakSet 状态。
function syncCommentPeekDataset(commentElement, overlay = commentFilterOverlays.get(commentElement)) {
    if (isCommentPeeking(commentElement)) {
        commentElement.dataset.bbvtCommentFilterPeeking = "true";
        if (overlay) {
            overlay.dataset.bbvtCommentFilterPeeking = "true";
        }
    } else {
        delete commentElement.dataset.bbvtCommentFilterPeeking;
        if (overlay) {
            delete overlay.dataset.bbvtCommentFilterPeeking;
        }
    }
}

function isCommentPeeking(commentElement) {
    return peekingCommentElements.has(commentElement);
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
            overflow: visible;
        }

        .bbvt-comment-filter-overlay-veil {
            position: absolute;
            inset: 0;
            box-sizing: border-box;
            border: 1px solid rgba(18, 183, 219, 0.3);
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
            display: inline-flex;
            align-items: center;
            justify-content: flex-end;
            gap: 6px;
            max-width: min(280px, calc(100% - 16px));
            box-sizing: border-box;
            padding: 5px 7px;
            border: 1px solid rgba(18, 183, 219, 0.32);
            border-radius: 7px;
            background: rgba(25, 29, 34, 0.9);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
        }

        .bbvt-comment-filter-overlay-text {
            min-width: 0;
            flex: 1 1 auto;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: rgba(245, 245, 245, 0.92);
        }

        .bbvt-comment-filter-details-toggle {
            flex: 0 0 auto;
            border: 0;
            border-radius: 5px;
            padding: 2px 6px;
            background: rgba(18, 183, 219, 0.24);
            color: rgb(255, 255, 255);
            font-size: 12px;
            line-height: 1.4;
            cursor: pointer;
        }

        .bbvt-comment-filter-details-toggle:hover {
            background: rgba(18, 183, 219, 0.72);
        }

        .bbvt-comment-filter-details-panel {
            position: absolute;
            z-index: 3;
            box-sizing: border-box;
            max-width: calc(100vw - 24px);
            max-height: min(340px, calc(100vh - 24px));
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid rgba(18, 183, 219, 0.36);
            border-radius: 8px;
            background: rgba(25, 29, 34, 0.96);
            color: rgb(245, 245, 245);
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        }

        .bbvt-comment-filter-details-header {
            flex: 0 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 9px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .bbvt-comment-filter-details-title {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 700;
        }

        .bbvt-comment-filter-details-close {
            width: 24px;
            height: 24px;
            flex: 0 0 auto;
            padding: 0;
            border: 0;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.1);
            color: rgb(245, 245, 245);
            font-size: 17px;
            line-height: 24px;
            cursor: pointer;
        }

        .bbvt-comment-filter-details-close:hover {
            background: rgba(18, 183, 219, 0.72);
        }

        .bbvt-comment-filter-details-list {
            min-height: 0;
            overflow-y: auto;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 7px;
        }

        .bbvt-comment-filter-reason-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: start;
            gap: 8px;
            padding: 7px 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 7px;
            background: rgba(255, 255, 255, 0.06);
        }

        .bbvt-comment-filter-reason-row-label {
            min-width: 0;
            color: rgba(245, 245, 245, 0.95);
            line-height: 1.45;
            overflow-wrap: anywhere;
        }

        .bbvt-comment-filter-reason-remove {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 4px 8px;
            border: 0;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.13);
            color: rgb(255, 255, 255);
            font-size: 12px;
            line-height: 1;
            cursor: pointer;
        }

        .bbvt-comment-filter-reason-remove:hover {
            background: rgba(18, 183, 219, 0.82);
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

    const shouldDelayLegacyCardBoxOverlay =
        settings.legacyCardBoxOverlayDelay_Switch === true &&
        videoElement.firstElementChild?.className == "card-box" &&
        setTimeoutStatus == false;

    if (shouldDelayLegacyCardBoxOverlay) {
        videoElement.style.filter = "blur(5px)";
        markBlockedElement(videoElement, "pending");

        const generation = blockedOverlayGeneration;
        setTimeout(() => {
            if (generation !== blockedOverlayGeneration) {
                cancelLegacyCardBoxPending(videoElement);
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

    injectVideoBlockedOverlayStyles();

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

    const overlayText = document.createElement("div");
    if (videoElement.firstElementChild?.className == "card-box") {
        overlayText.style.fontSize = "1.25em";
    }
    overlayText.innerText = videoInfo.triggeredBlockedRules?.[0] || "";
    overlayText.style.color = "rgb(250,250,250)";
    overlay.appendChild(overlayText);

    videoElement.dataset.bbvtBlockedOverlayHost = "true";
    videoElement.insertAdjacentElement("afterbegin", overlay);
    markBlockedElement(videoElement, "true");
}

function cancelLegacyCardBoxPending(videoElement) {
    if (videoElement?.dataset?.bbvtBlocked !== "pending") {
        return;
    }

    videoElement.style.filter = "none";
    clearBlockedElement(videoElement);
}

function clearVideoBlockedOverlayHostState(videoElement) {
    delete videoElement.dataset.bbvtBlockedOverlayHost;
    delete videoElement.dataset.bbvtOverlayLocked;
}

function injectVideoBlockedOverlayStyles() {
    if (typeof document === "undefined") {
        return;
    }

    if (document.getElementById(VIDEO_OVERLAY_STYLE_ID)) {
        return;
    }

    const css = `
        [data-bbvt-blocked-overlay-host="true"] > .blockedOverlay {
            opacity: 1;
            pointer-events: auto;
            transition: opacity 0.2s ease;
        }

        [data-bbvt-blocked-overlay-host="true"]:hover:not([data-bbvt-overlay-locked="true"]) > .blockedOverlay {
            opacity: 0;
            pointer-events: none;
        }

        [data-bbvt-blocked-overlay-host="true"][data-bbvt-overlay-locked="true"] > .blockedOverlay {
            opacity: 0;
            pointer-events: none;
        }
    `;

    const style = document.createElement("style");
    style.id = VIDEO_OVERLAY_STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
}

function removeHiddenOrOverlay(videoElement, settings) {
    videoElement.style.filter = "none";
    clearVideoBlockedOverlayHostState(videoElement);

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

// ---- src/platform/card-actions.js ----
function createCardActions() {
    const mounted = new WeakSet();

    return {
        mount(context, videoElement, videoBv) {
            if (mounted.has(videoElement)) return;
            mounted.add(videoElement);

            videoElement.addEventListener("contextmenu", (event) => {
                if (!isMasterSwitchEnabled(context)) {
                    return;
                }

                const settings = context.settingsStore.getSettings();
                if (!shouldOpenScriptContextMenu(event, settings.contextMenuScriptModifier)) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation?.();
                const videoInfo = context.videoStore.getVideoInfo(videoBv);
                if (videoInfo && videoInfo.blockedTarget) {
                    if (typeof window.bbvtShowHoverReviewPanel === "function") {
                        const restoreOverlay = createBlockedOverlayRestoreHandler(videoElement);
                        window.bbvtShowHoverReviewPanel(
                            context,
                            videoBv,
                            videoElement,
                            restoreOverlay,
                            event.clientX,
                            event.clientY
                        );
                    }
                } else {
                    quickBlockVideo(context, videoBv, videoElement, event.clientX, event.clientY);
                }
            });
        },
    };
}

// ---- src/ui/stats-panel.js ----
const statsPanelId = "bbvtStatsPanel";
const aggregateOnlyStatsTypes = new Set([
    "屏蔽低UP主粉丝数",
]);
function openStatsPanel(context) {
    if (document.getElementById(statsPanelId)) return;

    injectStatsStyles();

    const overlay = document.createElement("div");
    overlay.id = statsPanelId;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });

    renderStats(overlay, context);
}

function renderStats(overlay, context) {
    overlay.replaceChildren();

    const panel = createStatsPanelEl("div", "sp-panel");

    const header = createStatsPanelEl("div", "sp-header");
    const closeBtn = createStatsPanelEl("button", "sp-close", "×");
    setButtonIcon(closeBtn, "close", "关闭统计面板");
    closeBtn.addEventListener("click", () => overlay.remove());
    header.append(createStatsPanelEl("span", "sp-title", "屏蔽统计"), closeBtn);

    const data = context.statsStore.getData();
    const groups = groupData(data);
    const total = Object.values(data).reduce((s, v) => s + v, 0);

    const body = createStatsPanelEl("div", "sp-body");
    body.appendChild(createStatsPanelEl("div", "sp-total", `累计命中：${total} 次`));

    if (Object.keys(data).length === 0) {
        body.appendChild(createStatsPanelEl("div", "sp-empty", "暂无统计数据"));
    } else {
        for (const [type, items] of Object.entries(groups)) {
            const typeTotal = items.reduce((s, [, v]) => s + v, 0);
            const section = createStatsPanelEl("div", "sp-section");
            section.appendChild(createStatsPanelEl("div", "sp-section-title", `${type}（${typeTotal}）`));
            if (!aggregateOnlyStatsTypes.has(type)) {
                for (const [item, count] of items) {
                    const row = createStatsPanelEl("div", "sp-row");
                    row.append(createStatsPanelEl("span", "sp-label", item), createStatsPanelEl("span", "sp-badge", String(count)));
                    section.appendChild(row);
                }
            }
            body.appendChild(section);
        }
    }

    const actions = createStatsPanelEl("div", "sp-actions");
    const clearBtn = createStatsPanelEl("button", "sp-btn", "清除数据");
    setButtonIcon(clearBtn, "trash", "清除统计数据", "清除数据");
    clearBtn.addEventListener("click", () => {
        context.statsStore.clear();
        renderStats(overlay, context);
    });
    const closeBtn2 = createStatsPanelEl("button", "sp-btn-primary", "关闭");
    setButtonIcon(closeBtn2, "close", "关闭统计面板", "关闭");
    closeBtn2.addEventListener("click", () => overlay.remove());
    actions.append(clearBtn, closeBtn2);

    panel.append(header, body, actions);
    overlay.appendChild(panel);
}

function groupData(data) {
    const groups = {};
    for (const [key, count] of Object.entries(data)) {
        const sep = key.indexOf(": ");
        const type = sep >= 0 ? key.slice(0, sep) : key;
        const item = sep >= 0 ? key.slice(sep + 2) : key;
        if (!groups[type]) groups[type] = [];
        groups[type].push([item, count]);
    }
    for (const type in groups) {
        groups[type].sort(([, a], [, b]) => b - a);
    }
    return groups;
}

function createStatsPanelEl(tag, className, text = "") {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
}

function injectStatsStyles() {
    if (document.getElementById("bbvtStatsStyles")) return;

    const css = `
        #${statsPanelId} {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            background: rgba(0,0,0,0.65);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            animation: spFadeIn 0.25s ease-out forwards;
        }

        @keyframes spFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        #${statsPanelId} ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        #${statsPanelId} ::-webkit-scrollbar-track {
            background: transparent;
        }

        #${statsPanelId} ::-webkit-scrollbar-thumb {
            background: rgba(120, 120, 120, 0.4);
            border-radius: 3px;
        }

        #${statsPanelId} ::-webkit-scrollbar-thumb:hover {
            background: rgba(120, 120, 120, 0.6);
        }

        #${statsPanelId} .sp-panel {
            width: min(560px, calc(100vw - 32px));
            max-height: min(700px, calc(100vh - 32px));
            background: rgba(22, 25, 30, 0.96);
            color: rgb(239,244,248);
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: scale(0.97);
            animation: spZoomIn 0.25s ease-out forwards;
        }

        @keyframes spZoomIn {
            to { transform: scale(1); }
        }

        #${statsPanelId} .sp-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            background: rgba(31,36,43,0.86);
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        #${statsPanelId} .sp-title { font-size: 16px; font-weight: 700; }

        #${statsPanelId} .sp-close {
            width: 32px; height: 32px; padding: 0; font-size: 13px;
            line-height: 32px; border: 0; border-radius: 8px;
            background: rgba(255,255,255,0.08); color: rgb(215,222,229); cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center;
        }

        #${statsPanelId} .sp-close:hover {
            background: rgba(232,93,93,0.92);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(232,93,93,0.26);
        }

        #${statsPanelId} .sp-body {
            flex: 1; overflow: auto; padding: 18px;
            display: flex; flex-direction: column; gap: 16px;
        }

        #${statsPanelId} .sp-total {
            font-size: 13px; color: rgb(91,213,237);
            padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        #${statsPanelId} .sp-empty { color: rgb(142,154,168); font-size: 13px; }

        #${statsPanelId} .sp-section { display: flex; flex-direction: column; gap: 6px; }

        #${statsPanelId} .sp-section-title {
            font-size: 13px; font-weight: 600;
            color: rgb(188,198,208); margin-bottom: 4px;
        }

        #${statsPanelId} .sp-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 12px; border-radius: 6px;
            background: rgba(255,255,255,0.06); font-size: 13px;
            transition: background 0.2s ease;
        }

        #${statsPanelId} .sp-row:hover {
            background: rgba(255,255,255,0.1);
        }

        #${statsPanelId} .sp-label {
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
        }

        #${statsPanelId} .sp-badge {
            background: rgb(18,183,219); color: white; border-radius: 999px;
            padding: 2px 10px; font-size: 12px; margin-left: 10px; flex-shrink: 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        #${statsPanelId} .sp-actions {
            display: flex; justify-content: flex-end; gap: 10px;
            padding: 14px 18px; background: rgba(31,36,43,0.86);
            border-top: 1px solid rgba(255,255,255,0.08);
        }

        #${statsPanelId} .sp-btn,
        #${statsPanelId} .sp-btn-primary {
            border: 0; border-radius: 8px; padding: 7px 16px;
            font-size: 13px; cursor: pointer; transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        }

        #${statsPanelId} .sp-btn-primary { background: rgb(18,183,219); color: white; }
        #${statsPanelId} .sp-btn-primary:hover {
            background: rgb(33,202,238); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(18,183,219,0.28);
        }

        #${statsPanelId} .sp-btn { background: rgba(255,255,255,0.08); color: rgb(215,222,229); }
        #${statsPanelId} .sp-btn:hover {
            background: rgba(232,93,93,0.9); color: white; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(232,93,93,0.22);
        }

        #${statsPanelId} .bbvt-icon {
            width: 14px;
            height: 14px;
            flex: 0 0 auto;
        }
    `;

    const style = document.createElement("style");
    style.id = "bbvtStatsStyles";
    style.textContent = css;
    document.head.appendChild(style);
}

// ---- src/platform/userscript-menu.js ----
// == 油猴菜单和设置面板 ======================================================
//
// 职责：
// - 注册 GM_registerMenuCommand。
// - 打开设置面板。
// - 管理导入、导出、保存、关闭等 UI 动作。
//
// 不负责：
// - 不执行屏蔽流程。
// - 不写具体屏蔽规则。



const menuId = "blockedMenuUi";

const arrayKeyToStatsType = {
    blockedTitle_Array: "按标题屏蔽",
    blockedUpUid_Array: "按UP主屏蔽",
    blockedUpNameKeyword_Array: "按UP名称关键词屏蔽",
    blockedVideoPartitions_Array: "按视频分区屏蔽",
    blockedTag_Array: "按标签屏蔽",
    doubleBlockedTag_Array: "按双重标签屏蔽",
    blockedUpSigns_Array: "按UP主简介屏蔽",
    blockedTopComment_Array: "按置顶评论屏蔽",
    blockedCommentText_Array: "按评论内容屏蔽",
    blockedCommentUser_Array: "按评论用户屏蔽",
    blockedTrendingItem_Array: "按关键词屏蔽热搜项",
};

const countedChipColor = "rgba(18, 183, 219, 0.25)";
const chipHeatColors = [null, "rgba(18, 183, 219, 0.4)", "rgba(18, 183, 219, 0.55)", "rgba(18, 183, 219, 0.7)", "rgba(18, 183, 219, 0.85)", "rgb(18, 183, 219)"];
const upSuggestionMinBlockedCount = 5;

function computeChipHeatLevel(count, total) {
    const base = Math.max(2, Math.ceil(total / 50));
    const thresholds = [base, base * 3, base * 8, base * 20, base * 50];
    for (let i = 4; i >= 0; i--) {
        if (count >= thresholds[i]) return i + 1;
    }
    return 0;
}

const videoRuleControls = [
    arrayControl("标题关键词", "blockedTitle_Switch", "blockedTitle_Array", "blockedTitle_UseRegular"),
    arrayControl("UP 精确屏蔽（UID）", "blockedUpUid_Switch", "blockedUpUid_Array", null, "输入 UID，例如：123456"),
    arrayControl("UP 名称关键词", "blockedUpNameKeyword_Switch", "blockedUpNameKeyword_Array", "blockedUpNameKeyword_UseRegular", "普通关键词为包含匹配，可切换正则"),
    arrayControl("标签", "blockedTag_Switch", "blockedTag_Array", "blockedTag_UseRegular"),
    arrayControl("双标签", "doubleBlockedTag_Switch", "doubleBlockedTag_Array", "doubleBlockedTag_UseRegular", "示例：游戏|实况"),
    arrayControl("视频分区", "blockedVideoPartitions_Switch", "blockedVideoPartitions_Array", "blockedVideoPartitions_UseRegular"),
];

const commentRuleControls = [
    arrayControl("评论关键词", "blockedCommentText_Switch", "blockedCommentText_Array", "blockedCommentText_UseRegular", "普通关键词为包含匹配，可切换正则"),
    arrayControl("评论用户", "blockedCommentUser_Switch", "blockedCommentUser_Array", null, "UID、uid:123、昵称或 name:昵称"),
    booleanControl("带图评论", "blockedCommentImage_Switch"),
    booleanControl("隐藏评论而不是显示遮罩", "hideCommentMode_Switch"),
];

const whitelistControls = [
    arrayControl(
        "UP 白名单（UID）",
        "whitelistUpUid_Switch",
        "whitelistUpUid_Array",
        null,
        "加入后会从 UP 精确屏蔽中移除同 UID"
    ),
    arrayControl(
        "按 BV 号解封单条视频",
        "whitelistBv_Switch",
        "whitelistBv_Array",
        null,
        "例如：BV1xxxxxxxx"
    ),
];

const thresholdControls = [
    numberControl("低于指定时长", "blockedShortDuration_Switch", "blockedShortDuration", "秒"),
    numberControl("低于指定播放量", "blockedBelowVideoViews_Switch", "blockedBelowVideoViews", "次"),
    numberControl("低于指定点赞率", "blockedBelowLikesRate_Switch", "blockedBelowLikesRate", "%"),
    numberControl("低于指定投币率", "blockedBelowCoinRate_Switch", "blockedBelowCoinRate", "%"),
    numberControl("高于指定收藏/投币比", "blockedAboveFavoriteCoinRatio_Switch", "blockedAboveFavoriteCoinRatio", ""),
    numberControl("低于指定 UP 等级", "blockedBelowUpLevel_Switch", "blockedBelowUpLevel", "级"),
    numberControl("低于指定 UP 粉丝数", "blockedBelowUpFans_Switch", "blockedBelowUpFans", "人"),
];

const advancedRuleControls = [
    booleanControl("竖屏视频", "blockedPortraitVideo_Switch"),
    booleanControl("充电专属视频", "blockedChargingExclusive_Switch"),
    arrayControl("UP 简介关键词", "blockedUpSigns_Switch", "blockedUpSigns_Array", "blockedUpSigns_UseRegular"),
    booleanControl("精选评论的视频", "blockedFilteredCommentsVideo_Switch"),
    arrayControl("置顶评论关键词", "blockedTopComment_Switch", "blockedTopComment_Array", "blockedTopComment_UseRegular"),
    booleanControl("隐藏热搜模块", "hideTrending_Switch"),
    booleanControl("标题/标签规则作用于热搜", "blockedTrendingItemByTitleTag_Switch"),
    arrayControl("热搜关键词", "blockedTrendingItem_Switch", "blockedTrendingItem_Array", "blockedTrendingItem_UseRegular"),
];

const displayInteractionControls = [
    booleanControl("启用屏蔽总开关", "scriptEnabled_Switch"),
    choiceControl(
        "脚本右键菜单快捷键",
        "contextMenuScriptModifier",
        CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS
    ),
    booleanControl("显示浮窗入口", "floatingEntryVisible_Switch"),
    booleanControl("隐藏非视频元素", "hideNonVideoElements_Switch"),
    booleanControl("叠加层只显示命中类型", "blockedOverlayOnlyDisplaysType_Switch"),
    booleanControl("隐藏视频而不是显示叠加层", "hideVideoMode_Switch"),
    booleanControl("保留 card-box 延迟叠加动画", "legacyCardBoxOverlayDelay_Switch"),
    booleanControl("隐藏菜单中的屏蔽词", "hideBlockedWordsInMenu_Switch"),
];

const apiExperimentControls = [
    booleanControl("控制台输出日志", "consoleOutputLog_Switch"),
    booleanControl("已屏蔽后仍累计后续命中", "accumulateBlockedRules_Switch"),
];

const defaultMenuSections = [
    {
        title: "视频屏蔽",
        controls: videoRuleControls,
    },
    {
        title: "评论屏蔽",
        controls: commentRuleControls,
    },
];

const advancedMenuGroups = [
    {
        id: "feature-switches",
        title: "功能开关",
        type: "feature-switches",
    },
    {
        id: "thresholds",
        title: "阈值设置",
        controls: thresholdControls,
    },
    {
        id: "advanced-rules",
        title: "进阶规则",
        controls: advancedRuleControls,
    },
    {
        id: "display-interaction",
        title: "显示与交互",
        controls: displayInteractionControls,
    },
    {
        id: "api-experiments",
        title: "API 与实验",
        controls: apiExperimentControls,
    },
    {
        id: "whitelist",
        title: "白名单",
        controls: whitelistControls,
    },
];

const featureSwitchControls = [
    ...videoRuleControls,
    ...commentRuleControls,
    ...thresholdControls,
    ...advancedRuleControls,
    ...displayInteractionControls.filter((control) => control.type === "boolean"),
    ...apiExperimentControls,
    ...whitelistControls,
];function registerUserscriptMenu(context) {
    injectMenuStyles();
    context.openSettingsPanel = (anchorRect) => toggleSettingsPanel(context, anchorRect);
    context.openStatsPanel = () => openStatsPanel(context);
    window.BilibiliBlockedVideosOpenSettings = context.openSettingsPanel;
    window.BilibiliBlockedVideosShowFloatingEntry = () => showFloatingEntryFromMenu(context);

    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("屏蔽参数面板", () => context.openSettingsPanel());
        GM_registerMenuCommand("显示浮窗入口", () => showFloatingEntryFromMenu(context));
    }
}

function toggleSettingsPanel(context, anchorRect) {
    const existing = document.getElementById(menuId);
    if (existing) {
        existing.remove();
        return;
    }
    openSettingsPanel(context, anchorRect);
}

function openSettingsPanel(context, anchorRect) {
    const panel = document.createElement("div");
    panel.id = menuId;
    document.body.appendChild(panel);
    positionPanel(panel, anchorRect);

    const statsData = context.statsStore?.getData() || {};
    const state = {
        settings: deepCloneMenu(context.settingsStore.getSettings()),
        overlayVisible: true,
        statsData,
        statsTotal: Object.values(statsData).reduce((s, v) => s + v, 0),
        showAdvanced: false,
        openAdvancedGroups: {},
    };

    renderPanel(panel, context, state);
    initDragger(panel);
}

function initDragger(panel) {
    let startX, startY, startLeft, startTop;
    
    panel.addEventListener("mousedown", (e) => {
        const header = e.target.closest('.bbvt-header');
        if (!header) return;
        if (e.target.closest('button')) return; // ignore button clicks
        
        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = panel.offsetLeft;
        startTop = panel.offsetTop;
        
        const overlay = createElement("div", "bbvt-drag-overlay");
        document.body.appendChild(overlay);

        const onMouseMove = (moveEvent) => {
            let newLeft = startLeft + (moveEvent.clientX - startX);
            let newTop = startTop + (moveEvent.clientY - startY);
            
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));
            
            panel.style.left = `${newLeft}px`;
            panel.style.top = `${newTop}px`;
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            overlay.remove();
            
            if (typeof GM_setValue === "function") {
                GM_setValue("bbvtMenuDim", {
                    width: panel.offsetWidth,
                    height: panel.offsetHeight,
                    left: panel.offsetLeft,
                    top: panel.offsetTop
                });
            }
        };
        
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    });
}

function initResizer(panel) {
    const directions = ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
    directions.forEach(dir => {
        const handle = createElement("div", `bbvt-resizer bbvt-resizer-${dir}`);
        panel.appendChild(handle);
        
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        
        handle.addEventListener("mousedown", (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;
            
            const overlay = createElement("div", "bbvt-drag-overlay");
            document.body.appendChild(overlay);

            const onMouseMove = (moveEvent) => {
                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;
                
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;

                if (dir.includes('right')) {
                    newWidth = startWidth + deltaX;
                    newWidth = Math.max(400, Math.min(newWidth, window.innerWidth - startLeft - 12));
                }
                if (dir.includes('left')) {
                    newWidth = startWidth - deltaX;
                    newWidth = Math.max(400, Math.min(newWidth, startLeft + startWidth - 12));
                    newLeft = startLeft + startWidth - newWidth;
                }
                if (dir.includes('bottom')) {
                    newHeight = startHeight + deltaY;
                    newHeight = Math.max(300, Math.min(newHeight, window.innerHeight - startTop - 12));
                }
                if (dir.includes('top')) {
                    newHeight = startHeight - deltaY;
                    newHeight = Math.max(300, Math.min(newHeight, startTop + startHeight - 12));
                    newTop = startTop + startHeight - newHeight;
                }

                panel.style.width = `${newWidth}px`;
                panel.style.height = `${newHeight}px`;
                panel.style.left = `${newLeft}px`;
                panel.style.top = `${newTop}px`;
            };

            const onMouseUp = () => {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                overlay.remove();
                
                if (typeof GM_setValue === "function") {
                    GM_setValue("bbvtMenuDim", {
                        width: parseInt(panel.style.width),
                        height: parseInt(panel.style.height),
                        left: panel.offsetLeft,
                        top: panel.offsetTop
                    });
                }
            };
            
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        });
    });
}

function positionPanel(panel, anchorRect) {
    const margin = 12;
    let panelWidth = Math.min(960, window.innerWidth - margin * 2);
    let panelHeight = Math.min(760, window.innerHeight - margin * 2);
    const fallbackRect = {
        left: window.innerWidth - margin,
        right: window.innerWidth - margin,
        top: 92,
        bottom: 136,
        width: 0,
        height: 44,
    };
    const rect = isValidAnchorRect(anchorRect) ? anchorRect : fallbackRect;
    const anchorCenterY = rect.top + rect.height / 2;
    const opensLeft = rect.left > window.innerWidth / 2;
    const preferredLeft = opensLeft ? rect.left - panelWidth - margin : rect.right + margin;
    let left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - panelWidth - margin));
    let top = Math.max(margin, Math.min(anchorCenterY - panelHeight / 2, window.innerHeight - panelHeight - margin));

    const saved = typeof GM_getValue === "function" ? GM_getValue("bbvtMenuDim", null) : null;
    if (saved) {
        panelWidth = Math.max(400, Math.min(saved.width, window.innerWidth - margin * 2));
        panelHeight = Math.max(300, Math.min(saved.height, window.innerHeight - margin * 2));
        left = Math.max(margin, Math.min(saved.left, window.innerWidth - panelWidth - margin));
        top = Math.max(margin, Math.min(saved.top, window.innerHeight - panelHeight - margin));
    }

    panel.style.width = `${panelWidth}px`;
    panel.style.height = `${panelHeight}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

function isValidAnchorRect(rect) {
    if (!rect || typeof rect !== "object") {
        return false;
    }

    return ["left", "right", "top", "height"].every((key) => Number.isFinite(Number(rect[key])));
}

function showFloatingEntryFromMenu(context) {
    const settingsStore = context.settingsStore;
    if (settingsStore?.exportSettings && settingsStore?.saveSettings) {
        const settings = settingsStore.exportSettings();
        settings.floatingEntryVisible_Switch = true;
        settingsStore.saveSettings(settings);
    }

    context.floatingEntry?.show?.();
    context.floatingEntry?.syncFromSettings?.();
}

function renderPanel(panel, context, state) {
    panel.replaceChildren();

    const shell = createElement("div", "bbvt-panel");
    const status = createElement("div", "bbvt-status");
    shell.appendChild(renderHeader(panel, context, state, status));

    const moreButton = createElement("button", "bbvt-more-toggle", state.showAdvanced ? "返回默认规则" : "更多设置");
    moreButton.type = "button";
    moreButton.addEventListener("click", () => {
        state.showAdvanced = !state.showAdvanced;
        renderPanel(panel, context, state);
    });

    const body = createElement("div", state.showAdvanced ? "bbvt-body bbvt-body-advanced" : "bbvt-body");
    if (state.showAdvanced) {
        for (const group of advancedMenuGroups) {
            body.appendChild(renderAdvancedGroup(group, panel, context, state, status));
        }
    } else {
        for (const section of defaultMenuSections) {
            const sectionEl = renderSection(section, panel, context, state, status, {
                hideDisabled: true,
                showSuggestions: true,
            });
            if (sectionEl) {
                body.appendChild(sectionEl);
            }
        }

        if (!body.children.length) {
            const emptySection = createElement("section", "bbvt-section bbvt-section-empty");
            emptySection.appendChild(createElement("div", "bbvt-empty", "默认规则已全部关闭"));
            body.appendChild(emptySection);
        }
    }
    shell.appendChild(moreButton);
    shell.appendChild(body);

    shell.appendChild(renderActions(panel, context, state, status, body));
    shell.appendChild(status);

    panel.appendChild(shell);
    const statusMessage = state.statusMessage || "已读取当前配置";
    state.statusMessage = "";
    setStatus(status, statusMessage);

    initResizer(panel);
}

function renderHeader(panel, context, state, status) {
    const header = createElement("div", "bbvt-header");
    const titleGroup = createElement("div", "bbvt-title-group");
    const title = createElement("div", "bbvt-title", "Bilibili 屏蔽参数面板");
    const subtitle = createElement("div", "bbvt-subtitle", "分组编辑配置，保存后立即生效");
    const closeButton = createElement("button", "bbvt-close", "×");
    setButtonIcon(closeButton, "close", "保存并关闭");

    closeButton.type = "button";
    closeButton.addEventListener("click", () => {
        saveSettings(context, state, status, () => panel.remove());
    });

    titleGroup.append(title, subtitle);
    header.append(titleGroup, closeButton);
    return header;
}

function renderSection(section, panel, context, state, status, options = {}) {
    const sectionElement = createElement("section", "bbvt-section");
    if (!options.hideTitle) {
        sectionElement.appendChild(createElement("h2", "bbvt-section-title", section.title));
    }

    const renderedControls = renderControls(
        sectionElement,
        section.controls,
        panel,
        context,
        state,
        status,
        options
    );

    return renderedControls > 0 ? sectionElement : null;
}

function renderControls(container, controls, panel, context, state, status, options = {}) {
    let renderedControls = 0;

    for (const control of controls) {
        if (options.hideDisabled && !isControlEnabled(control, state)) {
            continue;
        }

        if (control.type === "array") {
            container.appendChild(renderArrayControl(control, state));
            renderedControls++;
            if (options.showSuggestions && control.arrayKey === "blockedUpUid_Array") {
                const suggestions = renderUpBlockSuggestions(panel, context, state, status);
                if (suggestions) {
                    container.appendChild(suggestions);
                }
            }
        }
        if (control.type === "number") {
            container.appendChild(renderNumberControl(control, state));
            renderedControls++;
        }
        if (control.type === "boolean") {
            container.appendChild(renderBooleanControl(control, state, context));
            renderedControls++;
        }
        if (control.type === "choice") {
            container.appendChild(renderChoiceControl(control, state));
            renderedControls++;
        }
    }

    return renderedControls;
}

function renderAdvancedGroup(group, panel, context, state, status) {
    const details = createElement("details", "bbvt-advanced-group");
    details.open = Boolean(state.openAdvancedGroups[group.id]);
    details.addEventListener("toggle", () => {
        state.openAdvancedGroups[group.id] = details.open;
        if (details.open) {
            requestAnimationFrame(() => details.scrollIntoView({ block: "nearest" }));
        }
    });

    const summary = createElement("summary", "bbvt-advanced-summary");
    summary.append(
        createElement("span", "bbvt-advanced-summary-title", group.title),
        createElement("span", "bbvt-advanced-summary-meta", getAdvancedGroupMeta(group, state))
    );

    const content = createElement("div", "bbvt-advanced-content");
    if (group.type === "feature-switches") {
        content.appendChild(renderFeatureSwitchGroup(state));
    } else {
        renderControls(content, group.controls, panel, context, state, status);
    }

    details.append(summary, content);
    return details;
}

function renderFeatureSwitchGroup(state) {
    const wrapper = createElement("div", "bbvt-feature-switch-list");
    featureSwitchControls.forEach((control) => {
        const switchKey = getControlSwitchKey(control);
        if (!switchKey) {
            return;
        }

        const row = createElement("div", "bbvt-feature-switch-row");
        row.appendChild(
            createCheckboxLabel(control.label, state.settings[switchKey], (checked) => {
                state.settings[switchKey] = checked;
            })
        );

        const meta = getFeatureSwitchMeta(control, state);
        if (meta) {
            row.appendChild(createElement("span", "bbvt-feature-switch-meta", meta));
        }
        wrapper.appendChild(row);
    });

    return wrapper;
}

function getAdvancedGroupMeta(group, state) {
    if (group.type === "feature-switches") {
        return `已启用 ${countEnabledFeatureSwitches(state)}/${featureSwitchControls.length}`;
    }

    return `${group.controls?.length || 0} 项`;
}

function countEnabledFeatureSwitches(state) {
    return featureSwitchControls.reduce((count, control) => {
        const switchKey = getControlSwitchKey(control);
        return switchKey && state.settings[switchKey] ? count + 1 : count;
    }, 0);
}

function getFeatureSwitchMeta(control, state) {
    if (control.type === "array") {
        return `${state.settings[control.arrayKey]?.length || 0} 项`;
    }

    if (control.type === "number") {
        const value = state.settings[control.valueKey] ?? 0;
        return `阈值 ${value}${control.unit || ""}`;
    }

    return "";
}

function isControlEnabled(control, state) {
    const switchKey = getControlSwitchKey(control);
    return !switchKey || Boolean(state.settings[switchKey]);
}

function getControlSwitchKey(control) {
    if (control.type === "array" || control.type === "number") {
        return control.switchKey;
    }

    if (control.type === "boolean") {
        return control.key;
    }

    return "";
}

function renderArrayControl(control, state) {
    const row = createElement("div", "bbvt-control bbvt-array-control");
    const header = createElement("div", "bbvt-control-header");
    const enabledLabel = createCheckboxLabel(control.label, state.settings[control.switchKey], (checked) => {
        state.settings[control.switchKey] = checked;
    });
    header.appendChild(enabledLabel);

    if (control.regularKey) {
        header.appendChild(
            createCheckboxLabel("正则", state.settings[control.regularKey], (checked) => {
                state.settings[control.regularKey] = checked;
            })
        );
    }

    const list = createElement("div", "bbvt-chip-list");
    renderArrayItems(list, control, state);

    const inputRow = createElement("div", "bbvt-input-row");
    const input = createElement("input", "bbvt-text-input");
    input.type = "text";
    input.placeholder = control.placeholder || "输入后点击添加，多个项目可用英文逗号分隔";

    const addButton = createElement("button", "", "添加");
    addButton.type = "button";
    addButton.addEventListener("click", () => {
        const items = parseInputItems(input.value, control.arrayKey);
        if (items.length === 0) {
            return;
        }

        state.settings[control.arrayKey] = appendUnique(state.settings[control.arrayKey], items);
        applyArrayControlSideEffects(state.settings, control.arrayKey, items);
        input.value = "";
        renderArrayItems(list, control, state);
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addButton.click();
        }
    });

    inputRow.append(input, addButton);
    row.append(header, list, inputRow);
    return row;
}

function renderUpBlockSuggestions(panel, context, state, status) {
    const suggestions = context.upBlockStatsStore?.getSuggestions?.(upSuggestionMinBlockedCount) || [];
    if (suggestions.length === 0) {
        return null;
    }

    const wrapper = createElement("details", "bbvt-up-suggestions");
    const summary = createElement("summary", "bbvt-up-suggestions-title");
    summary.append(
        createElement("span", "", `建议拉黑的 UP（${suggestions.length}）`),
        createElement("span", "bbvt-up-suggestions-meta", `已屏蔽 ≥ ${upSuggestionMinBlockedCount} 次`)
    );
    wrapper.appendChild(summary);

    const list = createElement("div", "bbvt-up-suggestions-list");
    suggestions.forEach((suggestion) => {
        const row = createElement("div", "bbvt-up-suggestion-row");
        const tooltip = formatUpSuggestionTooltip(suggestion);
        if (tooltip) {
            row.title = tooltip;
        }

        const main = createElement("div", "bbvt-up-suggestion-main");
        main.append(
            createElement("span", "bbvt-up-suggestion-name", suggestion.upName || "未知 UP"),
            createElement("span", "bbvt-up-suggestion-uid", `UID ${suggestion.upUid}`),
            createElement("span", "bbvt-up-suggestion-count", `已屏蔽 ${suggestion.blockedCount} 次`)
        );

        const actions = createElement("div", "bbvt-up-suggestion-actions");
        const suggestionStatus = getSuggestedUpStatus(state.settings, suggestion);
        const addButton = createElement(
            "button",
            "bbvt-up-suggestion-btn",
            suggestionStatus === "blocked" ? "已加入" :
                suggestionStatus === "whitelisted" ? "已白名单" : "加入本脚本屏蔽"
        );
        addButton.type = "button";
        addButton.disabled = Boolean(suggestionStatus);
        addButton.addEventListener("click", () => {
            try {
                state.settings.blockedUpUid_Switch = true;
                state.settings.blockedUpUid_Array = appendUnique(
                    state.settings.blockedUpUid_Array,
                    [suggestion.upUid]
                );
                state.settings.whitelistUpUid_Array = removeItems(state.settings.whitelistUpUid_Array, [suggestion.upUid]);
                state.settings.whitelistNameOrUid_Array = removeItems(
                    state.settings.whitelistNameOrUid_Array,
                    [suggestion.upUid]
                );
                state.settings = context.settingsStore.saveSettings(state.settings);
                state.statusMessage = `已加入 UP 屏蔽：${suggestion.upName || suggestion.upUid}`;
                context.refresh({ reevaluate: true });
                renderPanel(panel, context, state);
            } catch (error) {
                setStatus(status, `加入失败：${error.message}`, true);
            }
        });

        const homeButton = createElement("button", "bbvt-up-suggestion-btn bbvt-up-suggestion-btn-secondary", "打开 UP 主页");
        homeButton.type = "button";
        homeButton.addEventListener("click", () => {
            window.open(`https://space.bilibili.com/${suggestion.upUid}`, "_blank", "noopener,noreferrer");
        });

        actions.append(addButton, homeButton);
        row.append(main, actions);
        list.appendChild(row);
    });

    wrapper.appendChild(list);
    return wrapper;
}

function applyArrayControlSideEffects(settings, arrayKey, items) {
    const uidItems = (items || []).filter((item) => /^\d+$/.test(String(item || "").trim()));
    if (uidItems.length === 0) {
        return;
    }

    if (arrayKey === "blockedUpUid_Array") {
        settings.whitelistUpUid_Array = removeItems(settings.whitelistUpUid_Array, uidItems);
        settings.whitelistNameOrUid_Array = removeItems(settings.whitelistNameOrUid_Array, uidItems);
    }

    if (arrayKey === "whitelistUpUid_Array") {
        settings.blockedUpUid_Array = removeItems(settings.blockedUpUid_Array, uidItems);
        settings.blockedNameOrUid_Array = removeItems(settings.blockedNameOrUid_Array, uidItems);
    }
}

function renderArrayItems(list, control, state) {
    list.replaceChildren();
    const values = state.settings[control.arrayKey] || [];

    if (values.length === 0) {
        list.appendChild(createElement("span", "bbvt-empty", "暂无项目"));
        return;
    }

    const displayItems = values
        .map((value, index) => ({
            value,
            index,
            count: state.statsData ? getChipStatsCount(control, state, value) : 0,
        }))
        .sort((a, b) => b.count - a.count || a.index - b.index);

    displayItems.forEach(({ value, index, count }, displayIndex) => {
        const chip = createElement("span", "bbvt-chip");
        const label = state.settings.hideBlockedWordsInMenu_Switch ? `屏蔽词${displayIndex + 1}` : value;
        const text = createElement("span", "", label);
        const removeButton = createElement("button", "bbvt-chip-remove", "×");
        removeButton.type = "button";
        removeButton.addEventListener("click", () => {
            state.settings[control.arrayKey] = values.filter((_, itemIndex) => itemIndex !== index);
            renderArrayItems(list, control, state);
        });

        if (count > 0) {
            const level = computeChipHeatLevel(count, state.statsTotal);
            chip.style.background = level > 0 ? chipHeatColors[level] : countedChipColor;
        }

        chip.append(text, removeButton);
        list.appendChild(chip);
    });
}

function getSuggestedUpStatus(settings, suggestion) {
    if ((settings.blockedUpUid_Array || []).some((item) => item == suggestion.upUid)) {
        return "blocked";
    }

    if ((settings.whitelistUpUid_Array || []).some((item) => item == suggestion.upUid)) {
        return "whitelisted";
    }

    return "";
}

function formatUpSuggestionTooltip(suggestion) {
    return [
        suggestion.lastReason ? `最近命中：${suggestion.lastReason}` : "",
        suggestion.lastVideoTitle ? `最近视频：${suggestion.lastVideoTitle}` : "",
        suggestion.lastVideoBv ? `BV：${suggestion.lastVideoBv}` : "",
    ].filter(Boolean).join("\n");
}

function getChipStatsCount(control, state, value) {
    const statsType = arrayKeyToStatsType[control.arrayKey];
    if (!statsType) {
        return 0;
    }

    const useRegular = Boolean(control.regularKey && state.settings[control.regularKey]);
    return Object.entries(state.statsData).reduce((sum, [key, count]) => {
        const stat = splitStatsKey(key);
        if (stat.type !== statsType) {
            return sum;
        }

        return isStatsItemMatchedByConfig(control.arrayKey, value, stat.item, useRegular) ? sum + count : sum;
    }, 0);
}

function splitStatsKey(key) {
    const sep = key.indexOf(": ");
    if (sep < 0) {
        return { type: key, item: "" };
    }

    return {
        type: key.slice(0, sep),
        item: key.slice(sep + 2),
    };
}

function isStatsItemMatchedByConfig(arrayKey, configValue, statItem, useRegular) {
    if (statItem === configValue) {
        return true;
    }

    if (arrayKey === "blockedVideoPartitions_Array") {
        return isPartitionStatsItemMatched(configValue, statItem, useRegular);
    }

    if (arrayKey === "doubleBlockedTag_Array") {
        return isDoubleTagStatsItemMatched(configValue, statItem, useRegular);
    }

    return useRegular && isRegexMatch(configValue, statItem);
}

function isPartitionStatsItemMatched(configValue, statItem, useRegular) {
    const candidates = getPartitionConfigCandidates(configValue);
    if (candidates.includes(statItem)) {
        return true;
    }

    return useRegular && candidates.some((candidate) => isRegexMatch(candidate, statItem));
}

function getPartitionConfigCandidates(configValue) {
    const value = String(configValue).trim();
    const ridMatch = value.match(/^(.*?)（rid:\s*(\d+)）$/);
    if (!ridMatch) {
        return [value];
    }

    const name = ridMatch[1].trim();
    const rid = ridMatch[2].trim();
    return [value, name, `rid:${rid}`, rid].filter(Boolean);
}

function isDoubleTagStatsItemMatched(configValue, statItem, useRegular) {
    const configParts = configValue.split("|").map((item) => item.trim());
    const statParts = statItem.split(",").map((item) => item.trim());
    if (configParts.length !== 2 || statParts.length !== 2) {
        return false;
    }

    if (useRegular) {
        return isRegexMatch(configParts[0], statParts[0]) && isRegexMatch(configParts[1], statParts[1]);
    }

    return configParts[0] === statParts[0] && configParts[1] === statParts[1];
}

function isRegexMatch(pattern, value) {
    return safeRegexTest(pattern, value);
}

function renderNumberControl(control, state) {
    const row = createElement("div", "bbvt-control bbvt-inline-control");
    row.appendChild(
        createCheckboxLabel(control.label, state.settings[control.switchKey], (checked) => {
            state.settings[control.switchKey] = checked;
        })
    );

    const input = createElement("input", "bbvt-number-input");
    input.type = "number";
    input.min = "0";
    input.value = state.settings[control.valueKey] ?? 0;
    input.addEventListener("input", () => {
        state.settings[control.valueKey] = Number(input.value);
    });

    row.append(input);
    if (control.unit) {
        row.appendChild(createElement("span", "bbvt-unit", control.unit));
    }
    return row;
}

function renderChoiceControl(control, state) {
    const row = createElement("div", "bbvt-control bbvt-choice-control");
    const label = createElement("div", "bbvt-choice-label", control.label);
    row.appendChild(label);

    const options = createElement("div", "bbvt-choice-options");
    for (const option of control.options) {
        const optionLabel = createElement("label", "bbvt-choice-option");
        const input = createElement("input");
        input.type = "radio";
        input.name = `${menuId}-${control.key}`;
        input.value = option.value;
        input.checked = state.settings[control.key] === option.value;
        input.addEventListener("change", () => {
            if (input.checked) {
                state.settings[control.key] = option.value;
                updateChoiceHint(row, control.key, state);
            }
        });

        const text = createElement("span", "bbvt-choice-option-text", option.label);
        optionLabel.append(input, text);
        options.appendChild(optionLabel);
    }

    row.appendChild(options);

    const hint = createElement("div", "bbvt-choice-hint", getContextMenuScriptModifierHint(state.settings[control.key]));
    hint.dataset.choiceHintFor = control.key;
    row.appendChild(hint);

    return row;
}

function updateChoiceHint(row, key, state) {
    const hint = row.querySelector(`[data-choice-hint-for="${key}"]`);
    if (hint) {
        hint.textContent = getContextMenuScriptModifierHint(state.settings[key]);
    }
}

const immediateApplySettingKeys = new Set(["scriptEnabled_Switch"]);

function renderBooleanControl(control, state, context) {
    const row = createElement("div", "bbvt-control bbvt-inline-control");
    if (control.key === "accumulateBlockedRules_Switch") {
        row.title = "开启后：已屏蔽的视频仍会继续匹配后续规则并可能请求 API，用于统计多条命中。";
    }
    row.appendChild(
        createCheckboxLabel(control.label, state.settings[control.key], (checked) => {
            state.settings[control.key] = checked;
            if (immediateApplySettingKeys.has(control.key)) {
                applyImmediateSetting(context, state);
            }
        })
    );
    return row;
}

function applyImmediateSetting(context, state) {
    state.settings = context.settingsStore.saveSettings(state.settings);
    context.floatingEntry?.syncFromSettings?.();
    if (state.settings.scriptEnabled_Switch === false) {
        context.clearScriptEffects?.();
    }
    context.refresh({ reevaluate: true });
}

function renderActions(panel, context, state, status) {
    const actions = createElement("div", "bbvt-actions");
    const reloadButton = createElement("button", "bbvt-action-button");
    const saveButton = createElement("button", "bbvt-action-button bbvt-action-primary");
    const importButton = createElement("button", "bbvt-action-button");
    const exportButton = createElement("button", "bbvt-action-button");
    const overlayButton = createElement("button", "bbvt-action-button");
    const jsonButton = createElement("button", "bbvt-action-button");
    setButtonIcon(reloadButton, "refresh", "重新读取当前配置", "读取");
    setButtonIcon(saveButton, "save", "保存配置", "保存");
    setButtonIcon(importButton, "upload", "导入配置", "导入");
    setButtonIcon(exportButton, "download", "导出配置", "导出");
    setButtonIcon(overlayButton, "eye", "切换已屏蔽叠加层显示", "叠加层");
    setButtonIcon(jsonButton, "code", "打开 JSON 编辑器", "JSON");

    reloadButton.type = "button";
    saveButton.type = "button";
    importButton.type = "button";
    exportButton.type = "button";
    overlayButton.type = "button";
    jsonButton.type = "button";

    reloadButton.addEventListener("click", () => {
        state.settings = deepCloneMenu(context.settingsStore.reloadSettings());
        renderPanel(panel, context, state);
    });

    saveButton.addEventListener("click", () => {
        saveSettings(context, state, status);
    });

    importButton.addEventListener("click", () => {
        importSettings(context, panel, state);
    });

    exportButton.addEventListener("click", () => {
        exportSettings(state.settings, status);
    });

    overlayButton.addEventListener("click", () => {
        state.overlayVisible = !state.overlayVisible;
        toggleBlockedOverlays(state.overlayVisible);
        setStatus(status, state.overlayVisible ? "叠加层已显示" : "叠加层已隐藏");
    });

    jsonButton.addEventListener("click", () => {
        openJsonEditor(context, panel, state);
    });

    const statsButton = createElement("button", "bbvt-action-button");
    setButtonIcon(statsButton, "chart", "打开屏蔽统计", "统计");
    statsButton.type = "button";
    statsButton.addEventListener("click", () => context.openStatsPanel?.());

    actions.append(reloadButton, saveButton, importButton, exportButton, overlayButton, jsonButton, statsButton);
    return actions;
}

function openJsonEditor(context, panel, state) {
    const dialog = createElement("div", "bbvt-json-dialog");
    const box = createElement("div", "bbvt-json-box");
    const textarea = createElement("textarea", "bbvt-json-textarea");
    const actions = createElement("div", "bbvt-json-actions");
    const applyButton = createElement("button", "", "应用到面板");
    const closeButton = createElement("button", "", "关闭");

    textarea.spellcheck = false;
    textarea.value = JSON.stringify(state.settings, null, 2);
    applyButton.type = "button";
    closeButton.type = "button";

    applyButton.addEventListener("click", () => {
        try {
            state.settings = context.settingsStore.normalizeSettings(JSON.parse(textarea.value));
            dialog.remove();
            renderPanel(panel, context, state);
        } catch {
            textarea.classList.add("bbvt-json-error");
        }
    });

    closeButton.addEventListener("click", () => dialog.remove());

    actions.append(applyButton, closeButton);
    box.append(textarea, actions);
    dialog.appendChild(box);
    panel.appendChild(dialog);
}

function saveSettings(context, state, status, onSuccess = () => {}) {
    try {
        state.settings = context.settingsStore.saveSettings(state.settings);
        context.floatingEntry?.syncFromSettings?.();
        context.refresh({ reevaluate: true });
        setStatus(status, "保存成功，已触发刷新");
        onSuccess();
    } catch (error) {
        setStatus(status, `保存失败：${error.message}`, true);
    }
}

function importSettings(context, panel, state) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";

    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
            return;
        }

        try {
            const fileContent = await file.text();
            state.settings = context.settingsStore.normalizeSettings(JSON.parse(fileContent));
            renderPanel(panel, context, state);
        } catch (error) {
            alert(`导入失败：${error.message}`);
        }
    });

    input.click();
}

function exportSettings(settings, status) {
    try {
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `Bilibili_blocked_videos_by_tags_Config_${formatTimestamp()}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setStatus(status, "导出成功");
    } catch (error) {
        setStatus(status, `导出失败：${error.message}`, true);
    }
}

function createCheckboxLabel(text, checked, onChange) {
    const label = createElement("label", "bbvt-checkbox-label");
    const input = createElement("input", "");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    input.addEventListener("change", () => onChange(input.checked));
    const switchEl = createElement("div", "bbvt-switch");
    label.append(input, switchEl, createElement("span", "", text));
    return label;
}

function toggleBlockedOverlays(visible) {
    const overlays = document.querySelectorAll("div.blockedOverlay");
    overlays.forEach((overlay) => {
        overlay.style.display = visible ? "flex" : "none";
    });
}

function setStatus(status, message, isError = false) {
    status.textContent = message;
    status.classList.toggle("bbvt-error", isError);
}

function parseInputItems(value, arrayKey) {
    if (!value.trim()) {
        return [];
    }

    if (arrayKey === "doubleBlockedTag_Array") {
        return value
            .split(",")
            .map((item) => item.split("|").map((part) => part.trim()))
            .filter((parts) => parts.length === 2 && parts.every(Boolean))
            .map((parts) => parts.join("|"));
    }

    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}


function arrayControl(label, switchKey, arrayKey, regularKey, placeholder = "") {
    return {
        type: "array",
        label,
        switchKey,
        arrayKey,
        regularKey,
        placeholder,
    };
}

function numberControl(label, switchKey, valueKey, unit) {
    return {
        type: "number",
        label,
        switchKey,
        valueKey,
        unit,
    };
}

function booleanControl(label, key) {
    return {
        type: "boolean",
        label,
        key,
    };
}

function choiceControl(label, key, options) {
    return {
        type: "choice",
        label,
        key,
        options,
    };
}

function createElement(tagName, className = "", textContent = "") {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    if (textContent) {
        element.textContent = textContent;
    }
    return element;
}

function formatTimestamp() {
    const now = new Date();
    const pad = (value, length = 2) => String(value).padStart(length, "0");
    return [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join("-");
}

function deepCloneMenu(value) {
    return JSON.parse(JSON.stringify(value));
}

function injectMenuStyles() {
    const css = `
        #${menuId} {
            --bbvt-surface: rgba(22, 25, 30, 0.94);
            --bbvt-surface-strong: rgba(31, 36, 43, 0.9);
            --bbvt-surface-soft: rgba(255, 255, 255, 0.06);
            --bbvt-border: rgba(255, 255, 255, 0.1);
            --bbvt-text: rgb(239, 244, 248);
            --bbvt-muted: rgb(169, 179, 191);
            --bbvt-primary: rgb(18, 183, 219);
            --bbvt-primary-hover: rgb(33, 202, 238);
            --bbvt-danger: rgb(232, 93, 93);
            position: fixed;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            animation: bbvtFadeIn 0.25s ease-out forwards;
        }

        @keyframes bbvtFadeIn {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
        }

        #${menuId} ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        #${menuId} ::-webkit-scrollbar-track {
            background: transparent;
        }

        #${menuId} ::-webkit-scrollbar-thumb {
            background: rgba(120, 120, 120, 0.4);
            border-radius: 3px;
        }

        #${menuId} ::-webkit-scrollbar-thumb:hover {
            background: rgba(120, 120, 120, 0.6);
        }

        #${menuId} .bbvt-panel {
            width: 100%;
            height: 100%;
            background: var(--bbvt-surface);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            color: var(--bbvt-text);
            border-radius: 8px;
            border: 1px solid var(--bbvt-border);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.16), 0 22px 38px rgba(0, 0, 0, 0.38);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        #${menuId} .bbvt-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 14px 18px;
            background: var(--bbvt-surface-strong);
            border-bottom: 1px solid var(--bbvt-border);
            justify-content: space-between;
            cursor: move;
            user-select: none;
            flex: 0 0 auto;
        }

        #${menuId} .bbvt-actions {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 10px;
            height: 12px;
            padding: 0 18px;
            background: rgba(17, 20, 24, 0.52);
            overflow: hidden;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            position: relative;
            flex: 0 0 auto;
        }

        #${menuId} .bbvt-actions::before {
            content: '';
            position: absolute;
            top: 4px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 4px;
            background: rgba(255, 255, 255, 0.22);
            border-radius: 2px;
            transition: opacity 0.2s ease;
        }

        #${menuId} .bbvt-actions:hover {
            height: 48px;
            padding: 0 18px;
            background: var(--bbvt-surface-strong);
        }

        #${menuId} .bbvt-actions:hover::before {
            opacity: 0;
        }

        #${menuId} .bbvt-actions button {
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            padding: 4px 12px;
            font-size: 12px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            color: rgb(216, 224, 232);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        #${menuId} .bbvt-actions:hover button {
            opacity: 1;
            transform: translateY(0);
        }

        #${menuId} .bbvt-actions button:hover {
            background: var(--bbvt-primary);
            color: white;
            border-color: transparent;
            box-shadow: 0 4px 12px rgba(18, 183, 219, 0.32);
        }

        #${menuId} .bbvt-actions .bbvt-action-primary {
            background: rgba(18, 183, 219, 0.22);
            color: rgb(125, 224, 242);
            border-color: rgba(18, 183, 219, 0.22);
        }

        #${menuId} .bbvt-title {
            font-size: 16px;
            font-weight: 700;
        }

        #${menuId} .bbvt-subtitle {
            margin-top: 4px;
            font-size: 12px;
            color: var(--bbvt-muted);
        }

        #${menuId} .bbvt-close,
        #${menuId} button {
            border: 0;
            border-radius: 8px;
            background: var(--bbvt-primary);
            color: white;
            padding: 7px 14px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        #${menuId} button:hover {
            background: var(--bbvt-primary-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(18, 183, 219, 0.28);
        }

        #${menuId} button:active {
            transform: translateY(0);
        }

        #${menuId} .bbvt-close {
            width: 32px;
            height: 32px;
            padding: 0;
            font-size: 14px;
            line-height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.08);
            color: rgb(216, 224, 232);
        }

        #${menuId} .bbvt-close:hover {
            background: var(--bbvt-danger);
            box-shadow: 0 4px 12px rgba(232, 93, 93, 0.28);
        }

        #${menuId} .bbvt-more-toggle {
            align-self: flex-start;
            margin: 14px 18px 0;
            background: rgba(255, 255, 255, 0.08);
            color: rgb(216, 224, 232);
            box-shadow: none;
            flex: 0 0 auto;
        }

        #${menuId} .bbvt-more-toggle:hover {
            background: rgba(255, 255, 255, 0.14);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        #${menuId} .bbvt-body {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 18px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            align-items: stretch;
            overscroll-behavior: contain;
        }

        #${menuId} .bbvt-body-advanced {
            gap: 10px;
        }

        #${menuId} .bbvt-section {
            border: 1px solid var(--bbvt-border);
            border-radius: 8px;
            background: var(--bbvt-surface-soft);
            padding: 14px;
            transition: background 0.2s ease;
        }

        #${menuId} .bbvt-section-empty {
            color: rgb(180, 180, 180);
        }

        #${menuId} .bbvt-section:hover {
            background: rgba(255, 255, 255, 0.09);
        }

        #${menuId} .bbvt-section-title {
            margin: 0 0 12px;
            font-size: 14px;
            line-height: 1.3;
        }

        #${menuId} .bbvt-control {
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            padding: 12px 0;
        }

        #${menuId} .bbvt-control:first-of-type {
            border-top: 0;
            padding-top: 0;
        }

        #${menuId} .bbvt-advanced-group {
            border: 1px solid var(--bbvt-border);
            border-radius: 8px;
            background: var(--bbvt-surface-soft);
            overflow: hidden;
            flex: 0 0 auto;
            min-width: 0;
        }

        #${menuId} .bbvt-advanced-group[open] {
            overflow: visible;
        }

        #${menuId} .bbvt-advanced-summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 13px 14px;
            cursor: pointer;
            list-style: none;
            user-select: none;
        }

        #${menuId} .bbvt-advanced-summary::-webkit-details-marker {
            display: none;
        }

        #${menuId} .bbvt-advanced-summary::before {
            content: "›";
            color: var(--bbvt-muted);
            font-size: 18px;
            line-height: 1;
            transition: transform 0.2s ease;
        }

        #${menuId} .bbvt-advanced-group[open] .bbvt-advanced-summary::before {
            transform: rotate(90deg);
        }

        #${menuId} .bbvt-advanced-summary-title {
            flex: 1;
            min-width: 0;
            font-size: 14px;
            font-weight: 700;
        }

        #${menuId} .bbvt-advanced-summary-meta {
            color: rgb(125, 224, 242);
            font-size: 12px;
            white-space: nowrap;
        }

        #${menuId} .bbvt-advanced-content {
            padding: 0 14px 14px;
            min-width: 0;
        }

        #${menuId} .bbvt-feature-switch-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        #${menuId} .bbvt-feature-switch-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            padding-top: 8px;
        }

        #${menuId} .bbvt-feature-switch-row:first-child {
            border-top: 0;
            padding-top: 0;
        }

        #${menuId} .bbvt-feature-switch-meta {
            color: var(--bbvt-muted);
            font-size: 12px;
            white-space: nowrap;
        }

        #${menuId} .bbvt-control-header,
        #${menuId} .bbvt-inline-control,
        #${menuId} .bbvt-input-row,
        #${menuId} .bbvt-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        #${menuId} .bbvt-checkbox-label {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            line-height: 1.4;
            cursor: pointer;
            user-select: none;
        }

        #${menuId} .bbvt-checkbox-label input[type="checkbox"] {
            display: none;
        }

        #${menuId} .bbvt-choice-control {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
        }

        #${menuId} .bbvt-choice-label {
            font-size: 13px;
            line-height: 1.4;
        }

        #${menuId} .bbvt-choice-options {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        #${menuId} .bbvt-choice-option {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border: 1px solid var(--bbvt-border);
            border-radius: 8px;
            background: rgba(12, 15, 19, 0.62);
            cursor: pointer;
            user-select: none;
            font-size: 12px;
        }

        #${menuId} .bbvt-choice-option:has(input:checked) {
            border-color: rgba(18, 183, 219, 0.75);
            background: rgba(18, 183, 219, 0.14);
            color: rgb(125, 224, 242);
        }

        #${menuId} .bbvt-choice-hint {
            font-size: 11px;
            line-height: 1.45;
            color: var(--bbvt-muted);
        }

        #${menuId} .bbvt-switch {
            position: relative;
            width: 36px;
            height: 20px;
            background: rgb(85, 96, 108);
            border-radius: 10px;
            transition: background 0.3s ease;
        }

        #${menuId} .bbvt-switch::after {
            content: "";
            position: absolute;
            top: 2px;
            left: 2px;
            width: 16px;
            height: 16px;
            background: white;
            border-radius: 50%;
            transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        #${menuId} .bbvt-checkbox-label input[type="checkbox"]:checked + .bbvt-switch {
            background: var(--bbvt-primary);
        }

        #${menuId} .bbvt-checkbox-label input[type="checkbox"]:checked + .bbvt-switch::after {
            transform: translateX(16px);
        }

        #${menuId} .bbvt-text-input,
        #${menuId} .bbvt-number-input {
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 8px;
            background: rgba(12, 15, 19, 0.62);
            color: var(--bbvt-text);
            padding: 8px 10px;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        #${menuId} .bbvt-text-input:focus,
        #${menuId} .bbvt-number-input:focus {
            border-color: var(--bbvt-primary);
            box-shadow: 0 0 0 2px rgba(18, 183, 219, 0.18);
        }

        #${menuId} .bbvt-text-input {
            flex: 1;
            min-width: 180px;
        }

        #${menuId} .bbvt-number-input {
            width: 110px;
        }

        #${menuId} .bbvt-chip-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 10px 0;
            min-height: 26px;
        }

        #${menuId} .bbvt-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: var(--bbvt-text);
            padding: 5px 8px 5px 12px;
            font-size: 12px;
            transition: all 0.2s ease;
        }

        #${menuId} .bbvt-chip:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            background: rgba(255, 255, 255, 0.12);
        }

        #${menuId} .bbvt-chip span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${menuId} .bbvt-chip-remove {
            width: 22px;
            height: 22px;
            padding: 0;
            line-height: 22px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            box-shadow: none;
            color: rgb(216, 224, 232);
        }

        #${menuId} .bbvt-chip-remove:hover {
            background: var(--bbvt-danger);
            color: white;
            transform: scale(1.1);
        }

        #${menuId} .bbvt-up-suggestions {
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            padding: 12px 0 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        #${menuId} .bbvt-up-suggestions-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            color: var(--bbvt-muted);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            list-style: none;
            user-select: none;
        }

        #${menuId} .bbvt-up-suggestions-title::-webkit-details-marker {
            display: none;
        }

        #${menuId} .bbvt-up-suggestions-title::before {
            content: "›";
            font-size: 16px;
            line-height: 1;
            transition: transform 0.2s ease;
        }

        #${menuId} .bbvt-up-suggestions[open] .bbvt-up-suggestions-title::before {
            transform: rotate(90deg);
        }

        #${menuId} .bbvt-up-suggestions-meta {
            margin-left: auto;
            color: rgb(125, 224, 242);
            font-size: 11px;
            font-weight: 500;
        }

        #${menuId} .bbvt-up-suggestions-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        #${menuId} .bbvt-up-suggestion-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 8px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.06);
            padding: 10px 12px;
            transition: background 0.2s ease;
        }

        #${menuId} .bbvt-up-suggestion-row:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        #${menuId} .bbvt-up-suggestion-main {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        #${menuId} .bbvt-up-suggestion-name {
            max-width: 260px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
            font-weight: 600;
        }

        #${menuId} .bbvt-up-suggestion-uid,
        #${menuId} .bbvt-up-suggestion-count {
            color: var(--bbvt-muted);
            font-size: 12px;
        }

        #${menuId} .bbvt-up-suggestion-count {
            color: rgb(125, 224, 242);
        }

        #${menuId} .bbvt-up-suggestion-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            flex-wrap: wrap;
        }

        #${menuId} .bbvt-up-suggestion-btn {
            padding: 6px 12px;
            font-size: 12px;
            box-shadow: none;
        }

        #${menuId} .bbvt-up-suggestion-btn-secondary {
            background: rgba(255, 255, 255, 0.08);
            color: rgb(216, 224, 232);
        }

        #${menuId} .bbvt-up-suggestion-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.14);
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }

        #${menuId} .bbvt-up-suggestion-btn:disabled {
            opacity: 0.55;
            cursor: default;
            transform: none;
            box-shadow: none;
        }

        @media (max-width: 560px) {
            #${menuId} .bbvt-up-suggestion-row {
                grid-template-columns: 1fr;
            }

            #${menuId} .bbvt-up-suggestion-name {
                max-width: 100%;
            }

            #${menuId} .bbvt-up-suggestion-actions {
                justify-content: flex-start;
            }
        }

        #${menuId} .bbvt-empty,
        #${menuId} .bbvt-unit {
            color: var(--bbvt-muted);
            font-size: 12px;
        }

        #${menuId} .bbvt-empty {
            width: 100%;
        }

        #${menuId} .bbvt-status {
            min-height: 20px;
            padding: 10px 18px;
            background: var(--bbvt-surface-strong);
            color: rgb(125, 224, 242);
            font-size: 12px;
            flex: 0 0 auto;
            border-top: 1px solid var(--bbvt-border);
        }

        #${menuId} .bbvt-status.bbvt-error {
            color: rgb(255, 169, 169);
        }

        #${menuId} .bbvt-json-dialog {
            position: absolute;
            inset: 24px;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            animation: bbvtFadeIn 0.2s ease-out forwards;
        }

        #${menuId} .bbvt-json-box {
            width: min(900px, calc(100vw - 72px));
            height: min(680px, calc(100vh - 72px));
            background: var(--bbvt-surface);
            border: 1px solid var(--bbvt-border);
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }

        #${menuId} .bbvt-json-textarea {
            flex: 1;
            resize: none;
            border: 0;
            outline: 0;
            background: rgba(12, 15, 19, 0.76);
            color: var(--bbvt-text);
            padding: 16px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 13px;
            line-height: 1.5;
        }

        #${menuId} .bbvt-json-textarea.bbvt-json-error {
            outline: 2px solid var(--bbvt-danger);
        }

        #${menuId} .bbvt-json-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 14px;
            background: var(--bbvt-surface-strong);
            border-top: 1px solid var(--bbvt-border);
        }

        #${menuId} .bbvt-icon {
            width: 14px;
            height: 14px;
            flex: 0 0 auto;
        }

        #${menuId} .bbvt-icon-label {
            line-height: 1;
        }

        #${menuId} .bbvt-resizer {
            position: absolute;
            z-index: 10;
        }

        #${menuId} .bbvt-resizer-top { top: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize; }
        #${menuId} .bbvt-resizer-bottom { bottom: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize; }
        #${menuId} .bbvt-resizer-left { left: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize; }
        #${menuId} .bbvt-resizer-right { right: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize; }

        #${menuId} .bbvt-resizer-top-left { top: -4px; left: -4px; width: 14px; height: 14px; cursor: nwse-resize; }
        #${menuId} .bbvt-resizer-top-right { top: -4px; right: -4px; width: 14px; height: 14px; cursor: nesw-resize; }
        #${menuId} .bbvt-resizer-bottom-left { bottom: -4px; left: -4px; width: 14px; height: 14px; cursor: nesw-resize; }
        #${menuId} .bbvt-resizer-bottom-right { bottom: -4px; right: -4px; width: 14px; height: 14px; cursor: nwse-resize; }

        .bbvt-drag-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
        }
    `;

    if (typeof GM_addStyle === "function") {
        GM_addStyle(css);
        return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
}

// ---- src/utils/debounce.js ----
function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// ---- src/platform/page-observers.js ----
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
}function shouldIgnoreMutationRecords(records, isPipelineRunning) {
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
}function startPageObservers(run, {
    isPipelineRunning = () => false,
    getAddedVideoElements = () => [],
    onAddedVideoElements = () => {},
} = {}) {
    const debouncedRun = debounce(run, 300);
    const pendingAddedVideoElements = new Set();
    const flushAddedVideoElements = debounce(() => {
        if (pendingAddedVideoElements.size === 0) {
            return;
        }

        onAddedVideoElements([...pendingAddedVideoElements]);
        pendingAddedVideoElements.clear();
    }, 50);

    window.addEventListener("load", run);
    window.addEventListener("resize", debounce(run, 150));

    const observer = new MutationObserver((records) => {
        if (shouldIgnoreMutationRecords(records, isPipelineRunning())) {
            return;
        }

        const addedVideoElements = getAddedVideoElements(records);
        if (addedVideoElements.length > 0) {
            addedVideoElements.forEach((videoElement) => pendingAddedVideoElements.add(videoElement));
            flushAddedVideoElements();
        }

        debouncedRun();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// ---- src/ui/floating-entry.js ----
const floatingEntryId = "bbvtFloatingEntry";
const storagePosKey = "bbvtFloatingPos";
const visibleSettingKey = "floatingEntryVisible_Switch";
const scriptEnabledSettingKey = "scriptEnabled_Switch";
const floatingEntryPeekWidth = 18;
function mountFloatingEntry(context) {
    if (!context.floatingEntry?.mount) {
        context.floatingEntry = createFloatingEntryController(context);
    }

    context.floatingEntry.mount();
}

function createFloatingEntryController(context) {
    let container = null;
    let mainBtn = null;
    let settingsBtn = null;
    let mainLabel = null;
    let mainStat = null;
    let drag = null;
    let justDragged = false;
    let snapTimer = null;
    let hideTimer = null;
    let hasDragged = false;
    let mountScheduled = false;
    let lastStats = { total: 0, blocked: 0, rate: 0 };

    function mount() {
        if (!document.body) {
            if (!mountScheduled) {
                mountScheduled = true;
                window.addEventListener("DOMContentLoaded", () => {
                    mountScheduled = false;
                    mount();
                }, { once: true });
            }
            return;
        }

        const existing = document.getElementById(floatingEntryId);
        if (existing === container && existing?.querySelector(".bbvt-fe-settings")) {
            container = existing;
            mainBtn = existing.querySelector(".bbvt-fe-main");
            settingsBtn = existing.querySelector(".bbvt-fe-settings");
            mainLabel = existing.querySelector(".bbvt-fe-label");
            mainStat = existing.querySelector(".bbvt-fe-stat");
            syncViewportMetrics();
            syncFromSettings();
            return;
        }

        existing?.remove();
        injectFloatingEntryStyles();
        createEntryDom();
        applySavedPosition();
        bindEntryEvents();
        applyStats();
        syncFromSettings();
    }

    function scheduleSnap() {
        if (!container) return;
        clearTimeout(snapTimer);
        clearTimeout(hideTimer);
        snapTimer = setTimeout(() => {
            syncViewportMetrics();
            const rect = container.getBoundingClientRect();
            const entryWidth = rect.width || 96;
            const viewportWidth = getViewportWidth();
            const side = rect.left + entryWidth / 2 < viewportWidth / 2 ? "left" : "right";
            const snapLeft = side === "left" ? 0 : viewportWidth - entryWidth;
            setDockSide(side);
            container.style.transition = "left 0.35s ease";
            container.style.left = snapLeft + "px";
            if (typeof GM_setValue === "function") {
                GM_setValue(storagePosKey, { left: snapLeft, top: parseInt(container.style.top), side });
            }
            hideTimer = setTimeout(() => container.classList.add("bbvt-fe-hidden"), 5000);
        }, 2000);
    }

    function createEntryDom() {
        container = document.createElement("div");
        container.id = floatingEntryId;
        setDockSide("right");
        syncViewportMetrics();

        settingsBtn = document.createElement("button");
        settingsBtn.className = "bbvt-fe-settings";
        settingsBtn.type = "button";
        settingsBtn.title = "打开 Bilibili 屏蔽参数面板";
        settingsBtn.setAttribute("aria-label", "打开设置");
        setButtonIcon(settingsBtn, "settings", "打开设置");

        mainBtn = document.createElement("button");
        mainBtn.className = "bbvt-fe-main";
        mainBtn.type = "button";
        mainBtn.title = "切换 Bilibili 屏蔽总开关";
        setButtonIcon(mainBtn, "shield", "切换 Bilibili 屏蔽总开关");
        mainLabel = document.createElement("span");
        mainLabel.className = "bbvt-fe-label";
        mainStat = document.createElement("span");
        mainStat.className = "bbvt-fe-stat";
        mainBtn.append(mainLabel, mainStat);

        const closeBtn = document.createElement("button");
        closeBtn.className = "bbvt-fe-close";
        closeBtn.type = "button";
        closeBtn.title = "隐藏浮窗，可在设置面板恢复";
        setButtonIcon(closeBtn, "close", "隐藏浮窗");
        closeBtn.addEventListener("click", () => hide());

        container.append(settingsBtn, mainBtn, closeBtn);
        document.body.appendChild(container);
    }

    function applySavedPosition() {
        const savedPos = typeof GM_getValue === "function" ? GM_getValue(storagePosKey, null) : null;
        if (!savedPos || !container) {
            return;
        }

        hasDragged = true;
        container.classList.add("bbvt-fe-custom");
        container.style.left = savedPos.left + "px";
        container.style.top = savedPos.top + "px";
        setDockSide(savedPos.side || getDockSideFromLeft(Number(savedPos.left) || 0));
    }

    function bindEntryEvents() {
        if (!container || !mainBtn || !settingsBtn) {
            return;
        }

        mainBtn.addEventListener("click", () => {
            if (justDragged) { justDragged = false; return; }
            clearTimeout(hideTimer);
            container.classList.remove("bbvt-fe-hidden");
            toggleScriptEnabled();
        });

        mainBtn.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            startDrag(e);
        });

        settingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (justDragged) { justDragged = false; return; }
            clearTimeout(hideTimer);
            container.classList.remove("bbvt-fe-hidden");
            context.openSettingsPanel?.(settingsBtn.getBoundingClientRect());
        });

        settingsBtn.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        });

        container.addEventListener("mouseenter", () => {
            if (!hasDragged) return;
            container.classList.remove("bbvt-fe-hidden");
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => container.classList.add("bbvt-fe-hidden"), 5000);
        });

        container.addEventListener("mouseleave", () => {
            if (!hasDragged || drag) return;
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => container.classList.add("bbvt-fe-hidden"), 5000);
        });

        container.addEventListener("mousedown", (e) => {
            if (e.target.closest?.(".bbvt-fe-close, .bbvt-fe-settings, .bbvt-fe-main")) {
                return;
            }
            e.preventDefault();
            startDrag(e);
        });

        window.addEventListener("mousemove", (e) => {
            if (!drag || !container) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            if (!drag.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            if (!drag.moved) {
                drag.moved = true;
                if (!hasDragged) {
                    hasDragged = true;
                    container.classList.add("bbvt-fe-custom");
                    container.style.right = "auto";
                }
            }
            container.style.left = drag.elemLeft + dx + "px";
            container.style.top = drag.elemTop + dy + "px";
        });

        window.addEventListener("mouseup", () => {
            if (!drag) return;
            if (drag.moved) {
                justDragged = true;
                scheduleSnap();
            }
            drag = null;
        });
    }

    function startDrag(e) {
        clearTimeout(snapTimer);
        clearTimeout(hideTimer);
        container.classList.remove("bbvt-fe-hidden");
        syncViewportMetrics();
        container.style.transition = "none";
        const rect = container.getBoundingClientRect();
        drag = { startX: e.clientX, startY: e.clientY, elemLeft: rect.left, elemTop: rect.top, moved: false };
    }

    function updateStats(total, blocked, rate) {
        lastStats = { total, blocked, rate };
        applyStats();
    }

    function applyStats() {
        if (!container || !mainBtn) {
            return;
        }

        if (!isFloatingEntryScriptEnabled(context)) {
            syncScriptEnabledState();
            return;
        }

        const hasStats = Number(lastStats.total) > 0;
        const blocked = Math.max(0, Number(lastStats.blocked) || 0);
        const total = Math.max(0, Number(lastStats.total) || 0);
        const statText = hasStats ? `${blocked}/${total}` : "就绪";

        if (lastStats.rate >= 0.5 && total >= 5) {
            container.classList.add("bbvt-fe-warning");
            updateMainContent("屏", statText);
            return;
        }

        container.classList.remove("bbvt-fe-warning");
        updateMainContent("屏", statText);
    }

    function toggleScriptEnabled() {
        const settingsStore = context.settingsStore;
        if (!settingsStore?.exportSettings || !settingsStore?.saveSettings) {
            return;
        }

        const settings = settingsStore.exportSettings();
        settings[scriptEnabledSettingKey] = !isFloatingEntryScriptEnabled(context);
        settingsStore.saveSettings(settings);
        syncScriptEnabledState();
        if (!isFloatingEntryScriptEnabled(context)) {
            context.clearScriptEffects?.();
        }
        context.refresh?.({ reevaluate: true });
    }

    function syncScriptEnabledState() {
        if (!container || !mainBtn) {
            return;
        }

        const enabled = isFloatingEntryScriptEnabled(context);
        container.classList.toggle("bbvt-fe-disabled", !enabled);

        if (!enabled) {
            container.classList.remove("bbvt-fe-warning");
            updateMainContent("关", "暂停");
            return;
        }

        applyStats();
    }

    function show() {
        setVisible(true, true);
    }

    function hide() {
        setVisible(false, true);
    }

    function syncFromSettings() {
        setVisible(isFloatingEntryVisible(context), false);
        syncScriptEnabledState();
    }

    function setVisible(visible, persist) {
        if (persist) {
            saveFloatingEntryVisible(context, visible);
        }

        if (!container) {
            return;
        }

        clearTimeout(hideTimer);
        container.hidden = !visible;
        container.classList.toggle("bbvt-fe-closed", !visible);
        if (visible) {
            container.classList.remove("bbvt-fe-hidden");
        }
    }

    function updateMainContent(label, stat) {
        if (mainLabel) {
            mainLabel.textContent = label;
        }
        if (mainStat) {
            mainStat.textContent = stat;
        }
    }

    function setDockSide(side) {
        if (!container) {
            return;
        }

        const normalizedSide = side === "left" ? "left" : "right";
        container.classList.toggle("bbvt-fe-side-left", normalizedSide === "left");
        container.classList.toggle("bbvt-fe-side-right", normalizedSide === "right");
    }

    function getDockSideFromLeft(left) {
        const viewportWidth = getViewportWidth();
        const entryWidth = container?.getBoundingClientRect?.().width || 96;
        return left + entryWidth / 2 < viewportWidth / 2 ? "left" : "right";
    }

    function syncViewportMetrics() {
        if (!container?.style?.setProperty) {
            return;
        }

        container.style.setProperty("--bbvt-fe-peek-width", `${floatingEntryPeekWidth}px`);
        container.style.setProperty("--bbvt-fe-scrollbar-width", `${getScrollbarWidth()}px`);
    }

    return {
        mount,
        updateStats,
        show,
        hide,
        syncFromSettings,
    };
}

function isFloatingEntryScriptEnabled(context) {
    return context.settingsStore?.getSettings?.()?.[scriptEnabledSettingKey] !== false;
}

function isFloatingEntryVisible(context) {
    return context.settingsStore?.getSettings?.()?.[visibleSettingKey] !== false;
}

function saveFloatingEntryVisible(context, visible) {
    const settingsStore = context.settingsStore;
    if (!settingsStore?.exportSettings || !settingsStore?.saveSettings) {
        return;
    }

    const settings = settingsStore.exportSettings();
    settings[visibleSettingKey] = Boolean(visible);
    settingsStore.saveSettings(settings);
}

function getViewportWidth() {
    return document.documentElement?.clientWidth || window.innerWidth || 1280;
}

function getScrollbarWidth() {
    const innerWidth = window.innerWidth || getViewportWidth();
    return Math.max(0, innerWidth - getViewportWidth());
}

function injectFloatingEntryStyles() {
    const css = `
        #${floatingEntryId} {
            position: fixed;
            top: 92px;
            right: calc(-96px + var(--bbvt-fe-peek-width, 18px) + var(--bbvt-fe-scrollbar-width, 0px));
            z-index: 2147483646;
            width: 96px;
            height: 36px;
            cursor: grab;
            user-select: none;
            transition: right 0.24s ease, opacity 0.24s ease, transform 0.24s ease;
            overflow: visible;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        }

        #${floatingEntryId}::before {
            content: "";
            position: absolute;
            top: -8px;
            bottom: -8px;
            z-index: 0;
        }

        #${floatingEntryId}.bbvt-fe-side-right::before {
            left: -74px;
            right: 0;
        }

        #${floatingEntryId}.bbvt-fe-side-left::before {
            left: 0;
            right: -74px;
        }

        #${floatingEntryId}:not(.bbvt-fe-custom):hover {
            right: 18px;
        }

        #${floatingEntryId}:active {
            cursor: grabbing;
        }

        #${floatingEntryId}.bbvt-fe-custom {
            right: auto;
            transition: opacity 0.24s ease, transform 0.24s ease;
        }

        #${floatingEntryId}.bbvt-fe-hidden {
            opacity: 0.92;
        }

        #${floatingEntryId}.bbvt-fe-hidden.bbvt-fe-side-left {
            transform: translateX(calc(-100% + var(--bbvt-fe-peek-width, 18px)));
        }

        #${floatingEntryId}.bbvt-fe-hidden.bbvt-fe-side-right {
            transform: translateX(calc(100% - var(--bbvt-fe-peek-width, 18px)));
        }

        #${floatingEntryId} .bbvt-fe-settings,
        #${floatingEntryId} .bbvt-fe-close {
            position: absolute;
            top: 4px;
            width: 28px;
            height: 28px;
            border: 0;
            border-radius: 50%;
            background: rgba(22, 25, 30, 0.94);
            color: rgb(232, 238, 243);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
            text-align: center;
            cursor: pointer;
            padding: 0;
            z-index: 3;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
            transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease, color 0.18s ease;
        }

        #${floatingEntryId} .bbvt-fe-close {
            top: -2px;
            width: 22px;
            height: 22px;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);
        }

        #${floatingEntryId}.bbvt-fe-side-right .bbvt-fe-settings {
            left: -34px;
            right: auto;
            transform: translateX(12px) scale(0.9);
        }

        #${floatingEntryId}.bbvt-fe-side-right .bbvt-fe-close {
            left: -58px;
            right: auto;
            transform: translateX(22px) scale(0.9);
        }

        #${floatingEntryId}.bbvt-fe-side-left .bbvt-fe-settings {
            left: auto;
            right: -34px;
            transform: translateX(-12px) scale(0.9);
        }

        #${floatingEntryId}.bbvt-fe-side-left .bbvt-fe-close {
            left: auto;
            right: -58px;
            transform: translateX(-22px) scale(0.9);
        }

        #${floatingEntryId}:hover .bbvt-fe-settings,
        #${floatingEntryId}:hover .bbvt-fe-close {
            opacity: 1;
            pointer-events: auto;
            transform: translateX(0) scale(1);
        }

        #${floatingEntryId} .bbvt-fe-settings:hover {
            background: rgba(42, 48, 57, 0.98);
            color: rgb(125, 224, 242);
        }

        #${floatingEntryId} .bbvt-fe-close:hover {
            background: rgba(232, 93, 93, 0.95);
            color: white;
        }

        #${floatingEntryId} .bbvt-fe-main {
            position: absolute;
            inset: 0;
            z-index: 2;
            width: 96px;
            height: 36px;
            border: 1px solid rgba(18, 183, 219, 0.32);
            border-radius: 999px;
            background: rgba(22, 25, 30, 0.92);
            color: rgb(239, 244, 248);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            padding: 0 11px;
            display: grid;
            grid-template-columns: 14px auto minmax(32px, 1fr);
            align-items: center;
            gap: 7px;
            transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }

        #${floatingEntryId} .bbvt-fe-main:hover {
            transform: translateY(-1px);
            border-color: rgba(18, 183, 219, 0.58);
            background: rgba(27, 31, 37, 0.96);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3), 0 0 0 3px rgba(18, 183, 219, 0.08);
        }

        #${floatingEntryId} .bbvt-fe-main:active {
            transform: translateY(0);
        }

        #${floatingEntryId} .bbvt-fe-label {
            min-width: 0;
            line-height: 1;
            letter-spacing: 0;
        }

        #${floatingEntryId} .bbvt-fe-stat {
            min-width: 0;
            justify-self: end;
            max-width: 42px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 2px 6px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            color: rgb(142, 154, 168);
            font-size: 11px;
            font-weight: 600;
            line-height: 1.25;
        }

        #${floatingEntryId}.bbvt-fe-disabled .bbvt-fe-main {
            border-color: rgba(15, 23, 42, 0.16);
            background: rgba(246, 248, 251, 0.94);
            color: rgb(45, 55, 72);
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
        }

        #${floatingEntryId}.bbvt-fe-disabled .bbvt-fe-stat {
            background: rgba(15, 23, 42, 0.08);
            color: rgb(84, 96, 112);
        }

        #${floatingEntryId}.bbvt-fe-warning .bbvt-fe-main {
            border-color: rgba(245, 158, 11, 0.62);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), 0 0 0 3px rgba(245, 158, 11, 0.08);
        }

        #${floatingEntryId}.bbvt-fe-warning .bbvt-fe-main::after {
            content: "";
            position: absolute;
            right: 8px;
            top: 7px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: rgb(245, 158, 11);
            box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.14);
        }

        #${floatingEntryId} .bbvt-icon {
            width: 13px;
            height: 13px;
            flex: 0 0 auto;
        }
    `;

    if (typeof GM_addStyle === "function") {
        GM_addStyle(css);
        return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
}

// ---- src/main.js ----
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
})();

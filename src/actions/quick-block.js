import { appendBlockedPartition, appendBlockedUp, appendBlockedTags, appendBlockedTitles } from "../settings/mutations.js";
import { getKeywordCandidates } from "../utils/keyword-candidates.js";
import {
    collectSelectedKeywords,
    hasQuickBlockSelection,
    renderMultiSelectChips,
} from "../utils/multi-select-chips.js";
import { isMasterSwitchEnabled } from "../utils/script-enabled.js";
import { setButtonIcon } from "../ui/icons.js";

const quickBlockId = "bbvtQuickBlock";

export function closeQuickBlockOverlay() {
    const existing = document.getElementById(quickBlockId);
    if (existing) {
        existing.remove();
    }

    if (window.bbvtQuickBlockCloseHandler) {
        document.removeEventListener("mousedown", window.bbvtQuickBlockCloseHandler);
        window.bbvtQuickBlockCloseHandler = null;
    }
}

export function quickBlockVideo(context, videoBv, videoElement, x = 0, y = 0) {
    if (!isMasterSwitchEnabled(context)) {
        return;
    }

    closeQuickBlockOverlay();

    injectQuickBlockStyles();

    const videoInfo = context.videoStore.getVideoInfo(videoBv) || {};
    const fullTitleValue = String(videoInfo.videoTitle || "").trim();
    const titleCandidates = getKeywordCandidates(videoInfo.videoTitle || "");
    const state = {
        upValue: videoInfo.videoUpUid || videoInfo.videoUpName || "",
        upDisplayText: getUpDisplayText(videoInfo),
        fullTitleValue,
        titleValue: "",
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
    const fullTitleQuickBtn = createQuickBlockEl("button", "qb-quick-btn", "完整标题");
    setButtonIcon(fullTitleQuickBtn, "shield", "屏蔽完整标题", "完整标题");
    fullTitleQuickBtn.disabled = !state.fullTitleValue;
    fullTitleQuickBtn.addEventListener("click", () => {
        if (!state.fullTitleValue) return;
        commitQuickBlock(context, videoElement, videoBv, () => {
            appendBlockedTitles(context.settingsStore, [state.fullTitleValue]);
        });
        overlay.remove();
    });
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
    titleRow.append(titleField, fullTitleQuickBtn, titleQuickBtn);

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

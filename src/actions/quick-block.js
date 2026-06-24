import { appendBlockedPartition, appendBlockedUp, appendBlockedTags, appendBlockedTitles } from "../settings/mutations.js";
import { getKeywordCandidates } from "../utils/keyword-candidates.js";
import {
    collectSelectedKeywords,
    hasQuickBlockSelection,
    renderMultiSelectChips,
} from "../utils/multi-select-chips.js";
import { isMasterSwitchEnabled } from "../utils/script-enabled.js";

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
                state.partitionName = partition.name;
                state.partitionId = partition.id;
                state.partitionLoading = false;
                renderQuickBlockPopup(overlay, context, state, videoBv, videoElement);
            });
    }

    context.apiClient
        .ensureTagsData(videoBv, context.videoStore, { bypassBlockedSkip: true })
        .then((tags) => {
            state.tags = tags;
            state.tagsLoading = false;
            renderQuickBlockPopup(overlay, context, state, videoBv, videoElement);
        });
}

function renderQuickBlockPopup(overlay, context, state, videoBv, videoElement) {
    overlay.replaceChildren();

    const panel = createQuickBlockEl("div", "qb-panel");

    // header
    const header = createQuickBlockEl("div", "qb-header");
    const closeButton = createQuickBlockEl("button", "qb-close", "×");
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
    const updateTitleQuickBtn = () => {
        titleQuickBtn.disabled = !hasQuickBlockSelection(state.selectedTitleChips, state.titleValue);
    };
    renderMultiSelectChips(candidates, state.titleCandidates, state.selectedTitleChips, {
        chipClass: "qb-chip qb-chip-action",
        selectedClass: "qb-chip-selected",
        onChange: updateTitleQuickBtn,
    });
    titleField.appendChild(candidates);

    const titleQuickBtn = createQuickBlockEl("button", "qb-quick-btn", "屏蔽");
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
    const partitionValue = getPartitionBlockValue(state);
    const partitionInfo = createQuickBlockEl(
        "div",
        state.partitionLoading ? "qb-info qb-info-muted" : "qb-info",
        state.partitionLoading ? "分区加载中..." : getPartitionDisplayText(state)
    );
    const partitionQuickBtn = createQuickBlockEl("button", "qb-quick-btn", "屏蔽");
    partitionQuickBtn.disabled = state.partitionLoading || !partitionValue;
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

    if (state.tagsLoading) {
        chipsContainer.appendChild(createQuickBlockEl("span", "qb-hint", "标签加载中…"));
        tagsQuickBtn.disabled = true;
    } else if (state.tags.length === 0) {
        chipsContainer.appendChild(createQuickBlockEl("span", "qb-hint", "无可用标签"));
        tagsQuickBtn.disabled = true;
    } else {
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
        tagsQuickBtn.addEventListener("click", () => {
            const values = [...state.selectedTags];
            if (values.length === 0) return;
            commitQuickBlock(context, videoElement, videoBv, () => {
                appendBlockedTags(context.settingsStore, values);
            });
            overlay.remove();
        });
    }

    tagsRow.append(chipsContainer, tagsQuickBtn);
    body.append(upRow, titleRow, partitionRow, tagsRow);

    panel.append(header, body);
    overlay.appendChild(panel);

    const rect = overlay.getBoundingClientRect();
    const margin = 12;
    const offset = 10;
    let left = state.x + offset;
    let top = state.y + offset;
    let originX = '0%';
    let originY = '0%';
    
    if (left + rect.width > window.innerWidth - margin) {
        left = state.x - rect.width - offset;
        originX = '100%';
    }
    if (top + rect.height > window.innerHeight - margin) {
        top = state.y - rect.height - offset;
        originY = '100%';
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
    
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.transformOrigin = `${originX} ${originY}`;
    
    // Add animation after setting transform-origin to prevent flipping animation
    overlay.style.animation = "none"; // Reset in case it was already set
    // Force a reflow to ensure the browser registers the transform-origin before starting the animation
    void overlay.offsetWidth;
    overlay.style.animation = "qbFadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";
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
            background: rgba(40, 40, 40, 0.9);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: rgb(250, 250, 250);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
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
            background: rgba(30, 30, 30, 0.6);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        #${quickBlockId} .qb-title { font-size: 14px; font-weight: 700; }

        #${quickBlockId} .qb-close {
            width: 24px; height: 24px; padding: 0; font-size: 16px;
            line-height: 24px; border: 0; border-radius: 6px;
            background: rgba(255, 255, 255, 0.1); color: rgb(220, 220, 220);
            cursor: pointer; transition: all 0.2s ease;
        }

        #${quickBlockId} .qb-close:hover {
            background: rgba(255, 60, 60, 0.8);
            color: white;
        }

        #${quickBlockId} .qb-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }

        #${quickBlockId} .qb-row { display: flex; align-items: center; gap: 8px; }
        #${quickBlockId} .qb-action-row,
        #${quickBlockId} .qb-tags-row { align-items: flex-start; }

        #${quickBlockId} .qb-row-label {
            width: 36px; flex: 0 0 36px; padding-top: 7px;
            color: rgb(190, 190, 190); font-size: 12px; font-weight: 700;
        }

        #${quickBlockId} .qb-field {
            flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px;
        }

        #${quickBlockId} .qb-subtext {
            color: rgb(160,160,160); font-size: 11px; line-height: 1.3;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        #${quickBlockId} .qb-input {
            flex: 1; width: 100%; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
            background: rgba(20,20,20,0.6); color: rgb(245,245,245);
            padding: 6px 8px; font-size: 12px; outline: none; box-sizing: border-box;
            transition: border-color 0.2s;
        }
        #${quickBlockId} .qb-input:focus { border-color: rgb(0, 174, 236); }

        #${quickBlockId} .qb-info {
            flex: 1; min-width: 0; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
            background: rgba(20,20,20,0.6); color: rgb(245,245,245);
            padding: 6px 8px; font-size: 12px; line-height: 1.35; box-sizing: border-box;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #${quickBlockId} .qb-info-muted { color: rgb(160,160,160); }

        #${quickBlockId} .qb-candidates {
            display: flex; flex-wrap: wrap; gap: 6px;
        }

        #${quickBlockId} .qb-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; padding-top: 1px; }

        #${quickBlockId} .qb-chip {
            display: inline-flex; align-items: center; border-radius: 99px;
            background: rgba(80,80,80,0.4); color: rgb(180,180,180); border: 1px solid rgba(255,255,255,0.05);
            padding: 3px 10px; font-size: 11px; cursor: pointer; user-select: none; transition: all 0.2s ease;
            max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            font-family: inherit;
        }

        #${quickBlockId} .qb-chip:hover {
            background: rgba(0, 174, 236, 0.8); color: white;
        }

        #${quickBlockId} .qb-chip-selected {
            background: rgba(0, 174, 236, 0.85); color: white;
            border-color: rgba(0, 174, 236, 0.4);
        }

        #${quickBlockId} .qb-chip-selected:hover {
            background: rgb(0, 190, 255); color: white;
        }

        #${quickBlockId} .qb-hint { font-size: 12px; color: rgb(160,160,160); padding-top: 4px; }

        #${quickBlockId} .qb-quick-btn {
            border: 0; border-radius: 6px; padding: 5px 10px; font-size: 12px;
            background: rgba(0,174,236,0.15); color: rgb(0,174,236); cursor: pointer;
            white-space: nowrap; flex-shrink: 0; transition: all 0.2s ease;
        }
        #${quickBlockId} .qb-quick-btn:hover:not(:disabled) { background: rgb(0,174,236); color: white; }
        #${quickBlockId} .qb-quick-btn:disabled { background: rgba(60,60,60,0.4); color: rgb(120,120,120); cursor: default; }
    `;

    const style = document.createElement("style");
    style.id = "bbvtQuickBlockStyles";
    style.textContent = css;
    document.head.appendChild(style);
}

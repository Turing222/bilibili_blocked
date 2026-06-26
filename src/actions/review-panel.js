import {
    appendWhitelistUp,
    appendWhitelistBv,
    disableFeatureRuleSwitch,
    removeConfigArrayItem,
} from "../settings/mutations.js";
import {
    formatFeatureRuleSummary,
    getFeatureRuleMetadata,
    getListRuleChipLabel,
    partitionReviewReasons,
} from "../settings/rule-metadata.js";
import { isMasterSwitchEnabled } from "../utils/script-enabled.js";
import { setButtonIcon } from "../ui/icons.js";

const reviewPanelId = "bbvtReviewPanel";

export function hideHoverReviewPanel() {
    const existing = document.getElementById(reviewPanelId);
    if (existing) {
        if (existing._restoreOverlay) {
            existing._restoreOverlay();
        }
        existing.remove();
    }
}

export function showHoverReviewPanel(context, videoBv, videoElement, restoreOverlay, mouseX = 0, mouseY = 0) {
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

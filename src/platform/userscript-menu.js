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

import { openStatsPanel } from "../ui/stats-panel.js";
import { setButtonIcon } from "../ui/icons.js";
import { appendUnique, removeItems } from "../settings/mutations.js";
import { safeRegexTest } from "../utils/regex.js";
import {
    CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS,
    getContextMenuScriptModifierHint,
} from "../utils/context-menu-modifier.js";

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
];

export function registerUserscriptMenu(context) {
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

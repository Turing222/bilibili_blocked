// == 规则元数据 ==============================================================
//
// 将拦截原因 type 映射到设置项，供追溯面板展示阈值/开关规则并关闭全局规则。

export const featureRuleMetadataByType = {
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
};

export function getFeatureRuleMetadata(reasonType) {
    return featureRuleMetadataByType[String(reasonType || "")] || null;
}

export function isListRule(reason) {
    return Boolean(reason?.canRemoveConfig && reason.configKey && reason.configValue);
}

export function isFeatureRule(reason) {
    return !isListRule(reason) && Boolean(getFeatureRuleMetadata(reason?.type));
}

export function partitionReviewReasons(reasons) {
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
}

export function getListRuleChipLabel(reason, settings = {}) {
    if (settings.hideBlockedWordsInMenu_Switch) {
        return reason.type || "屏蔽规则";
    }

    return reason.configValue || reason.displayText || reason.type || "屏蔽规则";
}

export function formatFeatureRuleSummary(reason, settings, metadata = getFeatureRuleMetadata(reason?.type)) {
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

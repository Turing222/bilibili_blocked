// == 设置变更动作 ============================================================
//
// 职责：
// - 后续集中管理对屏蔽配置的追加、去重、保存。
// - 给“一键屏蔽”等用户动作提供统一入口。
//
// 当前阶段：
// - 只固定函数名。
// - 不修改 settingsStore。

export function appendBlockedTitles(settingsStore, titles) {
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

export function appendBlockedTitle(settingsStore, title) {
    return appendBlockedTitles(settingsStore, [title]);
}

export function appendBlockedUp(settingsStore, upUid) {
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

export function appendBlockedTags(settingsStore, tags) {
    const settings = settingsStore.exportSettings();
    settings.blockedTag_Switch = true;
    settings.blockedTag_Array = appendUnique(settings.blockedTag_Array, tags);
    return settingsStore.saveSettings(settings);
}

export function appendBlockedPartition(settingsStore, partition) {
    const settings = settingsStore.exportSettings();
    settings.blockedVideoPartitions_Switch = true;
    settings.blockedVideoPartitions_Array = appendUnique(settings.blockedVideoPartitions_Array, [partition]);
    return settingsStore.saveSettings(settings);
}

export function appendBlockedCommentTexts(settingsStore, texts) {
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

export function appendBlockedCommentText(settingsStore, text) {
    return appendBlockedCommentTexts(settingsStore, [text]);
}

export function appendBlockedCommentUser(settingsStore, user) {
    const settings = settingsStore.exportSettings();
    settings.blockedCommentUser_Switch = true;
    settings.blockedCommentUser_Array = appendUnique(settings.blockedCommentUser_Array, [user]);
    return settingsStore.saveSettings(settings);
}

export function removeConfigArrayItem(settingsStore, arrayKey, value) {
    const settings = settingsStore.exportSettings();
    if (!Array.isArray(settings[arrayKey])) {
        return settingsStore.saveSettings(settings);
    }

    settings[arrayKey] = removeItems(settings[arrayKey], [value]);
    return settingsStore.saveSettings(settings);
}

export function disableFeatureRuleSwitch(settingsStore, switchKey) {
    const settings = settingsStore.exportSettings();
    if (switchKey) {
        settings[switchKey] = false;
    }
    return settingsStore.saveSettings(settings);
}

export function appendUnique(currentItems, nextItems) {
    return [...new Set([...(currentItems || []), ...nextItems.filter(Boolean).map(String)])];
}

export function removeItems(currentItems, itemsToRemove) {
    const removeSet = new Set((itemsToRemove || []).filter(Boolean).map(String));
    return (currentItems || []).filter((item) => !removeSet.has(String(item)));
}

function escapeRegexLiteral(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function appendWhitelistUp(settingsStore, upUid) {
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

export function appendWhitelistBv(settingsStore, bv) {
    const settings = settingsStore.exportSettings();
    settings.whitelistBv_Switch = true;
    settings.whitelistBv_Array = appendUnique(settings.whitelistBv_Array, [String(bv)]);
    return settingsStore.saveSettings(settings);
}

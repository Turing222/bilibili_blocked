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

import { defaultSettings } from "./defaults.js";
import { normalizeContextMenuScriptModifier } from "../utils/context-menu-modifier.js";
import { featureRuleMetadataByType } from "./rule-metadata.js";

const storageKey = "GM_blockedParameter";

const numericSettingKeys = Object.values(featureRuleMetadataByType)
    .filter((metadata) => metadata.kind === "number" && metadata.valueKey)
    .map((metadata) => metadata.valueKey);

export function createSettingsStore() {
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

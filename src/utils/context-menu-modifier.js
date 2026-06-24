export const CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS = [
    { value: "none", label: "绑定右键", hint: "普通右键打开脚本菜单" },
    { value: "shift", label: "Shift", hint: "只有 Shift + 右键打开脚本菜单" },
    { value: "ctrl", label: "Ctrl", hint: "只有 Ctrl + 右键打开脚本菜单" },
    { value: "alt", label: "Alt", hint: "只有 Alt + 右键打开脚本菜单" },
];

const VALID_MODIFIERS = new Set(CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS.map((option) => option.value));

export function normalizeContextMenuScriptModifier(value) {
    return VALID_MODIFIERS.has(value) ? value : "none";
}

export function shouldOpenScriptContextMenu(event, modifierSetting) {
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
}

export function getContextMenuScriptModifierHint(modifierSetting) {
    const modifier = normalizeContextMenuScriptModifier(modifierSetting);
    return CONTEXT_MENU_SCRIPT_MODIFIER_OPTIONS.find((option) => option.value === modifier)?.hint || "";
}

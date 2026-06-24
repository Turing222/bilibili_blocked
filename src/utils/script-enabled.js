export function isMasterSwitchEnabled(context) {
    const settings = context?.settingsStore?.getSettings?.();
    return settings?.scriptEnabled_Switch !== false;
}

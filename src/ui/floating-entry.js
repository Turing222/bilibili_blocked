const floatingEntryId = "bbvtFloatingEntry";
const storagePosKey = "bbvtFloatingPos";
const visibleSettingKey = "floatingEntryVisible_Switch";
const scriptEnabledSettingKey = "scriptEnabled_Switch";

export function mountFloatingEntry(context) {
    if (!context.floatingEntry?.mount) {
        context.floatingEntry = createFloatingEntryController(context);
    }

    context.floatingEntry.mount();
}

function createFloatingEntryController(context) {
    let container = null;
    let mainBtn = null;
    let settingsBtn = null;
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
            const rect = container.getBoundingClientRect();
            const snapLeft = rect.left + 22 < window.innerWidth / 2 ? 0 : window.innerWidth - 44;
            container.style.transition = "left 0.35s ease";
            container.style.left = snapLeft + "px";
            if (typeof GM_setValue === "function") {
                GM_setValue(storagePosKey, { left: snapLeft, top: parseInt(container.style.top) });
            }
            hideTimer = setTimeout(() => container.classList.add("bbvt-fe-hidden"), 5000);
        }, 2000);
    }

    function createEntryDom() {
        container = document.createElement("div");
        container.id = floatingEntryId;

        settingsBtn = document.createElement("button");
        settingsBtn.className = "bbvt-fe-settings";
        settingsBtn.type = "button";
        settingsBtn.title = "打开 Bilibili 屏蔽参数面板";
        settingsBtn.textContent = "设";
        settingsBtn.setAttribute("aria-label", "打开设置");

        mainBtn = document.createElement("button");
        mainBtn.className = "bbvt-fe-main";
        mainBtn.type = "button";
        mainBtn.title = "切换 Bilibili 屏蔽总开关";
        mainBtn.textContent = "屏";

        const badge = document.createElement("div");
        badge.className = "bbvt-fe-badge";
        badge.style.display = "none";

        const closeBtn = document.createElement("button");
        closeBtn.className = "bbvt-fe-close";
        closeBtn.type = "button";
        closeBtn.title = "隐藏浮窗，可在设置面板恢复";
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", () => hide());

        container.append(settingsBtn, mainBtn, badge, closeBtn);
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

        if (lastStats.rate >= 0.5 && lastStats.total >= 5) {
            const text = Math.round(lastStats.rate * 100) + "%";
            if (mainBtn.textContent !== text) {
                container.classList.add("bbvt-fe-warning");
                mainBtn.textContent = text;
                mainBtn.style.fontSize = "12px";
            }
            return;
        }

        if (mainBtn.textContent !== "屏") {
            container.classList.remove("bbvt-fe-warning");
            mainBtn.textContent = "屏";
            mainBtn.style.fontSize = "15px";
        }
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
            mainBtn.textContent = "关";
            mainBtn.style.fontSize = "15px";
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

function injectFloatingEntryStyles() {
    const css = `
        #${floatingEntryId} {
            position: fixed;
            top: 92px;
            right: -38px;
            z-index: 2147483646;
            width: 44px;
            height: 44px;
            cursor: grab;
            user-select: none;
            transition: right 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            overflow: visible;
        }

        #${floatingEntryId}:not(.bbvt-fe-custom):hover {
            right: 18px;
        }

        #${floatingEntryId}:active {
            cursor: grabbing;
        }

        #${floatingEntryId}.bbvt-fe-custom {
            right: auto;
            transition: opacity 0.3s ease;
        }

        #${floatingEntryId}.bbvt-fe-hidden {
            opacity: 0.15;
            transition: opacity 0.5s ease;
        }

        #${floatingEntryId} .bbvt-fe-settings {
            position: absolute;
            top: -16px;
            left: 50%;
            transform: translateX(-50%);
            width: 22px;
            height: 22px;
            border: 0;
            border-radius: 50%;
            background: rgba(50, 50, 50, 0.92);
            color: #eee;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
            font-size: 11px;
            font-weight: 700;
            line-height: 22px;
            text-align: center;
            cursor: pointer;
            padding: 0;
            z-index: 2;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        #${floatingEntryId} .bbvt-fe-settings:hover {
            transform: translateX(-50%) scale(1.1);
            background: rgba(70, 70, 70, 0.95);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
        }

        #${floatingEntryId} .bbvt-fe-settings:active {
            transform: translateX(-50%) scale(0.95);
        }

        #${floatingEntryId} .bbvt-fe-main {
            position: absolute;
            inset: 0;
            width: 44px;
            height: 44px;
            border: 0;
            border-radius: 50%;
            background: linear-gradient(135deg, rgb(0, 190, 255), rgb(0, 160, 214));
            color: white;
            box-shadow: 0 4px 12px rgba(0, 174, 236, 0.4), 0 8px 24px rgba(0, 0, 0, 0.2);
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
        }

        #${floatingEntryId} .bbvt-fe-main:hover {
            transform: scale(1.08);
            box-shadow: 0 6px 16px rgba(0, 174, 236, 0.5), 0 12px 32px rgba(0, 0, 0, 0.25);
        }

        #${floatingEntryId} .bbvt-fe-main:active {
            transform: scale(0.95);
        }

        #${floatingEntryId}.bbvt-fe-disabled .bbvt-fe-main {
            background: linear-gradient(135deg, rgb(130, 130, 130), rgb(90, 90, 90));
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            animation: none;
        }

        #${floatingEntryId}.bbvt-fe-disabled:hover .bbvt-fe-main {
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
        }

        #${floatingEntryId}.bbvt-fe-warning .bbvt-fe-main {
            background: linear-gradient(135deg, rgb(255, 120, 60), rgb(220, 60, 20));
            box-shadow: 0 4px 12px rgba(255, 100, 50, 0.4), 0 8px 24px rgba(0, 0, 0, 0.2);
            animation: fePulseWarning 2s infinite cubic-bezier(0.66, 0, 0, 1);
        }

        #${floatingEntryId}.bbvt-fe-warning:hover .bbvt-fe-main {
            box-shadow: 0 6px 16px rgba(255, 100, 50, 0.6), 0 12px 32px rgba(0, 0, 0, 0.3);
        }

        @keyframes fePulseWarning {
            0% { box-shadow: 0 0 0 0 rgba(255, 100, 50, 0.5); }
            70% { box-shadow: 0 0 0 12px rgba(255, 100, 50, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 100, 50, 0); }
        }

        #${floatingEntryId} .bbvt-fe-close {
            position: absolute;
            top: -4px;
            right: -4px;
            width: 20px;
            height: 20px;
            border: 0;
            border-radius: 50%;
            background: rgba(40, 40, 40, 0.9);
            color: #ccc;
            font-size: 14px;
            line-height: 20px;
            text-align: center;
            padding: 0;
            cursor: pointer;
            opacity: 0;
            transform: scale(0.8);
            pointer-events: none;
            transition: all 0.2s ease;
            z-index: 1;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }

        #${floatingEntryId}:hover .bbvt-fe-close {
            opacity: 1;
            transform: scale(1);
            pointer-events: auto;
        }

        #${floatingEntryId} .bbvt-fe-close:hover {
            background: rgba(255, 60, 60, 0.9);
            color: white;
            transform: scale(1.15);
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

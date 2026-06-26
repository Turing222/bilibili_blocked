import { setButtonIcon } from "./icons.js";

const floatingEntryId = "bbvtFloatingEntry";
const storagePosKey = "bbvtFloatingPos";
const visibleSettingKey = "floatingEntryVisible_Switch";
const scriptEnabledSettingKey = "scriptEnabled_Switch";
const floatingEntryPeekWidth = 18;

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
    let mainLabel = null;
    let mainStat = null;
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
            mainLabel = existing.querySelector(".bbvt-fe-label");
            mainStat = existing.querySelector(".bbvt-fe-stat");
            syncViewportMetrics();
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
            syncViewportMetrics();
            const rect = container.getBoundingClientRect();
            const entryWidth = rect.width || 96;
            const viewportWidth = getViewportWidth();
            const side = rect.left + entryWidth / 2 < viewportWidth / 2 ? "left" : "right";
            const snapLeft = side === "left" ? 0 : viewportWidth - entryWidth;
            setDockSide(side);
            container.style.transition = "left 0.35s ease";
            container.style.left = snapLeft + "px";
            if (typeof GM_setValue === "function") {
                GM_setValue(storagePosKey, { left: snapLeft, top: parseInt(container.style.top), side });
            }
            hideTimer = setTimeout(() => container.classList.add("bbvt-fe-hidden"), 5000);
        }, 2000);
    }

    function createEntryDom() {
        container = document.createElement("div");
        container.id = floatingEntryId;
        setDockSide("right");
        syncViewportMetrics();

        settingsBtn = document.createElement("button");
        settingsBtn.className = "bbvt-fe-settings";
        settingsBtn.type = "button";
        settingsBtn.title = "打开 Bilibili 屏蔽参数面板";
        settingsBtn.setAttribute("aria-label", "打开设置");
        setButtonIcon(settingsBtn, "settings", "打开设置");

        mainBtn = document.createElement("button");
        mainBtn.className = "bbvt-fe-main";
        mainBtn.type = "button";
        mainBtn.title = "切换 Bilibili 屏蔽总开关";
        setButtonIcon(mainBtn, "shield", "切换 Bilibili 屏蔽总开关");
        mainLabel = document.createElement("span");
        mainLabel.className = "bbvt-fe-label";
        mainStat = document.createElement("span");
        mainStat.className = "bbvt-fe-stat";
        mainBtn.append(mainLabel, mainStat);

        const closeBtn = document.createElement("button");
        closeBtn.className = "bbvt-fe-close";
        closeBtn.type = "button";
        closeBtn.title = "隐藏浮窗，可在设置面板恢复";
        setButtonIcon(closeBtn, "close", "隐藏浮窗");
        closeBtn.addEventListener("click", () => hide());

        container.append(settingsBtn, mainBtn, closeBtn);
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
        setDockSide(savedPos.side || getDockSideFromLeft(Number(savedPos.left) || 0));
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
        syncViewportMetrics();
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

        const hasStats = Number(lastStats.total) > 0;
        const blocked = Math.max(0, Number(lastStats.blocked) || 0);
        const total = Math.max(0, Number(lastStats.total) || 0);
        const statText = hasStats ? `${blocked}/${total}` : "就绪";

        if (lastStats.rate >= 0.5 && total >= 5) {
            container.classList.add("bbvt-fe-warning");
            updateMainContent("屏", statText);
            return;
        }

        container.classList.remove("bbvt-fe-warning");
        updateMainContent("屏", statText);
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
            updateMainContent("关", "暂停");
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

    function updateMainContent(label, stat) {
        if (mainLabel) {
            mainLabel.textContent = label;
        }
        if (mainStat) {
            mainStat.textContent = stat;
        }
    }

    function setDockSide(side) {
        if (!container) {
            return;
        }

        const normalizedSide = side === "left" ? "left" : "right";
        container.classList.toggle("bbvt-fe-side-left", normalizedSide === "left");
        container.classList.toggle("bbvt-fe-side-right", normalizedSide === "right");
    }

    function getDockSideFromLeft(left) {
        const viewportWidth = getViewportWidth();
        const entryWidth = container?.getBoundingClientRect?.().width || 96;
        return left + entryWidth / 2 < viewportWidth / 2 ? "left" : "right";
    }

    function syncViewportMetrics() {
        if (!container?.style?.setProperty) {
            return;
        }

        container.style.setProperty("--bbvt-fe-peek-width", `${floatingEntryPeekWidth}px`);
        container.style.setProperty("--bbvt-fe-scrollbar-width", `${getScrollbarWidth()}px`);
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

function getViewportWidth() {
    return document.documentElement?.clientWidth || window.innerWidth || 1280;
}

function getScrollbarWidth() {
    const innerWidth = window.innerWidth || getViewportWidth();
    return Math.max(0, innerWidth - getViewportWidth());
}

function injectFloatingEntryStyles() {
    const css = `
        #${floatingEntryId} {
            position: fixed;
            top: 92px;
            right: calc(-96px + var(--bbvt-fe-peek-width, 18px) + var(--bbvt-fe-scrollbar-width, 0px));
            z-index: 2147483646;
            width: 96px;
            height: 36px;
            cursor: grab;
            user-select: none;
            transition: right 0.24s ease, opacity 0.24s ease, transform 0.24s ease;
            overflow: visible;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        }

        #${floatingEntryId}::before {
            content: "";
            position: absolute;
            top: -8px;
            bottom: -8px;
            z-index: 0;
        }

        #${floatingEntryId}.bbvt-fe-side-right::before {
            left: -74px;
            right: 0;
        }

        #${floatingEntryId}.bbvt-fe-side-left::before {
            left: 0;
            right: -74px;
        }

        #${floatingEntryId}:not(.bbvt-fe-custom):hover {
            right: 18px;
        }

        #${floatingEntryId}:active {
            cursor: grabbing;
        }

        #${floatingEntryId}.bbvt-fe-custom {
            right: auto;
            transition: opacity 0.24s ease, transform 0.24s ease;
        }

        #${floatingEntryId}.bbvt-fe-hidden {
            opacity: 0.92;
        }

        #${floatingEntryId}.bbvt-fe-hidden.bbvt-fe-side-left {
            transform: translateX(calc(-100% + var(--bbvt-fe-peek-width, 18px)));
        }

        #${floatingEntryId}.bbvt-fe-hidden.bbvt-fe-side-right {
            transform: translateX(calc(100% - var(--bbvt-fe-peek-width, 18px)));
        }

        #${floatingEntryId} .bbvt-fe-settings,
        #${floatingEntryId} .bbvt-fe-close {
            position: absolute;
            top: 4px;
            width: 28px;
            height: 28px;
            border: 0;
            border-radius: 50%;
            background: rgba(22, 25, 30, 0.94);
            color: rgb(232, 238, 243);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
            text-align: center;
            cursor: pointer;
            padding: 0;
            z-index: 3;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
            transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease, color 0.18s ease;
        }

        #${floatingEntryId} .bbvt-fe-close {
            top: -2px;
            width: 22px;
            height: 22px;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);
        }

        #${floatingEntryId}.bbvt-fe-side-right .bbvt-fe-settings {
            left: -34px;
            right: auto;
            transform: translateX(12px) scale(0.9);
        }

        #${floatingEntryId}.bbvt-fe-side-right .bbvt-fe-close {
            left: -58px;
            right: auto;
            transform: translateX(22px) scale(0.9);
        }

        #${floatingEntryId}.bbvt-fe-side-left .bbvt-fe-settings {
            left: auto;
            right: -34px;
            transform: translateX(-12px) scale(0.9);
        }

        #${floatingEntryId}.bbvt-fe-side-left .bbvt-fe-close {
            left: auto;
            right: -58px;
            transform: translateX(-22px) scale(0.9);
        }

        #${floatingEntryId}:hover .bbvt-fe-settings,
        #${floatingEntryId}:hover .bbvt-fe-close {
            opacity: 1;
            pointer-events: auto;
            transform: translateX(0) scale(1);
        }

        #${floatingEntryId} .bbvt-fe-settings:hover {
            background: rgba(42, 48, 57, 0.98);
            color: rgb(125, 224, 242);
        }

        #${floatingEntryId} .bbvt-fe-close:hover {
            background: rgba(232, 93, 93, 0.95);
            color: white;
        }

        #${floatingEntryId} .bbvt-fe-main {
            position: absolute;
            inset: 0;
            z-index: 2;
            width: 96px;
            height: 36px;
            border: 1px solid rgba(18, 183, 219, 0.32);
            border-radius: 999px;
            background: rgba(22, 25, 30, 0.92);
            color: rgb(239, 244, 248);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            padding: 0 11px;
            display: grid;
            grid-template-columns: 14px auto minmax(32px, 1fr);
            align-items: center;
            gap: 7px;
            transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }

        #${floatingEntryId} .bbvt-fe-main:hover {
            transform: translateY(-1px);
            border-color: rgba(18, 183, 219, 0.58);
            background: rgba(27, 31, 37, 0.96);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3), 0 0 0 3px rgba(18, 183, 219, 0.08);
        }

        #${floatingEntryId} .bbvt-fe-main:active {
            transform: translateY(0);
        }

        #${floatingEntryId} .bbvt-fe-label {
            min-width: 0;
            line-height: 1;
            letter-spacing: 0;
        }

        #${floatingEntryId} .bbvt-fe-stat {
            min-width: 0;
            justify-self: end;
            max-width: 42px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 2px 6px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            color: rgb(142, 154, 168);
            font-size: 11px;
            font-weight: 600;
            line-height: 1.25;
        }

        #${floatingEntryId}.bbvt-fe-disabled .bbvt-fe-main {
            border-color: rgba(15, 23, 42, 0.16);
            background: rgba(246, 248, 251, 0.94);
            color: rgb(45, 55, 72);
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
        }

        #${floatingEntryId}.bbvt-fe-disabled .bbvt-fe-stat {
            background: rgba(15, 23, 42, 0.08);
            color: rgb(84, 96, 112);
        }

        #${floatingEntryId}.bbvt-fe-warning .bbvt-fe-main {
            border-color: rgba(245, 158, 11, 0.62);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), 0 0 0 3px rgba(245, 158, 11, 0.08);
        }

        #${floatingEntryId}.bbvt-fe-warning .bbvt-fe-main::after {
            content: "";
            position: absolute;
            right: 8px;
            top: 7px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: rgb(245, 158, 11);
            box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.14);
        }

        #${floatingEntryId} .bbvt-icon {
            width: 13px;
            height: 13px;
            flex: 0 0 auto;
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

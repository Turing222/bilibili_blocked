import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { mountFloatingEntry } from "../src/ui/floating-entry.js";

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.style = {};
        this.dataset = {};
        this.listeners = new Map();
        this.hidden = false;
        this.id = "";
        this.className = "";
        this.textContent = "";
        this.type = "";
        this.title = "";
    }

    append(...nodes) {
        nodes.forEach((node) => this.appendChild(node));
    }

    appendChild(node) {
        node.parentNode = this;
        this.children.push(node);
        return node;
    }

    remove() {
        if (!this.parentNode) {
            return;
        }

        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        if (!selector.startsWith(".")) {
            return [];
        }

        const className = selector.slice(1);
        const results = [];
        collectElements(this, (element) => {
            if (hasClass(element, className)) {
                results.push(element);
            }
        });
        return results;
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    dispatchEvent(type, event = {}) {
        const handlers = this.listeners.get(type) || [];
        handlers.forEach((handler) => handler(event));
    }

    setAttribute(name, value) {
        this[name] = value;
    }

    getBoundingClientRect() {
        return { left: 0, top: 0, width: 44, height: 44 };
    }

    get classList() {
        return {
            add: (className) => {
                if (!hasClass(this, className)) {
                    this.className = `${this.className} ${className}`.trim();
                }
            },
            remove: (className) => {
                this.className = this.className
                    .split(/\s+/)
                    .filter((item) => item && item !== className)
                    .join(" ");
            },
            toggle: (className, force) => {
                const shouldAdd = force ?? !hasClass(this, className);
                if (shouldAdd) {
                    this.classList.add(className);
                } else {
                    this.classList.remove(className);
                }
            },
            contains: (className) => hasClass(this, className),
        };
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement("body");
        this.head = new FakeElement("head");
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    getElementById(id) {
        let matched = null;
        collectElements(this.body, (element) => {
            if (!matched && element.id === id) {
                matched = element;
            }
        });
        return matched;
    }
}

function collectElements(root, visit) {
    visit(root);
    root.children.forEach((child) => collectElements(child, visit));
}

function hasClass(element, className) {
    return element.className.split(/\s+/).includes(className);
}

function createFloatingEntryContext(initialSettings = {}) {
    let settings = {
        scriptEnabled_Switch: true,
        floatingEntryVisible_Switch: true,
        ...initialSettings,
    };
    const calls = {
        clearEffects: 0,
        refreshes: [],
    };

    return {
        calls,
        settingsStore: {
            getSettings: () => settings,
            exportSettings: () => JSON.parse(JSON.stringify(settings)),
            saveSettings(nextSettings) {
                settings = JSON.parse(JSON.stringify(nextSettings));
                return settings;
            },
        },
        clearScriptEffects: () => {
            calls.clearEffects++;
        },
        refresh: (options) => {
            calls.refreshes.push(options);
        },
        openSettingsPanel: () => {},
    };
}

function setupDom() {
    globalThis.document = new FakeDocument();
    globalThis.window = {
        innerWidth: 1280,
        addEventListener: () => {},
    };
    globalThis.GM_addStyle = () => {};
}

afterEach(() => {
    mock.timers.reset();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.GM_addStyle;
});

describe("floating entry script toggle", () => {
    it("toggles the script switch and refreshes from the main floating button", () => {
        setupDom();
        const context = createFloatingEntryContext();

        mountFloatingEntry(context);
        const mainButton = globalThis.document.getElementById("bbvtFloatingEntry").querySelector(".bbvt-fe-main");

        mainButton.dispatchEvent("click");

        assert.equal(context.settingsStore.getSettings().scriptEnabled_Switch, false);
        assert.equal(context.calls.clearEffects, 1);
        assert.deepEqual(context.calls.refreshes, [{ reevaluate: true }]);
        assert.equal(mainButton.querySelector(".bbvt-fe-label").textContent, "\u5173");
        assert.equal(mainButton.querySelector(".bbvt-fe-stat").textContent, "\u6682\u505c");

        mainButton.dispatchEvent("click");

        assert.equal(context.settingsStore.getSettings().scriptEnabled_Switch, true);
        assert.equal(context.calls.clearEffects, 1);
        assert.deepEqual(context.calls.refreshes, [{ reevaluate: true }, { reevaluate: true }]);
        assert.equal(mainButton.querySelector(".bbvt-fe-label").textContent, "\u5c4f");
        assert.equal(mainButton.querySelector(".bbvt-fe-stat").textContent, "\u5c31\u7eea");
    });

    it("replaces stale floating DOM so the current toggle handler is bound", () => {
        setupDom();
        const staleContainer = globalThis.document.createElement("div");
        staleContainer.id = "bbvtFloatingEntry";

        const staleSettingsButton = globalThis.document.createElement("button");
        staleSettingsButton.className = "bbvt-fe-settings";
        const staleMainButton = globalThis.document.createElement("button");
        staleMainButton.className = "bbvt-fe-main";
        staleContainer.append(staleSettingsButton, staleMainButton);
        globalThis.document.body.appendChild(staleContainer);

        const context = createFloatingEntryContext();
        mountFloatingEntry(context);

        const mountedContainer = globalThis.document.getElementById("bbvtFloatingEntry");
        const mainButton = mountedContainer.querySelector(".bbvt-fe-main");
        mainButton.dispatchEvent("click");

        assert.notEqual(mountedContainer, staleContainer);
        assert.equal(staleContainer.parentNode, null);
        assert.equal(context.settingsStore.getSettings().scriptEnabled_Switch, false);
        assert.equal(context.calls.clearEffects, 1);
    });

    it("toggles video and comment display modes from the floating quick panel", () => {
        setupDom();
        const context = createFloatingEntryContext({
            hideVideoMode_Switch: false,
            hideCommentMode_Switch: true,
        });

        mountFloatingEntry(context);
        const container = globalThis.document.getElementById("bbvtFloatingEntry");
        const modeButton = container.querySelector(".bbvt-fe-mode");
        const modePanel = container.querySelector(".bbvt-fe-mode-panel");

        assert.equal(modePanel.hidden, true);
        modeButton.dispatchEvent("click", { stopPropagation() {} });
        assert.equal(modePanel.hidden, false);

        const choices = modePanel.querySelectorAll(".bbvt-fe-mode-choice");
        const videoHideButton = choices.find((button) =>
            button.dataset.modeKey === "hideVideoMode_Switch" && button.dataset.modeValue === "hide"
        );
        const commentOverlayButton = choices.find((button) =>
            button.dataset.modeKey === "hideCommentMode_Switch" && button.dataset.modeValue === "overlay"
        );

        videoHideButton.dispatchEvent("click", { stopPropagation() {} });
        commentOverlayButton.dispatchEvent("click", { stopPropagation() {} });

        assert.equal(context.settingsStore.getSettings().hideVideoMode_Switch, true);
        assert.equal(context.settingsStore.getSettings().hideCommentMode_Switch, false);
        assert.deepEqual(context.calls.refreshes, [{ reevaluate: true }, { reevaluate: true }]);

        modeButton.dispatchEvent("click", { stopPropagation() {} });
    });

    it("auto hides the floating mode panel after the pointer leaves it", () => {
        mock.timers.enable({ apis: ["setTimeout"] });
        setupDom();
        const context = createFloatingEntryContext();

        mountFloatingEntry(context);
        const container = globalThis.document.getElementById("bbvtFloatingEntry");
        const modeButton = container.querySelector(".bbvt-fe-mode");
        const modePanel = container.querySelector(".bbvt-fe-mode-panel");

        modeButton.dispatchEvent("click", { stopPropagation() {} });
        assert.equal(modePanel.hidden, false);

        mock.timers.tick(4999);
        assert.equal(modePanel.hidden, false);

        mock.timers.tick(1);
        assert.equal(modePanel.hidden, true);

        modeButton.dispatchEvent("click", { stopPropagation() {} });
        modePanel.dispatchEvent("mouseenter");
        mock.timers.tick(5000);
        assert.equal(modePanel.hidden, false);

        modePanel.dispatchEvent("mouseleave");
        mock.timers.tick(5000);
        assert.equal(modePanel.hidden, true);
    });

    it("keeps the mode panel open when the script is disabled and stats refresh", () => {
        setupDom();
        const context = createFloatingEntryContext();

        mountFloatingEntry(context);
        const container = globalThis.document.getElementById("bbvtFloatingEntry");
        const mainButton = container.querySelector(".bbvt-fe-main");
        const modeButton = container.querySelector(".bbvt-fe-mode");
        const modePanel = container.querySelector(".bbvt-fe-mode-panel");

        mainButton.dispatchEvent("click");
        assert.equal(context.settingsStore.getSettings().scriptEnabled_Switch, false);

        modeButton.dispatchEvent("click", { stopPropagation() {} });
        assert.equal(modePanel.hidden, false);

        context.floatingEntry.updateStats(12, 5, 0.42);
        assert.equal(modePanel.hidden, false);
    });
});

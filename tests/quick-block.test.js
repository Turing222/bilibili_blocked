import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { quickBlockVideo } from "../src/actions/quick-block.js";

afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
});

describe("quick block popup", () => {
    it("keeps title keywords separate from the full title action", () => {
        setupDom();

        let savedSettings = {
            scriptEnabled_Switch: true,
            blockedTitle_UseRegular: false,
            blockedTitle_Array: [],
        };
        const refreshes = [];
        const context = {
            settingsStore: {
                getSettings: () => savedSettings,
                exportSettings: () => ({ ...savedSettings }),
                saveSettings(nextSettings) {
                    savedSettings = { ...nextSettings };
                    return savedSettings;
                },
            },
            videoStore: {
                getVideoInfo: () => ({
                    videoTitle: "完整标题 测试",
                    videoUpUid: "123",
                    videoUpName: "Creator",
                }),
            },
            apiClient: {
                ensurePartitionData: () => Promise.resolve({ name: "Music", id: "3" }),
                ensureTagsData: () => Promise.resolve(["tag-a", "tag-b"]),
            },
            refresh: (options) => refreshes.push(options),
        };

        const videoElement = document.createElement("div");

        quickBlockVideo(context, "BV1test", videoElement, 100, 120);
        const overlay = document.getElementById("bbvtQuickBlock");
        const inputs = overlay.querySelectorAll(".qb-input");
        const titleInput = inputs[1];
        const titleButton = overlay.querySelectorAll(".qb-quick-btn")
            .find((button) => button.title === "屏蔽标题关键词");
        const fullTitleButton = overlay.querySelectorAll(".qb-quick-btn")
            .find((button) => button.title === "屏蔽完整标题");

        assert.equal(titleInput.value, "");
        assert.equal(titleButton.disabled, true);
        assert.equal(fullTitleButton.disabled, false);

        fullTitleButton.dispatchEvent("click");

        assert.deepEqual(savedSettings.blockedTitle_Array, ["完整标题 测试"]);
        assert.deepEqual(refreshes, [{ reevaluate: true }]);
    });

    it("does not restart the enter animation when async data refreshes the popup", async () => {
        setupDom();

        const context = {
            settingsStore: {
                getSettings: () => ({ scriptEnabled_Switch: true }),
            },
            videoStore: {
                getVideoInfo: () => ({
                    videoTitle: "Sample video title",
                    videoUpUid: "123",
                    videoUpName: "Creator",
                }),
            },
            apiClient: {
                ensurePartitionData: () => Promise.resolve({ name: "Music", id: "3" }),
                ensureTagsData: () => Promise.resolve(["tag-a", "tag-b"]),
            },
        };

        const videoElement = document.createElement("div");

        quickBlockVideo(context, "BV1test", videoElement, 100, 120);
        const overlay = document.getElementById("bbvtQuickBlock");

        assert.ok(overlay);
        assert.deepEqual(overlay.animationAssignments, [
            "none",
            "qbFadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        ]);

        const initialPanel = overlay._qbRefs?.panel;
        assert.ok(initialPanel);

        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(overlay._qbRefs?.panel, initialPanel);
        assert.deepEqual(overlay.animationAssignments, [
            "none",
            "qbFadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        ]);
    });
});

function setupDom() {
    const body = new FakeElement("body");
    const head = new FakeElement("head");
    const documentListeners = new Map();

    globalThis.document = {
        body,
        head,
        createElement: (tagName) => new FakeElement(tagName),
        getElementById(id) {
            return findElement(body, (element) => element.id === id) ||
                findElement(head, (element) => element.id === id) ||
                null;
        },
        addEventListener(type, handler) {
            documentListeners.set(type, handler);
        },
        removeEventListener(type, handler) {
            if (documentListeners.get(type) === handler) {
                documentListeners.delete(type);
            }
        },
    };

    globalThis.window = {
        innerWidth: 1280,
        innerHeight: 800,
        bbvtQuickBlockCloseHandler: null,
    };
}

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName || "").toUpperCase();
        this.id = "";
        this.className = "";
        this.textContent = "";
        this.title = "";
        this.type = "";
        this.value = "";
        this.placeholder = "";
        this.disabled = false;
        this.parentNode = null;
        this.children = [];
        this.childNodes = this.children;
        this.listeners = new Map();
        this.animationAssignments = [];
        this.style = createStyle(this);
        this.classList = {
            add: (name) => {
                const names = new Set(this.className.split(/\s+/).filter(Boolean));
                names.add(name);
                this.className = [...names].join(" ");
            },
            remove: (name) => {
                this.className = this.className
                    .split(/\s+/)
                    .filter((item) => item && item !== name)
                    .join(" ");
            },
            contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
        };
    }

    append(...nodes) {
        nodes.forEach((node) => this.appendChild(node));
    }

    appendChild(node) {
        if (node.parentNode) {
            node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
            node.parentNode.childNodes = node.parentNode.children;
        }
        node.parentNode = this;
        this.children.push(node);
        this.childNodes = this.children;
        return node;
    }

    replaceChildren(...nodes) {
        this.children.forEach((child) => {
            child.parentNode = null;
        });
        this.children = [];
        this.childNodes = this.children;
        this.append(...nodes);
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            this.parentNode.childNodes = this.parentNode.children;
        }
        this.parentNode = null;
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

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const results = [];
        collectMatchingElements(this, selector, results);
        return results;
    }

    contains(node) {
        if (node === this) {
            return true;
        }

        return this.children.some((child) => child.contains?.(node));
    }

    getBoundingClientRect() {
        return { left: 0, top: 0, right: 380, bottom: 220, width: 380, height: 220 };
    }

    get offsetWidth() {
        return 380;
    }
}

function collectMatchingElements(root, selector, results) {
    for (const child of root.children || []) {
        if (matchesSelector(child, selector)) {
            results.push(child);
        }
        collectMatchingElements(child, selector, results);
    }
}

function matchesSelector(element, selector) {
    if (selector.startsWith(".")) {
        return element.className.split(/\s+/).filter(Boolean).includes(selector.slice(1));
    }

    return element.tagName.toLowerCase() === selector.toLowerCase();
}

function createStyle(element) {
    const style = {};
    let animation = "";

    Object.defineProperty(style, "animation", {
        get: () => animation,
        set: (value) => {
            animation = value;
            element.animationAssignments.push(value);
        },
        enumerable: true,
    });

    return style;
}

function findElement(root, predicate) {
    if (predicate(root)) {
        return root;
    }

    for (const child of root.children || []) {
        const found = findElement(child, predicate);
        if (found) {
            return found;
        }
    }

    return null;
}

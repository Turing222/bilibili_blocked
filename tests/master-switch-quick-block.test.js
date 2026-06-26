import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { dismissCommentQuickBlockUi, mountCommentQuickBlock } from "../src/actions/comment-quick-block.js";
import { closeQuickBlockOverlay } from "../src/actions/quick-block.js";
import { isMasterSwitchEnabled } from "../src/utils/script-enabled.js";

function createSettingsStore(scriptEnabled = true) {
    return {
        getSettings: () => ({ scriptEnabled_Switch: scriptEnabled }),
    };
}

function setupDom() {
    const nodes = new Map();
    const windowListeners = new Map();

    class DomElement {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.id = "";
            this.hidden = false;
            this.style = { display: "" };
            this.className = "";
            this.textContent = "";
            this.type = "button";
            this.title = "";
            this.value = "";
            this.placeholder = "";
            this.disabled = false;
            this.dataset = {};
            this.parentNode = null;
            this.children = [];
            this.listeners = new Map();
            this.rect = { left: 10, top: 20, width: 300, height: 40, bottom: 60, right: 310 };
        }

        append(...nodesToAppend) {
            nodesToAppend.forEach((node) => this.appendChild(node));
        }

        appendChild(node) {
            node.parentNode = this;
            this.children.push(node);
            if (node.id) {
                nodes.set(node.id, node);
            }
            return node;
        }

        replaceChildren(...nextChildren) {
            this.children.forEach((child) => {
                child.parentNode = null;
            });
            this.children = [];
            nextChildren.forEach((node) => this.appendChild(node));
        }

        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }

        querySelectorAll(selector) {
            const results = [];
            collectMatchingElements(this, selector, results);
            return results;
        }

        remove() {
            if (this.parentNode) {
                this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            }
            if (this.id) {
                nodes.delete(this.id);
            }
            this.parentNode = null;
        }

        addEventListener(type, handler) {
            const handlers = this.listeners.get(type) || [];
            handlers.push(handler);
            this.listeners.set(type, handlers);
        }

        dispatchEvent(type, event = {}) {
            for (const handler of this.listeners.get(type) || []) {
                handler(event);
            }
        }

        setAttribute(name, value) {
            this[name] = value;
        }

        focus() {}

        select() {}

        getBoundingClientRect() {
            return this.rect;
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
                contains: (className) => hasClass(this, className),
            };
        }
    }

    const body = new DomElement("body");
    const head = new DomElement("head");
    body.children = [];
    head.children = [];

    globalThis.document = {
        body,
        head,
        getElementById(id) {
            return nodes.get(id) || null;
        },
        createElement(tagName) {
            return new DomElement(tagName);
        },
        addEventListener() {},
        removeEventListener() {},
    };

    globalThis.window = {
        innerWidth: 1280,
        innerHeight: 800,
        scrollX: 0,
        scrollY: 0,
        getSelection: () => ({ toString: () => "", rangeCount: 0 }),
        addEventListener(type, handler) {
            const handlers = windowListeners.get(type) || [];
            handlers.push(handler);
            windowListeners.set(type, handlers);
        },
        removeEventListener(type, handler) {
            const handlers = windowListeners.get(type) || [];
            windowListeners.set(type, handlers.filter((item) => item !== handler));
        },
        dispatchEvent(event) {
            for (const handler of windowListeners.get(event.type) || []) {
                handler(event);
            }
        },
        bbvtQuickBlockCloseHandler: null,
    };

    return { body, nodes, windowListeners };
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
        return hasClass(element, selector.slice(1));
    }

    return element.tagName.toLowerCase() === selector.toLowerCase();
}

function hasClass(element, className) {
    return element.className.split(/\s+/).filter(Boolean).includes(className);
}

afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
});

describe("isMasterSwitchEnabled", () => {
    it("returns true when the master switch is missing or enabled", () => {
        assert.equal(isMasterSwitchEnabled({ settingsStore: createSettingsStore(true) }), true);
        assert.equal(isMasterSwitchEnabled({ settingsStore: { getSettings: () => ({}) } }), true);
    });

    it("returns false when the master switch is off", () => {
        assert.equal(isMasterSwitchEnabled({ settingsStore: createSettingsStore(false) }), false);
    });
});

describe("master switch quick block UI cleanup", () => {
    it("dismisses the comment quick block trigger and popup", () => {
        setupDom();

        const trigger = document.createElement("button");
        trigger.id = "bbvtCommentQuickBlockTrigger";
        trigger.hidden = false;
        document.body.appendChild(trigger);

        const popup = document.createElement("div");
        popup.id = "bbvtCommentQuickBlockPopup";
        document.body.appendChild(popup);

        dismissCommentQuickBlockUi();

        assert.equal(document.getElementById("bbvtCommentQuickBlockTrigger")?.hidden, true);
        assert.equal(document.getElementById("bbvtCommentQuickBlockPopup"), null);
    });

    it("closes the video quick block overlay", () => {
        setupDom();

        const overlay = document.createElement("div");
        overlay.id = "bbvtQuickBlock";
        document.body.appendChild(overlay);

        let removed = false;
        window.bbvtQuickBlockCloseHandler = () => {
            removed = true;
        };

        closeQuickBlockOverlay();

        assert.equal(document.getElementById("bbvtQuickBlock"), null);
        assert.equal(window.bbvtQuickBlockCloseHandler, null);
        assert.equal(removed, false);
    });
});

describe("comment quick block master switch guard", () => {
    it("does not show the trigger when the master switch is off", () => {
        setupDom();

        const commentElement = document.createElement("div");
        document.body.appendChild(commentElement);

        const context = { settingsStore: createSettingsStore(true) };
        mountCommentQuickBlock(context, commentElement, { text: "测试评论", userId: "1", userName: "用户" });

        window.scrollX = 30;
        window.scrollY = 400;
        commentElement.dispatchEvent("mouseenter");
        const trigger = document.getElementById("bbvtCommentQuickBlockTrigger");
        assert.ok(trigger);
        assert.equal(trigger.hidden, false);
        assert.equal(trigger.style.left, "284px");
        assert.equal(trigger.style.top, "426px");
        assert.equal(commentElement.dataset.bbvtCommentQuickBlockTarget, "true");
        const marker = document.getElementById("bbvtCommentQuickBlockTargetMarker");
        assert.ok(marker);
        assert.equal(marker.style.left, "36px");
        assert.equal(marker.style.top, "418px");
        assert.equal(marker.style.width, "308px");
        assert.equal(marker.style.height, "44px");

        context.settingsStore = createSettingsStore(false);
        commentElement.dispatchEvent("mouseenter");

        assert.equal(document.getElementById("bbvtCommentQuickBlockTrigger")?.hidden, true);
        assert.equal(commentElement.dataset.bbvtCommentQuickBlockTarget, undefined);
        assert.equal(document.getElementById("bbvtCommentQuickBlockTargetMarker"), null);
    });

    it("keeps the comment manual input empty and submits full text from its own button", async () => {
        setupDom();

        let savedSettings = {
            scriptEnabled_Switch: true,
            blockedCommentText_UseRegular: false,
            blockedCommentText_Array: [],
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
            refresh: (options) => refreshes.push(options),
        };
        const commentElement = document.createElement("div");
        document.body.appendChild(commentElement);

        mountCommentQuickBlock(context, commentElement, {
            text: "完整评论广告内容 完整评论广告内容 完整评论广告内容",
            userId: "1",
            userName: "用户",
        });
        commentElement.dispatchEvent("mouseenter");
        const trigger = document.getElementById("bbvtCommentQuickBlockTrigger");
        trigger.onclick({
            preventDefault() {},
            stopPropagation() {},
            clientX: 100,
            clientY: 120,
            target: trigger,
        });

        const popup = document.getElementById("bbvtCommentQuickBlockPopup");
        const input = popup.querySelector(".bbvt-comment-qb-input");
        const confirmButton = popup.querySelectorAll("button")
            .find((button) => button.title === "屏蔽评论内容");
        const fullTextButton = popup.querySelectorAll("button")
            .find((button) => button.title === "屏蔽整条评论文本");

        assert.equal(input.value, "");
        assert.equal(confirmButton.disabled, true);

        fullTextButton.dispatchEvent("click");

        assert.deepEqual(savedSettings.blockedCommentText_Array, ["完整评论广告内容"]);
        assert.deepEqual(refreshes, [undefined]);

        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("repositions the trigger and target marker on scroll", () => {
        setupDom();

        const commentElement = document.createElement("div");
        document.body.appendChild(commentElement);

        mountCommentQuickBlock(
            { settingsStore: createSettingsStore(true) },
            commentElement,
            { text: "娴嬭瘯璇勮", userId: "1", userName: "鐢ㄦ埛" }
        );

        window.scrollY = 100;
        commentElement.rect = { left: 10, top: 20, width: 300, height: 40, bottom: 60, right: 310 };
        commentElement.dispatchEvent("mouseenter");

        const trigger = document.getElementById("bbvtCommentQuickBlockTrigger");
        const marker = document.getElementById("bbvtCommentQuickBlockTargetMarker");
        assert.equal(trigger.style.top, "126px");
        assert.equal(marker.style.top, "118px");

        window.scrollY = 110;
        commentElement.rect = { left: 10, top: 10, width: 300, height: 40, bottom: 50, right: 310 };
        window.dispatchEvent({ type: "scroll" });

        assert.equal(trigger.style.top, "126px");
        assert.equal(marker.style.top, "118px");

        dismissCommentQuickBlockUi();
    });

    it("does not show the trigger for a filtered comment", () => {
        setupDom();

        const commentElement = document.createElement("div");
        commentElement.dataset.bbvtCommentBlocked = "true";
        document.body.appendChild(commentElement);

        mountCommentQuickBlock(
            { settingsStore: createSettingsStore(true) },
            commentElement,
            { text: "测试评论", userId: "1", userName: "用户" }
        );

        commentElement.dispatchEvent("mouseenter");

        assert.equal(document.getElementById("bbvtCommentQuickBlockTrigger"), null);
    });

    it("clears the quick block target marker when dismissed", () => {
        setupDom();

        const commentElement = document.createElement("div");
        document.body.appendChild(commentElement);

        mountCommentQuickBlock(
            { settingsStore: createSettingsStore(true) },
            commentElement,
            { text: "测试评论", userId: "1", userName: "用户" }
        );

        commentElement.dispatchEvent("mouseenter");
        assert.equal(commentElement.dataset.bbvtCommentQuickBlockTarget, "true");
        assert.ok(document.getElementById("bbvtCommentQuickBlockTargetMarker"));

        dismissCommentQuickBlockUi();

        assert.equal(commentElement.dataset.bbvtCommentQuickBlockTarget, undefined);
        assert.equal(document.getElementById("bbvtCommentQuickBlockTargetMarker"), null);
    });

    it("updates an existing comment quick block style tag", () => {
        setupDom();

        const oldStyle = document.createElement("style");
        oldStyle.id = "bbvtCommentQuickBlockStyles";
        oldStyle.textContent = "#bbvtCommentQuickBlockTrigger { position: fixed; }";
        document.head.appendChild(oldStyle);

        const commentElement = document.createElement("div");
        document.body.appendChild(commentElement);

        mountCommentQuickBlock(
            { settingsStore: createSettingsStore(true) },
            commentElement,
            { text: "娴嬭瘯璇勮", userId: "1", userName: "鐢ㄦ埛" }
        );
        commentElement.dispatchEvent("mouseenter");

        assert.ok(oldStyle.textContent.includes("#bbvtCommentQuickBlockTrigger"));
        assert.ok(oldStyle.textContent.includes("position: absolute;"));
        assert.ok(oldStyle.textContent.includes("#bbvtCommentQuickBlockTargetMarker"));

        dismissCommentQuickBlockUi();
    });
});

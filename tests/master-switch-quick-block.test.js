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
            this.parentNode = null;
            this.children = [];
            this.listeners = new Map();
        }

        appendChild(node) {
            node.parentNode = this;
            this.children.push(node);
            if (node.id) {
                nodes.set(node.id, node);
            }
            return node;
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

        getBoundingClientRect() {
            return { left: 10, top: 20, width: 300, height: 40, bottom: 60, right: 310 };
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
        getSelection: () => ({ toString: () => "", rangeCount: 0 }),
        bbvtQuickBlockCloseHandler: null,
    };

    return { body, nodes };
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

        commentElement.dispatchEvent("mouseenter");
        const trigger = document.getElementById("bbvtCommentQuickBlockTrigger");
        assert.ok(trigger);
        assert.equal(trigger.hidden, false);

        context.settingsStore = createSettingsStore(false);
        commentElement.dispatchEvent("mouseenter");

        assert.equal(document.getElementById("bbvtCommentQuickBlockTrigger")?.hidden, true);
    });
});

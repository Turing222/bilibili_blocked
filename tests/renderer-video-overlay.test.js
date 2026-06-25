import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { createBlockedRenderer, createBlockedOverlayRestoreHandler, setVideoBlockedOverlayLocked } from "../src/platform/renderer.js";

afterEach(() => {
    mock.timers.reset();
    delete globalThis.document;
    delete globalThis.window;
});

describe("video overlay timing", () => {
    it("renders card-box overlays immediately by default", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const videoElement = createVideoElement(true);

        renderer.renderVideoBlockedState(createVideoContext(videoElement));

        assert.equal(videoElement.dataset.bbvtBlocked, "true");
        assert.notEqual(videoElement.style.filter, "blur(5px)");
        assert.ok(videoElement.querySelector(":scope > .blockedOverlay"));
    });

    it("keeps the legacy card-box delay only when the switch is enabled", () => {
        setupDom();
        mock.timers.enable({ apis: ["setTimeout"] });

        const renderer = createBlockedRenderer();
        const videoElement = createVideoElement(true);

        renderer.renderVideoBlockedState(createVideoContext(videoElement, { legacyCardBoxOverlayDelay_Switch: true }));

        assert.equal(videoElement.dataset.bbvtBlocked, "pending");
        assert.equal(videoElement.style.filter, "blur(5px)");
        assert.equal(videoElement.querySelector(":scope > .blockedOverlay"), null);

        mock.timers.tick(2999);
        assert.equal(videoElement.dataset.bbvtBlocked, "pending");
        assert.equal(videoElement.querySelector(":scope > .blockedOverlay"), null);

        mock.timers.tick(1);
        assert.equal(videoElement.dataset.bbvtBlocked, "true");
        assert.equal(videoElement.style.filter, "none");
        assert.ok(videoElement.querySelector(":scope > .blockedOverlay"));
    });

    it("hides immediately in hide mode without rendering an overlay", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const videoElement = createVideoElement(true);

        renderer.renderVideoBlockedState(
            createVideoContext(videoElement, { hideVideoMode_Switch: true })
        );

        assert.equal(videoElement.dataset.bbvtBlocked, "true");
        assert.equal(videoElement.style.display, "none");
        assert.equal(videoElement.querySelector(":scope > .blockedOverlay"), null);
    });

    it("clears legacy pending blur when overlay generation changes before timeout", () => {
        setupDom();
        mock.timers.enable({ apis: ["setTimeout"] });

        const renderer = createBlockedRenderer();
        const videoElement = createVideoElement(true);

        renderer.renderVideoBlockedState(createVideoContext(videoElement, { legacyCardBoxOverlayDelay_Switch: true }));
        assert.equal(videoElement.style.filter, "blur(5px)");

        renderer.removeAllBlockedOverlays();
        mock.timers.tick(3000);

        assert.equal(videoElement.style.filter, "none");
        assert.equal(videoElement.dataset.bbvtBlocked, undefined);
        assert.equal(videoElement.querySelector(":scope > .blockedOverlay"), null);

        renderer.renderVideoBlockedState(createVideoContext(videoElement));
        assert.ok(videoElement.querySelector(":scope > .blockedOverlay"));
    });

    it("marks overlay hosts for css hover peek and supports panel lock", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const videoElement = createVideoElement(true);

        renderer.renderVideoBlockedState(createVideoContext(videoElement));
        assert.equal(videoElement.dataset.bbvtBlockedOverlayHost, "true");
        assert.equal(videoElement.dataset.bbvtOverlayLocked, undefined);

        const restoreOverlay = createBlockedOverlayRestoreHandler(videoElement);
        assert.equal(typeof restoreOverlay, "function");
        assert.equal(videoElement.dataset.bbvtOverlayLocked, "true");

        restoreOverlay();
        assert.equal(videoElement.dataset.bbvtOverlayLocked, undefined);

        setVideoBlockedOverlayLocked(videoElement, true);
        assert.equal(videoElement.dataset.bbvtOverlayLocked, "true");
        setVideoBlockedOverlayLocked(videoElement, false);
        assert.equal(videoElement.dataset.bbvtOverlayLocked, undefined);
    });
});

function setupDom() {
    globalThis.window = {
        location: {
            href: "https://www.bilibili.com/",
        },
    };

    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
        getElementById: () => null,
        querySelectorAll: () => [],
        head: new FakeElement("head"),
    };
}

function createVideoContext(videoElement, settings = {}) {
    return {
        settings: {
            hideVideoMode_Switch: false,
            legacyCardBoxOverlayDelay_Switch: false,
            ...settings,
        },
        videoStore: {
            getVideoInfo: () => ({
                blockedTarget: true,
                triggeredBlockedRules: ["按标题屏蔽: 测试"],
            }),
        },
        statsStore: null,
        videoElement,
        videoBv: "BV1test",
    };
}

function createVideoElement(isCardBox = false) {
    const videoElement = new FakeElement("div");
    videoElement.firstElementChild = isCardBox ? { className: "card-box" } : { className: "video-card" };
    videoElement.getBoundingClientRect = () => ({ width: 320, height: 180 });
    return videoElement;
}

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName || "").toUpperCase();
        this.dataset = {};
        this.style = {};
        this.children = [];
        this.parentNode = null;
        this.className = "";
        this.listeners = new Map();
        this.classList = {
            contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
        };
    }

    appendChild(node) {
        node.parentNode = this;
        this.children.push(node);
        return node;
    }

    insertAdjacentElement(position, element) {
        if (position === "afterbegin") {
            element.parentNode = this;
            this.children.unshift(element);
            return element;
        }

        return this.appendChild(element);
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    remove() {
        if (!this.parentNode) {
            return;
        }

        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
    }

    closest() {
        return null;
    }

    querySelector(selector) {
        if (selector === ":scope > .blockedOverlay") {
            return this.children.find((child) => child.classList?.contains("blockedOverlay")) || null;
        }

        if (selector === ".blockedOverlay") {
            return findElement(this, (element) => element.classList?.contains("blockedOverlay"));
        }

        return null;
    }

    querySelectorAll(selector) {
        if (selector === ":scope > .blockedOverlay") {
            return this.children.filter((child) => child.classList?.contains("blockedOverlay"));
        }

        if (selector === ".blockedOverlay") {
            const results = [];
            collectElements(this, (element) => {
                if (element.classList?.contains("blockedOverlay")) {
                    results.push(element);
                }
            });
            return results;
        }

        return [];
    }
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

function collectElements(root, visitor) {
    visitor(root);
    for (const child of root.children || []) {
        collectElements(child, visitor);
    }
}

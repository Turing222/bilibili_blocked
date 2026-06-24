import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createBlockedRenderer } from "../src/platform/renderer.js";

afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.GM_addStyle;
});

describe("comment renderer block modes", () => {
    it("renders a blocked comment with an overlay and temporary hover reveal", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        parent.appendChild(comment);

        renderer.renderCommentBlockedState(comment, {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["hover", "user", "comment text"]),
        });

        const overlay = parent.querySelector(".bbvt-comment-filter-overlay");
        assert.equal(comment.style.visibility, "hidden");
        assert.equal(parent.querySelector("button"), null);
        assert.match(overlay.children[0].textContent, /test/);

        overlay.onmousemove({ target: overlay });
        assert.equal(comment.style.visibility, "");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, "true");

        renderer.renderCommentBlockedState(comment, {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["hover", "user", "comment text"]),
        });
        assert.equal(comment.style.visibility, "");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, "true");

        overlay.onmouseleave();
        assert.equal(comment.style.visibility, "hidden");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, undefined);
    });

    it("hides a blocked comment in hide mode without rendering an overlay", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const firstComment = document.createElement("bili-comment-renderer");
        parent.appendChild(firstComment);

        const blockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["hide", "user", "comment text"]),
        };

        assert.equal(renderer.renderCommentBlockedState(firstComment, blockResult, { mode: "hide" }), true);
        assert.equal(firstComment.style.display, "none");
        assert.equal(firstComment.style.visibility, "");
        assert.equal(firstComment.dataset.bbvtCommentBlockMode, "hide");
        assert.equal(parent.querySelectorAll(".bbvt-comment-filter-overlay").length, 0);
    });

    it("switches from hide mode back to overlay mode without losing the original display", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        comment.style.display = "block";
        parent.appendChild(comment);

        const blockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["switch", "user", "comment text"]),
        };

        renderer.renderCommentBlockedState(comment, blockResult, { mode: "hide" });
        assert.equal(comment.style.display, "none");

        renderer.renderCommentBlockedState(comment, blockResult, { mode: "overlay" });
        assert.equal(comment.style.display, "block");
        assert.equal(comment.style.visibility, "hidden");
        assert.equal(comment.dataset.bbvtCommentBlockMode, "overlay");
        assert.equal(parent.querySelectorAll(".bbvt-comment-filter-overlay").length, 1);

        renderer.renderCommentBlockedState(comment, { blocked: false, commentKey: blockResult.commentKey });
        assert.equal(comment.style.display, "block");
        assert.equal(comment.style.visibility, "");
        assert.equal(comment.dataset.bbvtCommentBlocked, undefined);
        assert.equal(parent.querySelectorAll(".bbvt-comment-filter-overlay").length, 0);
    });
});

function setupDom() {
    const body = new FakeElement("body");
    const head = new FakeElement("head");

    globalThis.window = {
        location: { href: "https://www.bilibili.com/video/BV1test/" },
    };

    globalThis.document = {
        body,
        head,
        createElement: (tagName) => new FakeElement(tagName),
        getElementById(id) {
            return findElement(body, (element) => element.id === id) ||
                findElement(head, (element) => element.id === id) ||
                null;
        },
    };
}

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName || "").toUpperCase();
        this.id = "";
        this.className = "";
        this.dataset = {};
        this.style = {};
        this.textContent = "";
        this.type = "";
        this.parentNode = null;
        this.children = [];
        this.childNodes = this.children;
        this.listeners = new Map();
        this.classList = {
            contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
        };
    }

    append(...nodes) {
        nodes.forEach((node) => this.appendChild(node));
    }

    appendChild(node) {
        node.parentNode = this;
        this.children.push(node);
        return node;
    }

    insertBefore(node, referenceNode) {
        if (node.parentNode) {
            node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
            node.parentNode.childNodes = node.parentNode.children;
        }
        node.parentNode = this;
        const index = this.children.indexOf(referenceNode);
        if (index < 0) {
            this.children.push(node);
            return node;
        }
        this.children.splice(index, 0, node);
        return node;
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            this.parentNode.childNodes = this.parentNode.children;
        }
        this.parentNode = null;
    }

    replaceChildren(...nodes) {
        this.children.forEach((child) => {
            child.parentNode = null;
        });
        this.children = [];
        this.childNodes = this.children;
        this.append(...nodes);
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    click() {
        for (const handler of this.listeners.get("click") || []) {
            handler({
                target: this,
                preventDefault() {},
                stopPropagation() {},
            });
        }
    }

    querySelector(selector) {
        return findElement(this, (element) => matchesSelector(element, selector));
    }

    querySelectorAll(selector) {
        const results = [];
        collectElements(this, (element) => {
            if (matchesSelector(element, selector)) {
                results.push(element);
            }
        });
        return results;
    }
}

function matchesSelector(element, selector) {
    if (selector === "button") {
        return element.tagName === "BUTTON";
    }

    if (selector === ".bbvt-comment-filter-overlay") {
        return element.classList.contains("bbvt-comment-filter-overlay");
    }

    return false;
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

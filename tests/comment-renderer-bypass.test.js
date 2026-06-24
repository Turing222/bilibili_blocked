import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createBlockedRenderer } from "../src/platform/renderer.js";

afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.GM_addStyle;
});

describe("comment renderer bypass state", () => {
    it("keeps a revealed comment revealed when the DOM node is replaced", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const firstComment = document.createElement("bili-comment-renderer");
        parent.appendChild(firstComment);

        const blockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["2", "user", "comment text"]),
        };

        assert.equal(renderer.renderCommentBlockedState(firstComment, blockResult), true);
        assert.equal(firstComment.style.visibility, "hidden");

        parent.querySelector("button").click();
        assert.equal(firstComment.style.visibility, "");
        assert.equal(firstComment.dataset.bbvtCommentFilterBypass, "true");
        assert.equal(parent.querySelector("button").textContent, "重新隐藏");

        firstComment.remove();
        const replacementComment = document.createElement("bili-comment-renderer");
        parent.appendChild(replacementComment);

        assert.equal(renderer.renderCommentBlockedState(replacementComment, blockResult), false);
        assert.notEqual(replacementComment.style.display, "none");
        assert.equal(replacementComment.dataset.bbvtCommentFilterBypass, "true");
        assert.equal(parent.querySelector("button").textContent, "重新隐藏");
    });

    it("reveals a blocked comment while moving across the overlay body", () => {
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
        const actions = overlay.querySelector(".bbvt-comment-filter-overlay-actions");
        assert.equal(comment.style.visibility, "hidden");

        overlay.onmousemove({ target: actions });
        assert.equal(comment.style.visibility, "hidden");

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

    it("rebinds the overlay action when a revealed comment node is replaced", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const firstComment = document.createElement("bili-comment-renderer");
        parent.appendChild(firstComment);

        const blockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["1", "user", "comment text"]),
        };

        renderer.renderCommentBlockedState(firstComment, blockResult);
        parent.querySelector("button").click();
        assert.equal(parent.querySelectorAll(".bbvt-comment-filter-overlay").length, 1);

        firstComment.remove();
        const replacementComment = document.createElement("bili-comment-renderer");
        parent.appendChild(replacementComment);

        renderer.renderCommentBlockedState(replacementComment, blockResult);

        assert.equal(parent.querySelectorAll(".bbvt-comment-filter-overlay").length, 1);
        assert.equal(parent.querySelector("button").textContent, "重新隐藏");

        parent.querySelector("button").click();

        assert.equal(replacementComment.style.visibility, "hidden");
        assert.equal(replacementComment.dataset.bbvtCommentBlocked, "true");
        assert.equal(parent.querySelectorAll(".bbvt-comment-filter-overlay").length, 1);
        assert.equal(parent.querySelector("button").textContent, "显示");
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

    if (selector === ".bbvt-comment-filter-overlay-actions") {
        return element.classList.contains("bbvt-comment-filter-overlay-actions");
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

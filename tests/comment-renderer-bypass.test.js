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
        const text = overlay.querySelector(".bbvt-comment-filter-overlay-text");
        assert.equal(comment.style.visibility, "hidden");
        assert.equal(parent.querySelector("button"), null);
        assert.match(text.textContent, /test/);

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

    it("keeps the hover peek across a re-evaluation that re-blocks the same comment (resize/refresh)", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        parent.appendChild(comment);

        const blockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["reeval", "user", "comment text"]),
        };

        renderer.renderCommentBlockedState(comment, blockResult);
        const overlay = parent.querySelector(".bbvt-comment-filter-overlay");
        assert.equal(comment.style.visibility, "hidden");

        overlay.onmousemove({ target: overlay });
        assert.equal(comment.style.visibility, "");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, "true");

        // resize / MutationObserver 触发的重跑：同一条评论仍命中、仍被 block。
        // 旧行为会把 peek dataset 顺手清掉，导致评论被重新藏起来；现在必须保持 peek。
        renderer.renderCommentBlockedState(comment, blockResult);
        assert.equal(comment.style.visibility, "");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, "true");

        // 重跑期间还可能对其它评论走 restore（blocked=false）路径，不应波及当前 peek。
        const otherComment = document.createElement("bili-comment-renderer");
        parent.appendChild(otherComment);
        const otherBlockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: other",
            commentKey: JSON.stringify(["reeval-other", "user", "other text"]),
        };
        renderer.renderCommentBlockedState(otherComment, otherBlockResult);
        renderer.renderCommentBlockedState(comment, blockResult);
        assert.equal(comment.style.visibility, "");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, "true");

        // 真正离开 overlay 才结束 peek。
        overlay.onmouseleave();
        assert.equal(comment.style.visibility, "hidden");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, undefined);
    });

    it("ends the hover peek only when the comment is genuinely restored (blocked=false)", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        parent.appendChild(comment);

        const blockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["restore", "user", "comment text"]),
        };

        renderer.renderCommentBlockedState(comment, blockResult);
        const overlay = parent.querySelector(".bbvt-comment-filter-overlay");
        overlay.onmousemove({ target: overlay });
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, "true");

        // 规则被移除 / 总开关关闭：评论彻底恢复，peek 必须清干净。
        renderer.renderCommentBlockedState(comment, { blocked: false, commentKey: blockResult.commentKey });
        assert.equal(comment.style.visibility, "");
        assert.equal(comment.dataset.bbvtCommentFilterPeeking, undefined);
        assert.equal(parent.querySelectorAll(".bbvt-comment-filter-overlay").length, 0);
    });

    it("renders removable reason chips that remain available while peeking", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        parent.appendChild(comment);

        let removed = false;
        renderer.renderCommentBlockedState(comment, {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["chip", "user", "comment text"]),
        }, {
            reasonItems: [{
                label: "按评论内容屏蔽 · test",
                title: "规则：test",
                canRemove: true,
                onRemove: () => {
                    removed = true;
                },
            }],
        });

        const overlay = parent.querySelector(".bbvt-comment-filter-overlay");
        const chip = overlay.querySelector(".bbvt-comment-filter-reason-chip");
        const button = overlay.querySelector("button");
        assert.ok(chip);
        assert.ok(button);

        overlay.onmousemove({ target: chip });
        assert.equal(comment.style.visibility, "hidden");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, undefined);

        overlay.onmousemove({ target: overlay });
        assert.equal(comment.style.visibility, "");
        assert.equal(overlay.dataset.bbvtCommentFilterPeeking, "true");
        assert.ok(overlay.querySelector("button"));

        button.click();
        assert.equal(removed, true);
    });

    it("keeps removable reason controls stable when rerendering the same overlay", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        parent.appendChild(comment);

        let removed = false;
        const blockResult = {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["stable", "user", "comment text"]),
        };
        const options = {
            reasonItems: [{
                id: "reason:test",
                label: "按评论内容屏蔽 · test",
                title: "规则：test",
                canRemove: true,
                onRemove: () => {
                    removed = true;
                },
            }],
        };

        renderer.renderCommentBlockedState(comment, blockResult, options);
        const overlay = parent.querySelector(".bbvt-comment-filter-overlay");
        const button = overlay.querySelector("button");

        renderer.renderCommentBlockedState(comment, blockResult, options);
        assert.equal(overlay.querySelector("button"), button);

        button.click();
        assert.equal(removed, true);
    });

    it("updates an existing comment filter style tag when the overlay css changes", () => {
        setupDom();

        const oldStyle = document.createElement("style");
        oldStyle.id = "bbvtCommentFilterStyles";
        oldStyle.textContent = ".bbvt-comment-filter-overlay { opacity: 0; }";
        document.head.appendChild(oldStyle);

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        parent.appendChild(comment);

        renderer.renderCommentBlockedState(comment, {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["style", "user", "comment text"]),
        });

        assert.match(oldStyle.textContent, /bbvt-comment-filter-overlay-veil/);
    });

    it("keeps the reason control bar visually independent from the peeking veil", () => {
        setupDom();

        const renderer = createBlockedRenderer();
        const parent = document.createElement("div");
        document.body.appendChild(parent);

        const comment = document.createElement("bili-comment-renderer");
        parent.appendChild(comment);

        renderer.renderCommentBlockedState(comment, {
            blocked: true,
            reason: "按评论内容屏蔽: test",
            commentKey: JSON.stringify(["layout", "user", "comment text"]),
        }, {
            reasonItems: [{
                label: "按评论内容屏蔽 · test",
                canRemove: true,
                onRemove: () => {},
            }],
        });

        const styleText = document.getElementById("bbvtCommentFilterStyles").textContent;
        assert.ok(styleText.includes(".bbvt-comment-filter-overlay-body"));
        assert.ok(styleText.includes("position: absolute;"));
        assert.ok(styleText.includes("right: 8px;"));
        assert.ok(styleText.includes("background: rgba(25, 29, 34, 0.9);"));
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

    if (selector.startsWith(".")) {
        return element.classList.contains(selector.slice(1));
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

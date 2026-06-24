import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

let importCounter = 0;

afterEach(() => {
    delete globalThis.document;
    delete globalThis.MutationObserver;
    mock.timers.reset();
});

describe("comment shadow DOM observer", () => {
    it("reads Bilibili component data when rendered DOM text is empty", async () => {
        const commentElement = createFakeNode();
        commentElement.__data = {
            content: {
                message: "full expanded comment",
            },
            member: {
                mid: 12345,
                uname: "blocked user",
            },
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();
        const commentInfo = adapter.readCommentInfo(commentElement);

        assert.equal(commentInfo.text, "full expanded comment");
        assert.equal(commentInfo.userId, "12345");
        assert.equal(commentInfo.userName, "blocked user");
    });

    it("observes text and key attribute changes inside comment shadow roots", async () => {
        const shadowRoot = createFakeNode({ nodeType: 11 });
        const host = createFakeNode({ shadowRoot });
        globalThis.document = createFakeDocument([host]);
        const observers = installFakeMutationObserver();

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();
        adapter.observeCommentChanges(() => {});

        const shadowObserver = observers.find((observer) => observer.target === shadowRoot);
        assert.ok(shadowObserver);
        assert.equal(shadowObserver.options.childList, true);
        assert.equal(shadowObserver.options.subtree, true);
        assert.equal(shadowObserver.options.characterData, true);
        assert.equal(shadowObserver.options.attributes, true);
        assert.ok(shadowObserver.options.attributeFilter.includes("data-src"));
        assert.ok(shadowObserver.options.attributeFilter.includes("user-id"));
    });

    it("refreshes when rendered comment text changes without child nodes being added", async () => {
        mock.timers.enable({ apis: ["setTimeout"] });

        const shadowRoot = createFakeNode({ nodeType: 11 });
        const host = createFakeNode({ shadowRoot });
        globalThis.document = createFakeDocument([host]);
        const observers = installFakeMutationObserver();

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();
        let refreshCount = 0;
        adapter.observeCommentChanges(() => {
            refreshCount++;
        });

        const shadowObserver = observers.find((observer) => observer.target === shadowRoot);
        shadowObserver.trigger([
            {
                type: "characterData",
                target: { parentElement: null },
            },
        ]);

        mock.timers.tick(199);
        assert.equal(refreshCount, 0);

        mock.timers.tick(1);
        assert.equal(refreshCount, 1);
    });

    it("discovers comment shadow roots that are added after observation starts", async () => {
        mock.timers.enable({ apis: ["setTimeout"] });

        const documentChildren = [];
        globalThis.document = createFakeDocument(documentChildren);
        const observers = installFakeMutationObserver();

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();
        let refreshCount = 0;
        adapter.observeCommentChanges(() => {
            refreshCount++;
        });

        const documentObserver = observers.find((observer) => observer.target === globalThis.document.body);
        assert.ok(documentObserver);

        const lateShadowRoot = createFakeNode({ nodeType: 11 });
        const lateHost = createFakeNode({ shadowRoot: lateShadowRoot });
        documentChildren.push(lateHost);

        documentObserver.trigger([
            {
                type: "childList",
                addedNodes: [lateHost],
                removedNodes: [],
            },
        ]);

        mock.timers.tick(49);
        assert.equal(observers.some((observer) => observer.target === lateShadowRoot), false);

        mock.timers.tick(1);
        assert.equal(observers.some((observer) => observer.target === lateShadowRoot), true);

        mock.timers.tick(150);
        assert.equal(refreshCount, 1);
    });

    it("uses the whole thread as the block target for root comments only", async () => {
        const thread = createFakeNode({
            matches: (selector) => selector === "bili-comment-thread-renderer",
            tagName: "bili-comment-thread-renderer",
        });
        const rootComment = createFakeNode({
            parentElement: thread,
            tagName: "bili-comment-renderer",
        });
        const subReply = createFakeNode({
            classNames: ["sub-reply-item"],
            parentElement: thread,
            tagName: "div",
        });

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        assert.equal(adapter.getCommentBlockTarget(rootComment), thread);
        assert.equal(adapter.getCommentBlockTarget(subReply), subReply);
    });
});

async function importFreshDomAdapter() {
    importCounter++;
    return import(`../src/platform/dom-adapter.js?dom-adapter-comment-observer-test=${importCounter}`);
}

function installFakeMutationObserver() {
    const observers = [];

    globalThis.MutationObserver = class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            observers.push(this);
        }

        observe(target, options) {
            this.target = target;
            this.options = options;
        }

        trigger(records) {
            this.callback(records);
        }
    };

    return observers;
}

function createFakeDocument(children) {
    return {
        nodeType: 9,
        body: createFakeNode(),
        querySelectorAll(selector) {
            return selector === "*" ? children : [];
        },
    };
}

function createFakeNode({
    childNodes = [],
    classNames = [],
    dataset = {},
    matches = () => false,
    nodeType = 1,
    parentElement = null,
    parentNode = null,
    shadowRoot = null,
    tagName = "div",
} = {}) {
    return {
        childNodes,
        className: classNames.join(" "),
        classList: {
            contains: (name) => classNames.includes(name),
        },
        dataset,
        nodeType,
        parentElement,
        parentNode,
        shadowRoot,
        tagName,
        closest: () => null,
        matches,
        querySelectorAll(selector) {
            return selector === "*" ? childNodes : [];
        },
    };
}

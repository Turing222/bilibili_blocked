import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

let importCounter = 0;

afterEach(() => {
    delete globalThis.document;
});

describe("video card fast path in dom adapter", () => {
    it("collects video cards from mutation added nodes", async () => {
        globalThis.document = {
            querySelector: () => null,
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const videoCard = createFakeVideoCard();
        const noiseNode = createFakeNode();

        const result = adapter.getVideoElementsFromMutationRecords([
            {
                type: "childList",
                addedNodes: [noiseNode, videoCard],
                removedNodes: [],
            },
        ]);

        assert.deepEqual(result, [videoCard]);
    });
});

async function importFreshDomAdapter() {
    importCounter++;
    return import(`../src/platform/dom-adapter.js?video-fast-path-test=${importCounter}`);
}

function createFakeVideoCard() {
    return {
        classList: {
            value: "bili-video-card",
            contains: (name) => name === "bili-video-card",
        },
        matches: (selector) => selector.includes("div.bili-video-card"),
        querySelector: (selector) => (selector === "a" ? {} : null),
        querySelectorAll: () => [],
    };
}

function createFakeNode() {
    return {
        classList: {
            value: "plain-node",
            contains: () => false,
        },
        matches: () => false,
        querySelector: () => null,
        querySelectorAll: () => [],
    };
}

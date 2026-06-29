import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

let importCounter = 0;

afterEach(() => {
    delete globalThis.document;
});

describe("comment section readiness in dom adapter", () => {
    it("treats bili-comments as ready", async () => {
        globalThis.document = {
            querySelector(selector) {
                if (selector === "bili-comments") {
                    return {};
                }
                return null;
            },
        };

        const adapter = await importFreshDomAdapter();
        assert.equal(adapter.isCommentSectionReady(), true);
        assert.equal(
            adapter.shouldDeferRecommendationOverlay("https://www.bilibili.com/video/BV1test/", {
                hideVideoMode_Switch: false,
            }),
            false
        );
    });

    it("defers recommendation overlays on video pages until commentapp mounts", async () => {
        globalThis.document = {
            querySelector(selector) {
                if (selector === "#commentapp") {
                    return { childElementCount: 0 };
                }
                return null;
            },
        };

        const adapter = await importFreshDomAdapter();
        assert.equal(adapter.isCommentSectionReady(), false);
        assert.equal(
            adapter.shouldDeferRecommendationOverlay("https://www.bilibili.com/video/BV1test/", {
                hideVideoMode_Switch: false,
            }),
            true
        );
        assert.equal(
            adapter.shouldDeferRecommendationOverlay("https://www.bilibili.com/video/BV1test/", {
                hideVideoMode_Switch: true,
            }),
            false
        );
        assert.equal(
            adapter.shouldDeferRecommendationOverlay("https://www.bilibili.com/", {
                hideVideoMode_Switch: false,
            }),
            false
        );
    });
});

async function importFreshDomAdapter() {
    importCounter++;
    const module = await import(`../src/platform/dom-adapter.js?comment-ready-test=${importCounter}`);
    return module.createBilibiliDomAdapter();
}

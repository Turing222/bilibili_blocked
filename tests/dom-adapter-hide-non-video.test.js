import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

let importCounter = 0;

afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
});

describe("dom-adapter hideNonVideoElements :has() fallback", () => {
    it("falls back to parent selector when :has() is unsupported", async () => {
        const queryCalls = [];
        const adCard = createFakeElement();
        const feedCardWithAd = createFakeElement({
            querySelector: () => createFakeElement(),
            parentNode: createFakeElement(),
        });
        const feedCardWithoutAd = createFakeElement({ querySelector: () => null });

        globalThis.window = { location: { href: "https://www.bilibili.com/" } };
        globalThis.document = {
            querySelectorAll(selector) {
                queryCalls.push(selector);
                if (selector.includes(":has(")) {
                    throw new TypeError("Failed to execute 'querySelectorAll': ':has(...)' is not a valid selector");
                }
                if (selector === "div.floor-single-card, div.feed-card, div.bili-feed-card") {
                    return [feedCardWithAd, feedCardWithoutAd];
                }
                return [];
            },
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        assert.doesNotThrow(() => adapter.hideNonVideoElements());

        assert.ok(queryCalls.some((selector) => selector.includes(":has(")));
        assert.ok(queryCalls.includes("div.floor-single-card, div.feed-card, div.bili-feed-card"));
        assert.equal(adCard.classList._has("hideAD"), false);
        assert.equal(feedCardWithAd.classList._has("hideAD"), true);
        assert.equal(feedCardWithoutAd.classList._has("hideAD"), false);
    });

    it("uses :has() directly when supported without invoking fallback", async () => {
        const queryCalls = [];
        const adCard = createFakeElement();

        globalThis.window = { location: { href: "https://www.bilibili.com/" } };
        globalThis.document = {
            querySelectorAll(selector) {
                queryCalls.push(selector);
                if (selector.includes(":has(")) {
                    return [adCard];
                }
                return [];
            },
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        adapter.hideNonVideoElements();

        assert.ok(queryCalls.some((selector) => selector.includes(":has(")));
        assert.equal(
            queryCalls.some((selector) => selector === "div.floor-single-card, div.feed-card, div.bili-feed-card"),
            false
        );
        assert.equal(adCard.classList._has("hideAD"), true);
    });
});

async function importFreshDomAdapter() {
    importCounter++;
    return import(`../src/platform/dom-adapter.js?dom-adapter-hide-non-video-test=${importCounter}`);
}

function createFakeElement(overrides = {}) {
    const classList = {
        _set: new Set(),
        add(name) {
            this._set.add(name);
        },
        remove(name) {
            this._set.delete(name);
        },
        _has(name) {
            return this._set.has(name);
        },
    };
    return {
        classList,
        querySelector: () => null,
        parentNode: null,
        ...overrides,
    };
}

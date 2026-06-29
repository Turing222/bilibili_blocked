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

describe("dom-adapter promoted video cards", () => {
    it("hides search promoted video card wrappers without touching normal video cards", async () => {
        const promotedHttpsParent = createFakeElement();
        const promotedProtocolParent = createFakeElement();
        const normalParent = createFakeElement();
        const promotedHttpsLink = createFakeElement({
            closest: (selector) => selector.includes("div.bili-video-card") ? promotedHttpsCard : null,
        });
        const promotedProtocolLink = createFakeElement({
            closest: (selector) => selector.includes("div.bili-video-card") ? promotedProtocolCard : null,
        });
        const promotedHttpsCard = createFakeElement({
            parentElement: promotedHttpsParent,
        });
        const promotedProtocolCard = createFakeElement({
            parentElement: promotedProtocolParent,
        });

        globalThis.window = { location: { href: "https://search.bilibili.com/all?keyword=test" } };
        globalThis.document = {
            querySelectorAll(selector) {
                if (selector.includes("cm.bilibili.com")) {
                    return [promotedHttpsLink, promotedProtocolLink];
                }
                return [];
            },
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        adapter.hidePromotedVideoCards();

        assert.equal(promotedHttpsParent.style.display, "none");
        assert.equal(promotedHttpsParent.dataset.bbvtPromotedVideoCardHidden, "true");
        assert.equal(promotedProtocolParent.style.display, "none");
        assert.equal(promotedProtocolParent.dataset.bbvtPromotedVideoCardHidden, "true");
        assert.equal(normalParent.style.display, "");
        assert.equal(normalParent.dataset.bbvtPromotedVideoCardHidden, undefined);
    });

    it("hides home feed promoted video card containers", async () => {
        const feedCard = createFakeElement();
        const link = createFakeElement({
            closest: (selector) => selector.includes("div.feed-card") ? feedCard : null,
        });

        globalThis.window = { location: { href: "https://www.bilibili.com/" } };
        globalThis.document = {
            querySelectorAll(selector) {
                return selector.includes("cm.bilibili.com") ? [link] : [];
            },
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        adapter.hidePromotedVideoCards();

        assert.equal(feedCard.style.display, "none");
        assert.equal(feedCard.dataset.bbvtPromotedVideoCardHidden, "true");
    });

    it("hides video page promoted side cards", async () => {
        const sideCard = createFakeElement();
        const link = createFakeElement({
            closest: (selector) => {
                if (selector.includes("div.feed-card")) {
                    return null;
                }
                if (selector.includes("div.video-page-card-small")) {
                    return sideCard;
                }
                return null;
            },
        });

        globalThis.window = { location: { href: "https://www.bilibili.com/video/BV1test" } };
        globalThis.document = {
            querySelectorAll(selector) {
                return selector.includes("cm.bilibili.com") ? [link] : [];
            },
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        adapter.hidePromotedVideoCards();

        assert.equal(sideCard.style.display, "none");
        assert.equal(sideCard.dataset.bbvtPromotedVideoCardHidden, "true");
    });

    it("restores hidden promoted video card wrappers", async () => {
        const promotedParent = createFakeElement();
        promotedParent.style.display = "grid";
        const link = createFakeElement({
            closest: (selector) => selector.includes("div.bili-video-card") ? promotedCard : null,
        });
        const promotedCard = createFakeElement({
            parentElement: promotedParent,
        });

        globalThis.window = { location: { href: "https://search.bilibili.com/all?keyword=test" } };
        globalThis.document = {
            querySelectorAll(selector) {
                if (selector.includes("cm.bilibili.com")) {
                    return [link];
                }
                if (selector === "[data-bbvt-promoted-video-card-hidden]") {
                    return promotedParent.dataset.bbvtPromotedVideoCardHidden ? [promotedParent] : [];
                }
                return [];
            },
        };

        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        adapter.hidePromotedVideoCards();
        assert.equal(promotedParent.style.display, "none");

        adapter.restorePromotedVideoCards();

        assert.equal(promotedParent.style.display, "grid");
        assert.equal(promotedParent.dataset.bbvtPromotedVideoCardHidden, undefined);
        assert.equal(promotedParent.dataset.bbvtPromotedVideoCardOriginalDisplay, undefined);
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
        dataset: {},
        style: { display: "" },
        querySelector: () => null,
        closest: () => null,
        parentNode: null,
        parentElement: null,
        ...overrides,
    };
}

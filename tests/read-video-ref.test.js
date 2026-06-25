import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

let importCounter = 0;

afterEach(() => {
    delete globalThis.document;
});

function makeLink(href, className = "") {
    return { href, className };
}

function makeTitleElement(title) {
    return { title };
}

function makeVideoElement(links = [], titleEl = null) {
    return {
        querySelectorAll(selector) {
            if (selector === "a") return links;
            return [];
        },
        querySelector(selector) {
            if (selector === "[title]:not(span)") return titleEl;
            return null;
        },
    };
}

async function importFreshDomAdapter() {
    importCounter++;
    return import(`../src/platform/dom-adapter.js?read-video-ref-test=${importCounter}`);
}

describe("readVideoRef", () => {
    it("extracts BV id from a BV link", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const el = makeVideoElement(
            [makeLink("https://www.bilibili.com/video/BV1abc12345")],
            makeTitleElement("测试标题"),
        );

        const ref = adapter.readVideoRef(el);
        assert.equal(ref.videoBv, "BV1abc12345");
        assert.equal(ref.videoTitle, "测试标题");
    });

    it("converts av link to BV id", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const el = makeVideoElement(
            [makeLink("https://www.bilibili.com/video/av12345")],
            makeTitleElement("av视频"),
        );

        const ref = adapter.readVideoRef(el);
        // av2bv(12345) should produce a BV id starting with "BV1"
        assert.ok(ref.videoBv.startsWith("BV1"), `expected BV id, got ${ref.videoBv}`);
        assert.equal(ref.videoTitle, "av视频");
    });

    it("skips links with className other-link", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const el = makeVideoElement(
            [
                makeLink("https://www.bilibili.com/video/BV1skip", "other-link"),
                makeLink("https://www.bilibili.com/video/BV1real"),
            ],
            makeTitleElement("标题"),
        );

        const ref = adapter.readVideoRef(el);
        assert.equal(ref.videoBv, "BV1real");
    });

    it("returns null when no BV or av link found", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const el = makeVideoElement(
            [makeLink("https://www.bilibili.com/other/page")],
            makeTitleElement("标题"),
        );

        const ref = adapter.readVideoRef(el);
        assert.equal(ref, null);
    });

    it("returns null when there are no links", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const el = makeVideoElement([], makeTitleElement("标题"));

        const ref = adapter.readVideoRef(el);
        assert.equal(ref, null);
    });

    it("uses first non-other-link BV match", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const el = makeVideoElement(
            [
                makeLink("https://www.bilibili.com/video/BV1first", "other-link"),
                makeLink("https://www.bilibili.com/video/BV1second"),
                makeLink("https://www.bilibili.com/video/BV1third"),
            ],
            makeTitleElement("标题"),
        );

        const ref = adapter.readVideoRef(el);
        assert.equal(ref.videoBv, "BV1second");
    });

    it("returns empty title when title element is missing", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const el = makeVideoElement(
            [makeLink("https://www.bilibili.com/video/BV1abc")],
            null,
        );

        const ref = adapter.readVideoRef(el);
        assert.equal(ref.videoBv, "BV1abc");
        assert.equal(ref.videoTitle, "");
    });

    it("captures the video link href", async () => {
        globalThis.document = { querySelector: () => null };
        const { createBilibiliDomAdapter } = await importFreshDomAdapter();
        const adapter = createBilibiliDomAdapter();

        const href = "https://www.bilibili.com/video/BV1link";
        const el = makeVideoElement(
            [makeLink(href)],
            makeTitleElement("标题"),
        );

        const ref = adapter.readVideoRef(el);
        assert.equal(ref.videoLink, href);
    });
});

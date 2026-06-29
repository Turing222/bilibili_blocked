import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, afterEach } from "node:test";

import {
  acquireBrowserLease,
  browserLockDir,
  getFirstVisibleBilibiliVideoLink,
  isBilibiliReplyResponse,
  normalizeBilibiliVideoHref,
  releaseBrowserLease,
  scrollUntil,
  summarizeNetworkResponse,
  waitForBilibiliReplyResponse,
} from "../scripts/lib/browser-harness.js";

function createResponse(url, { status = 200, method = "GET" } = {}) {
  return {
    url: () => url,
    status: () => status,
    request: () => ({
      method: () => method,
    }),
  };
}

function createFakeVideoLinkPage(items, pageUrl = "https://www.bilibili.com/") {
  return {
    url: () => pageUrl,
    locator() {
      return {
        async count() {
          return items.length;
        },
        nth(index) {
          const item = items[index] ?? {};
          return {
            async getAttribute(name) {
              if (name === "href") {
                return item.href ?? null;
              }
              if (name === "title") {
                return item.title ?? null;
              }
              if (name === "aria-label") {
                return item.ariaLabel ?? null;
              }
              return null;
            },
            async boundingBox() {
              return item.box ?? null;
            },
            async innerText() {
              return item.text ?? "";
            },
          };
        },
      };
    },
  };
}

describe("browser-harness scrollUntil", () => {
  it("stops once the predicate returns true", async () => {
    let predicateCalls = 0;
    let wheelCalls = 0;
    const page = {
      mouse: {
        async wheel() {
          wheelCalls += 1;
        },
      },
      async waitForFunction() {},
    };

    await scrollUntil(
      page,
      async () => {
        predicateCalls += 1;
        return predicateCalls >= 2;
      },
      { maxAttempts: 5, step: 100, timeoutMs: 1000 }
    );

    assert.equal(predicateCalls, 2);
    assert.equal(wheelCalls, 1);
  });

  it("throws when the predicate never succeeds", async () => {
    const page = {
      mouse: { async wheel() {} },
      async waitForFunction() {},
    };

    await assert.rejects(
      () => scrollUntil(page, async () => false, { maxAttempts: 2, step: 50, timeoutMs: 200 }),
      /Target state did not appear/
    );
  });
});

describe("browser-harness lease", () => {
  const port = 19223;

  afterEach(async () => {
    await releaseBrowserLease(port);
  });

  it("acquires and releases a lock directory", async () => {
    const lease = await acquireBrowserLease(port, "test:lease", { pageUrl: "about:blank" });
    assert.equal(lease.owner, "test:lease");
    assert.equal(typeof lease.leaseId, "string");
    assert.equal(await fs.stat(browserLockDir(port)).then(() => true).catch(() => false), true);
    await releaseBrowserLease(port, lease);
    assert.equal(await fs.stat(browserLockDir(port)).then(() => true).catch(() => false), false);
  });

  it("rejects a second lease while the owner process is alive", async () => {
    await acquireBrowserLease(port, "test:first", {});
    await assert.rejects(() => acquireBrowserLease(port, "test:second", {}), /already held/);
  });

  it("reclaims a stale lease when the recorded pid is dead", async () => {
    const lockDir = browserLockDir(port);
    await fs.mkdir(path.dirname(lockDir), { recursive: true });
    await fs.mkdir(lockDir);
    await fs.writeFile(
      path.join(lockDir, "meta.json"),
      `${JSON.stringify({
        owner: "dead-process",
        pid: 999_999,
        startedAt: new Date().toISOString(),
      })}\n`,
      "utf8"
    );

    const lease = await acquireBrowserLease(port, "test:reclaim", {});
    assert.equal(lease.owner, "test:reclaim");
  });

  it("does not release a lease owned by another acquisition", async () => {
    const lease = await acquireBrowserLease(port, "test:owner", {});
    await assert.rejects(
      () => releaseBrowserLease(port, { ...lease, leaseId: "wrong-token" }),
      /Refusing to release/
    );
    assert.equal(await fs.stat(browserLockDir(port)).then(() => true).catch(() => false), true);
    await releaseBrowserLease(port, lease);
  });
});

describe("browser-harness Bilibili reply responses", () => {
  it("matches successful Bilibili reply API responses", () => {
    assert.equal(
      isBilibiliReplyResponse(createResponse("https://api.bilibili.com/x/v2/reply/wbi/main?oid=1")),
      true
    );
    assert.equal(
      isBilibiliReplyResponse(createResponse("https://api.bilibili.com/x/v2/reply/subject/description?oid=1")),
      true
    );
    assert.equal(isBilibiliReplyResponse(createResponse("https://www.bilibili.com/video/BV1")), false);
    assert.equal(
      isBilibiliReplyResponse(createResponse("https://api.bilibili.com/x/v2/reply/wbi/main", { status: 500 })),
      false
    );
    assert.equal(
      isBilibiliReplyResponse(
        createResponse("https://api.bilibili.com/x/v2/reply/wbi/main", { status: 500 }),
        { requireOk: false }
      ),
      true
    );
  });

  it("summarizes response details for recorder events", () => {
    assert.deepEqual(
      summarizeNetworkResponse(createResponse("https://api.bilibili.com/x/v2/reply?oid=1", { method: "POST" })),
      {
        status: 200,
        method: "POST",
        url: "https://api.bilibili.com/x/v2/reply?oid=1",
      }
    );
  });

  it("registers waitForResponse before triggering the action", async () => {
    const calls = [];
    const response = createResponse("https://api.bilibili.com/x/v2/reply/wbi/main?oid=1");
    const page = {
      waitForResponse(predicate, options) {
        calls.push(`wait:${options.timeout}`);
        assert.equal(predicate(response), true);
        return Promise.resolve(response);
      },
    };

    const matched = await waitForBilibiliReplyResponse(
      page,
      async () => {
        calls.push("action");
      },
      { timeoutMs: 1234 }
    );

    assert.equal(matched, response);
    assert.deepEqual(calls, ["wait:1234", "action"]);
  });

  it("returns null when the reply response wait times out", async () => {
    const page = {
      waitForResponse() {
        return Promise.reject(new Error("Timeout 3000ms exceeded"));
      },
    };

    const matched = await waitForBilibiliReplyResponse(page, async () => {}, { timeoutMs: 1 });
    assert.equal(matched, null);
  });
});

describe("browser-harness Bilibili video locators", () => {
  it("normalizes Bilibili video hrefs and rejects non-video links", () => {
    assert.equal(
      normalizeBilibiliVideoHref("//www.bilibili.com/video/BV1abc/?spm_id=1#reply", "https://www.bilibili.com/"),
      "https://www.bilibili.com/video/BV1abc/"
    );
    assert.equal(normalizeBilibiliVideoHref("https://space.bilibili.com/1"), null);
    assert.equal(normalizeBilibiliVideoHref("https://example.com/video/BV1abc"), null);
  });

  it("returns the first visible BV video link via Locator candidates", async () => {
    const page = createFakeVideoLinkPage([
      {
        href: "https://www.bilibili.com/video/BVhidden/",
        box: { width: 10, height: 10 },
        text: "too small",
      },
      {
        href: "/video/BVvisible/?vd_source=abc",
        box: { width: 120, height: 80 },
        text: "  visible   title  ",
      },
    ]);

    assert.deepEqual(await getFirstVisibleBilibiliVideoLink(page), {
      href: "https://www.bilibili.com/video/BVvisible/",
      text: "visible title",
    });
  });

  it("returns null when no visible BV link is found", async () => {
    const page = createFakeVideoLinkPage([
      {
        href: "https://www.bilibili.com/read/cv1",
        box: { width: 120, height: 80 },
        text: "article",
      },
      {
        href: "https://www.bilibili.com/video/BVnone/",
        box: null,
        text: "not visible",
      },
    ]);

    assert.equal(await getFirstVisibleBilibiliVideoLink(page), null);
  });
});

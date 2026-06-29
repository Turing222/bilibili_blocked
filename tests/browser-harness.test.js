import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, afterEach } from "node:test";

import {
  acquireBrowserLease,
  browserLockDir,
  releaseBrowserLease,
  scrollUntil,
} from "../scripts/lib/browser-harness.js";

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
    assert.equal(await fs.stat(browserLockDir(port)).then(() => true).catch(() => false), true);
    await releaseBrowserLease(port);
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
});

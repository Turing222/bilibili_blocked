import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;

function cleanLocatorText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function browserLockDir(port = 9223) {
  return path.resolve("artifacts/locks", `browser-${port}.lock`);
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLockMeta(lockDir) {
  try {
    const raw = await fs.readFile(path.join(lockDir, "meta.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function acquireBrowserLease(port, owner, meta = {}) {
  const lockDir = browserLockDir(port);
  await fs.mkdir(path.dirname(lockDir), { recursive: true });

  try {
    await fs.mkdir(lockDir);
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }

    const existing = await readLockMeta(lockDir);
    const staleByPid = existing?.pid && !isProcessAlive(existing.pid);
    const staleByTtl =
      existing?.startedAt &&
      Date.now() - Date.parse(existing.startedAt) > DEFAULT_LOCK_TTL_MS;

    if (!staleByPid && !staleByTtl) {
      const busy = new Error(
        `Browser lease already held by ${existing?.owner ?? "unknown"} (pid=${existing?.pid ?? "?"}). ` +
          `Stop that process or remove ${lockDir} if stale.`
      );
      busy.cause = error;
      throw busy;
    }

    await fs.rm(lockDir, { recursive: true, force: true });
    await fs.mkdir(lockDir);
  }

  const payload = {
    owner,
    pid: process.pid,
    leaseId: randomUUID(),
    startedAt: new Date().toISOString(),
    ...meta,
  };
  await fs.writeFile(path.join(lockDir, "meta.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { lockDir, ...payload };
}

export async function releaseBrowserLease(port, lease = null) {
  const lockDir = browserLockDir(port);

  if (lease) {
    const existing = await readLockMeta(lockDir);
    if (!existing) {
      return;
    }
    if (
      existing.owner !== lease.owner ||
      existing.pid !== lease.pid ||
      existing.leaseId !== lease.leaseId
    ) {
      throw new Error(
        `Refusing to release browser lease owned by ${existing.owner ?? "unknown"} ` +
          `(pid=${existing.pid ?? "?"}).`
      );
    }
  }

  await fs.rm(lockDir, { recursive: true, force: true });
}

export async function withBrowserLease(port, owner, meta, fn) {
  const lease = await acquireBrowserLease(port, owner, meta);
  try {
    return await fn();
  } finally {
    await releaseBrowserLease(port, lease);
  }
}

export function isBilibiliReplyResponse(response, { requireOk = true } = {}) {
  const rawUrl = response?.url?.() ?? "";
  if (!rawUrl) {
    return false;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (
    (url.hostname !== "bilibili.com" && !url.hostname.endsWith(".bilibili.com")) ||
    !url.pathname.startsWith("/x/v2/reply")
  ) {
    return false;
  }

  if (requireOk && response.status?.() !== 200) {
    return false;
  }

  return true;
}

export function summarizeNetworkResponse(response) {
  return {
    status: response?.status?.() ?? null,
    method: response?.request?.()?.method?.() ?? null,
    url: response?.url?.() ?? "",
  };
}

export async function waitForBilibiliReplyResponse(page, action, {
  timeoutMs = 5000,
  requireOk = true,
} = {}) {
  const responsePromise = page
    .waitForResponse((response) => isBilibiliReplyResponse(response, { requireOk }), { timeout: timeoutMs })
    .catch((error) => {
      if (/timeout/i.test(error?.message ?? "")) {
        return null;
      }
      throw error;
    });

  try {
    await action();
  } catch (error) {
    await responsePromise.catch(() => null);
    throw error;
  }

  return responsePromise;
}

export function normalizeBilibiliVideoHref(href, baseUrl = "https://www.bilibili.com/") {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(String(href), baseUrl);
    if (url.hostname !== "www.bilibili.com" || !url.pathname.startsWith("/video/BV")) {
      return null;
    }
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export async function getFirstVisibleBilibiliVideoLink(page, {
  maxCandidates = 80,
  minWidth = 20,
  minHeight = 20,
} = {}) {
  const links = page.locator('a[href*="/video/"]');
  const count = Math.min(await links.count(), maxCandidates);
  const baseUrl = page.url?.() || "https://www.bilibili.com/";

  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const href = normalizeBilibiliVideoHref(await link.getAttribute("href").catch(() => null), baseUrl);
    if (!href) {
      continue;
    }

    const box = await link.boundingBox().catch(() => null);
    if (!box || box.width < minWidth || box.height < minHeight) {
      continue;
    }

    const text =
      (await link.innerText({ timeout: 500 }).catch(() => "")) ||
      (await link.getAttribute("title").catch(() => "")) ||
      (await link.getAttribute("aria-label").catch(() => ""));

    return { href, text: cleanLocatorText(text) };
  }

  return null;
}

export async function scrollUntil(page, predicate, {
  maxAttempts = 20,
  step = 600,
  timeoutMs = 20_000,
  onStep,
  useWheel = true,
} = {}) {
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await predicate(attempt)) {
      return;
    }

    if (useWheel) {
      await page.mouse.wheel(0, step);
      await page
        .waitForFunction(
          "document.readyState !== 'loading'",
          null,
          { timeout: Math.max(250, Math.min(1000, deadline - Date.now())) }
        )
        .catch(() => {});
    }

    if (typeof onStep === "function") {
      await onStep(attempt);
    }

    if (Date.now() >= deadline) {
      break;
    }
  }

  throw new Error("Target state did not appear after bounded scrolling");
}

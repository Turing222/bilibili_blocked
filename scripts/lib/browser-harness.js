import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;

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
    startedAt: new Date().toISOString(),
    ...meta,
  };
  await fs.writeFile(path.join(lockDir, "meta.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { lockDir, ...payload };
}

export async function releaseBrowserLease(port) {
  const lockDir = browserLockDir(port);
  await fs.rm(lockDir, { recursive: true, force: true });
}

export async function withBrowserLease(port, owner, meta, fn) {
  await acquireBrowserLease(port, owner, meta);
  try {
    return await fn();
  } finally {
    await releaseBrowserLease(port);
  }
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

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  readArg,
  cleanText,
  createRunId,
  createRecorder,
  toRelative,
  writeRunFiles,
  selectPage,
} from "./lib/harness.js";
import { injectUserscriptInBrowser } from "./lib/userscript-runtime.js";
import { acquireBrowserLease, releaseBrowserLease, scrollUntil } from "./lib/browser-harness.js";

const port = Number(readArg("--port") ?? 9223);
const pageUrl = readArg("--url") ?? "https://www.bilibili.com/";
const userscriptPath = path.resolve(readArg("--userscript") ?? "dist/bilibili_blocked_videos_by_tags.user.js");
const outputRoot = path.resolve(readArg("--output-dir") ?? "artifacts/playwright/video-card-timing");
const endpoint = `http://127.0.0.1:${port}`;

async function ensureFeedPage(page, recorder) {
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(6000);
  recorder.mark("page.ready", {
    url: page.url(),
    title: cleanText(await page.title().catch(() => "")),
  });
}

async function installHarness(page) {
  await page.evaluate(() => {
    const videoSelector = [
      "div.bili-video-card",
      "div.video-page-card-small",
      "li.bili-rank-list-video__item",
      "div.video-card",
      "li.rank-item",
      "div.video-card-reco",
      "div.video-card-common",
      "div.rank-wrap",
    ].join(", ");

    const startedAt = performance.now();
    let nextId = 1;
    const cards = new Map();
    const events = [];

    function now() {
      return Math.round(performance.now() - startedAt);
    }

    function clean(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    function push(kind, data = {}) {
      events.push({
        t: now(),
        kind,
        ...data,
      });
    }

    function collectCards(root) {
      if (!root || typeof root !== "object") {
        return [];
      }

      const matches = [];
      if (root.matches?.(videoSelector)) {
        matches.push(root);
      }
      if (root.querySelectorAll) {
        matches.push(...root.querySelectorAll(videoSelector));
      }

      return [...new Set(matches)].filter((element) => element?.querySelector?.("a"));
    }

    function collectOverlays(root) {
      if (!root || typeof root !== "object") {
        return [];
      }

      const overlays = [];
      if (root.classList?.contains("blockedOverlay")) {
        overlays.push(root);
      }
      if (root.querySelectorAll) {
        overlays.push(...root.querySelectorAll(".blockedOverlay"));
      }
      return [...new Set(overlays)];
    }

    function readTitle(card) {
      return clean(card.querySelector?.("[title]:not(span)")?.title || "");
    }

    function ensureCardInfo(card) {
      if (!card.dataset.bbvtSmokeId) {
        card.dataset.bbvtSmokeId = String(nextId++);
      }

      const id = card.dataset.bbvtSmokeId;
      let info = cards.get(id);
      if (!info) {
        info = {
          id,
          firstSeenAt: now(),
          addedAt: null,
          overlayAt: null,
          pendingEvents: 0,
          firstChildClassName: card.firstElementChild?.className || "",
          titleAtFirstSeen: readTitle(card),
        };
        cards.set(id, info);
        push("card.seen", {
          id,
          firstChildClassName: info.firstChildClassName,
          title: clean(info.titleAtFirstSeen).slice(0, 80),
        });
      }

      return info;
    }

    function recordAdded(card) {
      const info = ensureCardInfo(card);
      if (info.addedAt !== null) {
        return;
      }

      info.addedAt = now();
      info.titleAtAdded = readTitle(card);
      info.firstChildClassName = card.firstElementChild?.className || info.firstChildClassName;
      push("card.added", {
        id: info.id,
        firstChildClassName: info.firstChildClassName,
        title: clean(info.titleAtAdded).slice(0, 80),
      });
    }

    function recordOverlay(card) {
      const info = ensureCardInfo(card);
      if (info.overlayAt !== null) {
        return;
      }

      info.overlayAt = now();
      info.firstChildClassName = card.firstElementChild?.className || info.firstChildClassName;
      info.overlayLatency = info.addedAt === null ? null : info.overlayAt - info.addedAt;
      push("card.overlay", {
        id: info.id,
        firstChildClassName: info.firstChildClassName,
        overlayLatency: info.overlayLatency,
      });
    }

    function recordBlockedState(card) {
      const info = ensureCardInfo(card);
      const state = card.dataset.bbvtBlocked || "";
      if (state === "pending") {
        info.pendingEvents++;
      }
      push("card.blocked-state", {
        id: info.id,
        firstChildClassName: info.firstChildClassName,
        state,
      });
    }

    collectCards(document).forEach((card) => {
      ensureCardInfo(card);
      if (card.querySelector?.(":scope > .blockedOverlay")) {
        recordOverlay(card);
      }
    });

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "attributes" && record.attributeName === "data-bbvt-blocked") {
          if (record.target?.matches?.(videoSelector)) {
            recordBlockedState(record.target);
          }
          return;
        }

        if (record.type !== "childList") {
          return;
        }

        [...record.addedNodes].forEach((node) => {
          collectCards(node).forEach((card) => recordAdded(card));
          collectOverlays(node).forEach((overlay) => {
            const card = overlay.parentElement;
            if (card?.matches?.(videoSelector)) {
              recordOverlay(card);
            }
          });
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-bbvt-blocked"],
    });

    window.__bbvtVideoTiming = {
      disconnect() {
        observer.disconnect();
      },
      snapshot() {
        const items = [...cards.values()];
        const addedCards = items.filter((item) => item.addedAt !== null);
        const addedOverlayCards = addedCards.filter((item) => item.overlayAt !== null);

        return {
          url: location.href,
          title: document.title,
          totalCardCount: items.length,
          overlayCount: items.filter((item) => item.overlayAt !== null).length,
          pendingEventCount: items.reduce((sum, item) => sum + item.pendingEvents, 0),
          addedCardCount: addedCards.length,
          addedOverlayCount: addedOverlayCards.length,
          addedOverlayLatencies: addedOverlayCards
            .map((item) => item.overlayLatency)
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b),
          samples: items.slice(0, 20),
          recentEvents: events.slice(-120),
        };
      },
    };
  });
}

function createTimingSettings() {
  return {
    uiFeatureSwitchVersion: 1,
    scriptEnabled_Switch: true,
    floatingEntryVisible_Switch: true,
    hideNonVideoElements_Switch: false,
    blockedOverlayOnlyDisplaysType_Switch: false,
    hideVideoMode_Switch: false,
    legacyCardBoxOverlayDelay_Switch: false,
    consoleOutputLog_Switch: false,
    hideBlockedWordsInMenu_Switch: false,
    accumulateBlockedRules_Switch: false,
    blockedTitle_Switch: true,
    blockedTitle_UseRegular: true,
    blockedTitle_Array: [".*"],
    blockedUpUid_Switch: false,
    blockedUpUid_Array: [],
    blockedUpNameKeyword_Switch: false,
    blockedUpNameKeyword_Array: [],
    blockedVideoPartitions_Switch: false,
    blockedVideoPartitions_Array: [],
    blockedTag_Switch: false,
    blockedTag_Array: [],
    doubleBlockedTag_Switch: false,
    doubleBlockedTag_Array: [],
    blockedCommentText_Switch: false,
    blockedCommentText_Array: [],
    blockedCommentUser_Switch: false,
    blockedCommentUser_Array: [],
    blockedFilteredCommentsVideo_Switch: false,
    blockedTopComment_Switch: false,
    blockedTopComment_Array: [],
    whitelistUpUid_Switch: false,
    whitelistUpUid_Array: [],
    whitelistBv_Switch: false,
    whitelistBv_Array: [],
  };
}

async function injectUserscript(page, userscriptSource, settings, recorder) {
  await page.evaluate(injectUserscriptInBrowser, {
    source: userscriptSource,
    initialSettings: settings,
    storageKey: "__bbvtVideoTimingStorage",
    writeLogKey: "__bbvtVideoTimingGmWrites",
    injectedAtKey: "__bbvtVideoTimingInjectedAt",
    sourceUrl: "bbvt-video-card-timing.user.js",
    dispatchLoad: true,
  });

  recorder.mark("userscript.injected", {
    blockedTitleRule: settings.blockedTitle_Array[0],
  });
}

async function readSnapshot(page) {
  return page.evaluate(() => window.__bbvtVideoTiming?.snapshot?.() ?? null);
}

async function waitForSnapshot(page, label, predicate, recorder, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt <= timeoutMs) {
    lastSnapshot = await readSnapshot(page);
    if (predicate(lastSnapshot)) {
      recorder.mark("state.ok", summarizeSnapshot(label, lastSnapshot));
      return lastSnapshot;
    }
    await page.waitForTimeout(250);
  }

  recorder.mark("state.timeout", summarizeSnapshot(label, lastSnapshot));
  throw new Error(`Timed out waiting for ${label}`);
}

function summarizeSnapshot(label, snapshot) {
  return {
    label,
    totalCardCount: snapshot?.totalCardCount ?? 0,
    overlayCount: snapshot?.overlayCount ?? 0,
    pendingEventCount: snapshot?.pendingEventCount ?? 0,
    addedCardCount: snapshot?.addedCardCount ?? 0,
    addedOverlayCount: snapshot?.addedOverlayCount ?? 0,
    addedOverlayLatencies: snapshot?.addedOverlayLatencies?.slice(0, 10) ?? [],
  };
}

async function scrollForMoreCards(page, recorder) {
  let snapshot = null;

  try {
    await scrollUntil(
      page,
      async (attempt) => {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        }).catch(() => {});
        await page.waitForTimeout(1500);
        snapshot = await readSnapshot(page);
        recorder.mark("page.scroll", {
          step: attempt + 1,
          totalCardCount: snapshot?.totalCardCount ?? 0,
          addedCardCount: snapshot?.addedCardCount ?? 0,
          addedOverlayCount: snapshot?.addedOverlayCount ?? 0,
          addedOverlayLatencies: snapshot?.addedOverlayLatencies?.slice(0, 5) ?? [],
        });
        return (snapshot?.addedOverlayCount ?? 0) > 0;
      },
      { maxAttempts: 6, useWheel: false, timeoutMs: 15_000 }
    );
  } catch {
    snapshot = snapshot ?? (await readSnapshot(page));
  }

  return snapshot;
}

async function runTiming(runDir, recorder) {
  let browser;
  const lease = await acquireBrowserLease(port, "pw:video-card-timing", { pageUrl });

  try {
    recorder.mark("run.start", {
      endpoint,
      pageUrl,
      userscriptPath: toRelative(userscriptPath),
    });

    const userscriptSource = await fs.readFile(userscriptPath, "utf8");
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error(`No browser context found at ${endpoint}`);
    }
    recorder.mark("browser.connected", { contextCount: browser.contexts().length });

    const page = await selectPage(context, ["www.bilibili.com"]);
    await page.bringToFront();
    await ensureFeedPage(page, recorder);
    await installHarness(page);
    await injectUserscript(page, userscriptSource, createTimingSettings(), recorder);

    const initialBlocked = await waitForSnapshot(
      page,
      "initial card overlays",
      (snapshot) => (snapshot?.overlayCount ?? 0) > 0,
      recorder
    );

    if ((initialBlocked.pendingEventCount ?? 0) > 0) {
      throw new Error("Observed pending card state even though legacy card-box delay is disabled.");
    }

    await scrollForMoreCards(page, recorder);
    const fastPath = await waitForSnapshot(
      page,
      "new cards blocked via fast path",
      (snapshot) => (snapshot?.addedOverlayLatencies ?? []).some((latency) => latency < 250),
      recorder
    );

    const result = {
      ok: true,
      endpoint,
      pageUrl,
      initialBlocked,
      fastPath,
      summary: {
        overlayCount: fastPath.overlayCount,
        pendingEventCount: fastPath.pendingEventCount,
        addedCardCount: fastPath.addedCardCount,
        addedOverlayCount: fastPath.addedOverlayCount,
        fastestAddedOverlayLatency: fastPath.addedOverlayLatencies?.[0] ?? null,
      },
    };

    recorder.mark("run.end", result.summary);
    const paths = await writeRunFiles(runDir, result, recorder.events);
    return { result, paths };
  } catch (error) {
    recorder.mark("run.error", { message: error.message });
    const result = {
      ok: false,
      endpoint,
      pageUrl,
      error: {
        message: error.message,
        stack: error.stack,
      },
    };
    const paths = await writeRunFiles(runDir, result, recorder.events);
    error.artifactPaths = paths;
    throw error;
  } finally {
    await browser?.close().catch(() => {});
    await releaseBrowserLease(port, lease);
  }
}

async function main() {
  const runDir = path.join(outputRoot, createRunId());
  await fs.mkdir(runDir, { recursive: true });
  const recorder = createRecorder();
  const { result, paths } = await runTiming(runDir, recorder);

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        artifactDir: toRelative(runDir),
        resultPath: toRelative(paths.resultPath),
        eventsPath: toRelative(paths.eventsPath),
        endpoint,
        pageUrl,
        summary: result.summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  if (error.artifactPaths) {
    console.error(`Video card timing smoke failed. result=${toRelative(error.artifactPaths.resultPath)}`);
  }
  console.error(error.stack || error.message);
  process.exit(1);
});

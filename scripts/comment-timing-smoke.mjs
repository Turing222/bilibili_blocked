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
import {
  installBilibiliDomHelpers,
  collectCommentTimingState as collectCommentTimingStateInBrowser,
  moveAcrossPlaceholderInBrowser,
  leavePlaceholderInBrowser,
  clickReasonRemoveInBrowser,
  checkCommentQuickBlockMarkerInBrowser,
} from "./lib/bilibili-dom.js";
import { injectUserscriptInBrowser } from "./lib/userscript-runtime.js";
import { acquireBrowserLease, releaseBrowserLease, scrollUntil } from "./lib/browser-harness.js";

const port = Number(readArg("--port") ?? 9223);
const videoUrl = readArg("--video");
const outputRoot = path.resolve(readArg("--output-dir") ?? "artifacts/playwright/comment-timing");
const userscriptPath = path.resolve(readArg("--userscript") ?? "dist/bilibili_blocked_videos_by_tags.user.js");
const openFirstVideo = process.argv.includes("--open-first-video") || !videoUrl;
const noInject = process.argv.includes("--no-inject");
const endpoint = `http://127.0.0.1:${port}`;

async function ensureDomHelpers(page) {
  await page.evaluate(installBilibiliDomHelpers);
}

async function collectCommentTimingState(page, keyword) {
  return page.evaluate(collectCommentTimingStateInBrowser, keyword);
}

async function getFirstVideo(page) {
  return page.evaluate(() => {
    for (const link of document.querySelectorAll('a[href*="/video/"]')) {
      const rect = link.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) {
        continue;
      }
      const url = new URL(link.getAttribute("href"), location.href);
      if (url.hostname !== "www.bilibili.com" || !url.pathname.startsWith("/video/BV")) {
        continue;
      }
      const href = url.href.split("?")[0];
      const text = (link.innerText || link.title || link.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim();
      return { href, text };
    }
    return null;
  });
}

async function ensureVideoPage(page, recorder) {
  await page.bringToFront();
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});

  if (videoUrl) {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(7000);
    recorder.mark("video.opened", { href: videoUrl, url: page.url() });
    return { href: videoUrl, text: "" };
  }

  if (!page.url().startsWith("https://www.bilibili.com/")) {
    await page.goto("https://www.bilibili.com/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(5000);
    recorder.mark("page.home", { url: page.url() });
  }

  if (page.url().startsWith("https://www.bilibili.com/video/BV")) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(7000);
    recorder.mark("video.reloaded", { url: page.url() });
    return null;
  }

  if (!openFirstVideo) {
    return null;
  }

  const firstVideo = await getFirstVideo(page);
  recorder.mark("video.candidate", { href: firstVideo?.href ?? null, text: cleanText(firstVideo?.text) });
  if (firstVideo?.href) {
    await page.goto(firstVideo.href, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(7000);
    recorder.mark("video.opened", { href: firstVideo.href, url: page.url() });
  }
  return firstVideo;
}

async function loadComments(page, recorder) {
  let snapshot = null;
  const scrollPositions = [500, 900, 1300, 1800, 2400, 3200, 4200, 5600];
  let positionIndex = 0;

  try {
    await scrollUntil(
      page,
      async () => {
        const scrollY = scrollPositions[Math.min(positionIndex, scrollPositions.length - 1)];
        positionIndex += 1;
        await page.evaluate((y) => {
          window.focus();
          window.scrollTo(0, y);
          document.querySelector("video")?.pause();
        }, scrollY).catch(() => {});
        await page.waitForTimeout(1500);
        snapshot = await collectCommentTimingState(page, "");
        recorder.mark("comments.sample", {
          scrollY,
          commentCount: snapshot.commentCount,
          placeholderCount: snapshot.placeholderCount,
          overlayCount: snapshot.overlayCount,
          firstText: cleanText(snapshot.firstComment?.text),
        });
        return Boolean(snapshot.firstComment?.text);
      },
      { maxAttempts: scrollPositions.length, useWheel: false, timeoutMs: 30_000 }
    );
  } catch {
    snapshot = snapshot ?? (await collectCommentTimingState(page, ""));
  }

  return snapshot;
}

function deriveKeyword(commentText) {
  const cleaned = cleanText(commentText, 80);
  const contiguousText = cleaned.split(/\s+/).find((part) => part.length >= 4);
  const candidate = contiguousText || cleaned.replace(/\s+/g, "");
  if (candidate.length <= 8) {
    return candidate;
  }
  return candidate.slice(0, 8);
}

function createTimingSettings(keyword) {
  return {
    uiFeatureSwitchVersion: 1,
    scriptEnabled_Switch: true,
    floatingEntryVisible_Switch: true,
    blockedCommentText_Switch: true,
    blockedCommentText_UseRegular: false,
    blockedCommentText_Array: [keyword],
    blockedCommentUser_Switch: false,
    blockedCommentUser_Array: [],
    blockedCommentImage_Switch: false,
    hideCommentMode_Switch: false,
    blockedFilteredCommentsVideo_Switch: false,
    blockedTopComment_Switch: false,
    blockedTopComment_Array: [],
    hideVideoMode_Switch: false,
    consoleOutputLog_Switch: false,
    hideNonVideoElements_Switch: false,
    blockedTitle_Array: [],
    blockedUpUid_Array: [],
    blockedUpNameKeyword_Array: [],
    blockedVideoPartitions_Array: [],
    blockedTag_Array: [],
    doubleBlockedTag_Array: [],
    blockedUpSigns_Array: [],
    whitelistUpUid_Array: [],
    whitelistBv_Array: [],
  };
}

async function injectUserscript(page, userscriptSource, settings, recorder) {
  await page.evaluate(injectUserscriptInBrowser, {
    source: userscriptSource,
    initialSettings: settings,
    storageKey: "__bbvtTimingStorage",
    writeLogKey: "__bbvtTimingGmWrites",
    injectedAtKey: "__bbvtTimingInjectedAt",
    sourceUrl: "bbvt-comment-timing.user.js",
    dispatchLoad: true,
  });

  recorder.mark("userscript.injected", {
    keyword: settings.blockedCommentText_Array[0],
    settingsKeys: Object.keys(settings).length,
  });
}

async function waitForState(page, keyword, label, predicate, recorder, timeoutMs = 7000) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt <= timeoutMs) {
    lastState = await collectCommentTimingState(page, keyword);
    if (predicate(lastState)) {
      recorder.mark("state.ok", summarizeState(label, lastState));
      return lastState;
    }
    await page.waitForTimeout(250);
  }

  recorder.mark("state.timeout", summarizeState(label, lastState));
  throw new Error(`Timed out waiting for ${label}`);
}

function summarizeState(label, state) {
  return {
    label,
    commentCount: state?.commentCount ?? 0,
    placeholderCount: state?.placeholderCount ?? 0,
    floatingButtonText: state?.floatingButtonText ?? "",
    targetFound: Boolean(state?.target),
    targetBlocked: Boolean(state?.target?.blocked),
    targetBlockMode: state?.target?.blockMode ?? "",
    targetDisplay: state?.target?.computedDisplay ?? "",
    targetVisibility: state?.target?.computedVisibility ?? "",
    placeholderText: cleanText(state?.target?.placeholderText, 160),
  };
}

async function moveAcrossPlaceholder(page, keyword) {
  return page.evaluate(moveAcrossPlaceholderInBrowser, keyword);
}

async function leavePlaceholder(page, keyword) {
  return page.evaluate(leavePlaceholderInBrowser, keyword);
}

async function toggleFloatingEntry(page) {
  return page.evaluate(() => {
    const button = document.querySelector("#bbvtFloatingEntry .bbvt-fe-main");
    if (!button) {
      return false;
    }
    button.click();
    return true;
  });
}

async function clickReasonRemove(page, keyword) {
  return page.evaluate(clickReasonRemoveInBrowser, keyword);
}

async function checkCommentQuickBlockMarker(page, keyword) {
  return page.evaluate(checkCommentQuickBlockMarkerInBrowser, keyword);
}

async function triggerRefresh(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(400);
}

async function runTiming(runDir, recorder) {
  let browser;
  await acquireBrowserLease(port, "pw:comment-timing", {
    pageUrl: videoUrl ?? null,
  });

  try {
    recorder.mark("run.start", {
      endpoint,
      videoUrl: videoUrl ?? null,
      userscriptPath: toRelative(userscriptPath),
      noInject,
    });

    const userscriptSource = noInject ? "" : await fs.readFile(userscriptPath, "utf8");
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error(`No browser context found at ${endpoint}`);
    }
    recorder.mark("browser.connected", { contextCount: browser.contexts().length });

    const page = await selectPage(context, ["www.bilibili.com/video/", "bilibili.com"]);
    await page.bringToFront();
    recorder.mark("page.selected", { url: page.url() });

    const openedVideo = await ensureVideoPage(page, recorder);
    await ensureDomHelpers(page);
    const video = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      aid: window.__INITIAL_STATE__?.aid || window.__INITIAL_STATE__?.videoData?.aid || null,
      bvid:
        window.__INITIAL_STATE__?.bvid ||
        window.__INITIAL_STATE__?.videoData?.bvid ||
        location.pathname.match(/BV[^/?#]+/)?.[0] ||
        null,
    }));
    recorder.mark("video.state", { aid: video.aid, bvid: video.bvid, url: video.url });

    const before = await loadComments(page, recorder);
    if (!before.firstComment?.text) {
      throw new Error("No rendered comment text was found after scrolling the video page.");
    }

    const keyword = deriveKeyword(before.firstComment.text);
    if (!keyword) {
      throw new Error("Could not derive a comment keyword from the first rendered comment.");
    }
    recorder.mark("keyword.selected", {
      keyword,
      firstComment: cleanText(before.firstComment.text),
    });

    if (!noInject) {
      await injectUserscript(page, userscriptSource, createTimingSettings(keyword), recorder);
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event("load")));
    }

    const hidden = await waitForState(
      page,
      keyword,
      "comment hidden by keyword rule",
      (state) =>
        state.target?.blocked === true &&
        state.target?.computedVisibility === "hidden" &&
        state.target?.placeholderFound === true,
      recorder
    );

    const peeked = await moveAcrossPlaceholder(page, keyword);
    recorder.mark("ui.peek", peeked);
    if (
      peeked.afterBody.targetVisibility === "hidden" ||
      peeked.afterBody.veilOpacity === "1" ||
      !peeked.afterBody.overlayPeeking ||
      !peeked.afterBody.commentPeeking ||
      !peeked.afterBody.detailsToggleFound
    ) {
      throw new Error("Comment overlay hover peek did not keep the expected hidden/visible states.");
    }

    await triggerRefresh(page);
    const peekedAfterRefresh = await collectCommentTimingState(page, keyword);
    recorder.mark("ui.peek.refresh", summarizeState("comment peek after refresh", peekedAfterRefresh));
    if (
      peekedAfterRefresh.target?.computedVisibility === "hidden" ||
      peekedAfterRefresh.target?.placeholderFound !== true
    ) {
      throw new Error("Comment overlay peek was lost after refresh.");
    }

    const unpeeked = await leavePlaceholder(page, keyword);
    recorder.mark("ui.peek.leave", unpeeked);
    if (unpeeked.targetVisibility !== "hidden" || unpeeked.overlayPeeking || unpeeked.commentPeeking) {
      throw new Error("Comment overlay did not hide again after pointer leave.");
    }

    const hiddenAfterPeek = await waitForState(
      page,
      keyword,
      "comment hidden after hover peek",
      (state) =>
        state.target?.blocked === true &&
        state.target?.computedVisibility === "hidden" &&
        state.target?.placeholderFound === true,
      recorder
    );

    const removedRule = await clickReasonRemove(page, keyword);
    recorder.mark("ui.rule.remove", removedRule);
    if (
      !removedRule.found ||
      !removedRule.toggleFound ||
      !removedRule.panelFound ||
      !removedRule.buttonFound ||
      removedRule.afterControlMove?.targetVisibility !== "hidden" ||
      removedRule.afterControlMove?.overlayPeeking ||
      removedRule.afterControlMove?.commentPeeking
    ) {
      throw new Error("Could not click the comment rule remove button.");
    }

    const restoredByRuleRemoval = await waitForState(
      page,
      keyword,
      "comment restored after removing keyword rule",
      (state) =>
        state.target &&
        state.target.blocked === false &&
        state.target.computedVisibility !== "hidden" &&
        state.target.placeholderFound === false &&
        !state.storage?.blockedCommentText_Array?.includes(keyword),
      recorder
    );

    const quickBlockMarker = await checkCommentQuickBlockMarker(page, keyword);
    recorder.mark("ui.quick-block.marker", quickBlockMarker);
    if (
      !quickBlockMarker.targetFound ||
      !quickBlockMarker.afterEnter?.triggerFound ||
      !quickBlockMarker.afterEnter?.markerFound ||
      quickBlockMarker.afterEnter?.markerWidth <= 0 ||
      quickBlockMarker.afterEnter?.markerHeight <= 0 ||
      !quickBlockMarker.afterEnter?.targetMarked ||
      !quickBlockMarker.afterEnter?.anchorStableAfterScroll ||
      quickBlockMarker.afterLeave?.markerFound ||
      !quickBlockMarker.afterLeave?.triggerHidden ||
      quickBlockMarker.afterLeave?.targetMarked
    ) {
      throw new Error("Comment quick-block target marker did not appear and clear as expected.");
    }

    const toggledOff = await toggleFloatingEntry(page);
    recorder.mark("ui.click", { action: "toggle-script-off", clicked: toggledOff });
    if (!toggledOff) {
      throw new Error("Could not click the floating entry main button.");
    }

    const restored = await waitForState(
      page,
      keyword,
      "comment restored after script off",
      (state) =>
        state.target &&
        state.target.blocked === false &&
        state.target.computedVisibility !== "hidden" &&
        state.target.placeholderFound === false &&
        state.floatingButtonText.startsWith("关"),
      recorder
    );

    const result = {
      ok: true,
      endpoint,
      openedVideo: openedVideo ? { ...openedVideo, text: cleanText(openedVideo.text) } : null,
      video: { ...video, title: cleanText(video.title) },
      keyword,
      states: {
        before,
        hidden,
        peeked,
        peekedAfterRefresh,
        hiddenAfterPeek,
        restoredByRuleRemoval,
        restored,
      },
    };

    recorder.mark("run.end", { ok: true, keyword });
    await writeRunFiles(runDir, result, recorder.events);
    return result;
  } catch (error) {
    recorder.mark("run.end", { ok: false, error: error.message });
    await writeRunFiles(runDir, { ok: false, error: error.message }, recorder.events);
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await releaseBrowserLease(port);
  }
}

async function main() {
  const runId = createRunId();
  const runDir = path.join(outputRoot, runId);
  await fs.mkdir(runDir, { recursive: true });
  const recorder = createRecorder();
  const result = await runTiming(runDir, recorder);
  console.log(JSON.stringify({ ok: result.ok, runDir: toRelative(runDir), keyword: result.keyword }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

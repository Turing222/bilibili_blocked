import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const port = Number(readArg("--port") ?? 9223);
const videoUrl = readArg("--video");
const outputRoot = path.resolve(readArg("--output-dir") ?? "artifacts/playwright/comment-timing");
const userscriptPath = path.resolve(readArg("--userscript") ?? "dist/bilibili_blocked_videos_by_tags.user.js");
const openFirstVideo = process.argv.includes("--open-first-video") || !videoUrl;
const noInject = process.argv.includes("--no-inject");
const endpoint = `http://127.0.0.1:${port}`;

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function cleanText(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createRecorder() {
  const startedAt = Date.now();
  const events = [];
  return {
    events,
    mark(kind, data = {}) {
      events.push({
        t: Date.now() - startedAt,
        ts: new Date().toISOString(),
        kind,
        ...data,
      });
    },
  };
}

function toRelative(filePath) {
  return path.relative(process.cwd(), filePath) || ".";
}

async function writeRunFiles(runDir, result, events) {
  const resultPath = path.join(runDir, "result.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await fs.writeFile(eventsPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  return { resultPath, eventsPath };
}

async function selectPage(context) {
  const pages = context.pages();
  return (
    pages.find((page) => page.url().includes("www.bilibili.com/video/")) ??
    pages.find((page) => page.url().includes("bilibili.com")) ??
    pages[0] ??
    (await context.newPage())
  );
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
  for (const scrollY of [500, 900, 1300, 1800, 2400, 3200, 4200, 5600]) {
    await page.evaluate((nextScrollY) => {
      window.focus();
      window.scrollTo(0, nextScrollY);
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
    if (snapshot.firstComment?.text) {
      return snapshot;
    }
  }
  return snapshot;
}

async function collectCommentTimingState(page, keyword) {
  return page.evaluate((targetKeyword) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const commentSelector = [
      "div.reply-item",
      "div.root-reply-container",
      "div.sub-reply-item",
      "bili-comment-renderer",
      "bili-comment-reply-renderer",
      "div.reply-wrap",
      "bili-comment-thread-renderer",
    ].join(",");

    function queryAllDeep(root, selector, visited = new WeakSet()) {
      const results = [];
      if (!root?.querySelectorAll) {
        return results;
      }

      if (root.matches?.(selector)) {
        results.push(root);
      }

      if (root.shadowRoot && !visited.has(root.shadowRoot)) {
        visited.add(root.shadowRoot);
        results.push(...queryAllDeep(root.shadowRoot, selector, visited));
      }

      results.push(...root.querySelectorAll(selector));
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot && !visited.has(element.shadowRoot)) {
          visited.add(element.shadowRoot);
          results.push(...queryAllDeep(element.shadowRoot, selector, visited));
        }
      });
      return [...new Set(results)];
    }

    function readDataMessage(node, visited = new WeakSet()) {
      if (!node || (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11)) {
        return "";
      }
      const data = node.__data ?? node.data;
      const message = data?.content?.message ?? data?.reply?.content?.message ?? data?.message;
      if (message) {
        return clean(message);
      }
      if (node.nodeType === 1 && node.shadowRoot && !visited.has(node.shadowRoot)) {
        visited.add(node.shadowRoot);
        const shadowMessage = readDataMessage(node.shadowRoot, visited);
        if (shadowMessage) {
          return shadowMessage;
        }
      }
      for (const child of node.childNodes || []) {
        const childMessage = readDataMessage(child, visited);
        if (childMessage) {
          return childMessage;
        }
      }
      return "";
    }

    function readTextDeep(node, visited = new WeakSet()) {
      if (!node) {
        return "";
      }
      if (node.nodeType === 3) {
        return node.nodeValue || "";
      }
      if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) {
        return "";
      }
      const parts = [];
      if (node.nodeType === 1 && node.shadowRoot && !visited.has(node.shadowRoot)) {
        visited.add(node.shadowRoot);
        parts.push(readTextDeep(node.shadowRoot, visited));
      }
      for (const child of node.childNodes || []) {
        parts.push(readTextDeep(child, visited));
      }
      return clean(parts.join(" "));
    }

    function getCommentText(element) {
      return clean(readDataMessage(element) || readTextDeep(element));
    }

    function getCommentId(element, index) {
      const data = element.__data ?? element.data;
      return String(
        data?.rpid_str ??
        data?.rpid ??
        data?.id ??
        element.getAttribute?.("data-rpid") ??
        element.getAttribute?.("rpid") ??
        `index:${index}`
      );
    }

    function getPlaceholderNearComment(element) {
      if (element.previousElementSibling?.classList?.contains("bbvt-comment-filter-overlay")) {
        return element.previousElementSibling;
      }
      const parent = element.parentNode;
      if (!parent?.querySelectorAll) {
        return null;
      }
      const placeholders = [...parent.querySelectorAll(".bbvt-comment-filter-overlay")];
      return placeholders.find((placeholder) => placeholder.textContent.includes(targetKeyword)) || placeholders[0] || null;
    }

    const comments = queryAllDeep(document, commentSelector)
      .map((element, index) => ({
        element,
        id: getCommentId(element, index),
        text: getCommentText(element),
      }))
      .filter((item) => item.text);

    const placeholders = queryAllDeep(document, ".bbvt-comment-filter-overlay");
    const matchingPlaceholder = targetKeyword
      ? placeholders.find((item) => item.textContent.includes(targetKeyword)) || null
      : placeholders[0] || null;
    let target = null;

    if (matchingPlaceholder?.nextElementSibling) {
      const placeholderTargetElement = matchingPlaceholder.nextElementSibling;
      target = comments.find((item) => item.element === placeholderTargetElement) || {
        element: placeholderTargetElement,
        id: getCommentId(placeholderTargetElement, -1),
        text: getCommentText(placeholderTargetElement),
      };
    }

    if (!target && targetKeyword) {
      target = comments.find((item) =>
        item.element.dataset.bbvtCommentBlocked === "true" && item.text.includes(targetKeyword)
      ) || comments.find((item) => item.text.includes(targetKeyword)) || null;
    }

    if (!target) {
      target = comments[0] || null;
    }

    const targetElement = target?.element ?? null;
    const placeholder = matchingPlaceholder || (targetElement ? getPlaceholderNearComment(targetElement) : null);
    const placeholderButton = placeholder?.querySelector("button") ?? null;
    const floatingButton = document.querySelector("#bbvtFloatingEntry .bbvt-fe-main");

    return {
      url: location.href,
      title: document.title,
      keyword: targetKeyword || null,
      commentCount: comments.length,
      placeholderCount: placeholders.length,
      overlayCount: placeholders.length,
      floatingEntryFound: Boolean(document.querySelector("#bbvtFloatingEntry")),
      floatingButtonText: clean(floatingButton?.textContent),
      storage: window.__bbvtTimingStorage?.GM_blockedParameter ?? null,
      firstComment: comments[0]
        ? {
            id: comments[0].id,
            text: comments[0].text.slice(0, 300),
          }
        : null,
      target: target
        ? {
            id: target.id,
            text: target.text.slice(0, 300),
            display: targetElement.style.display || "",
            computedDisplay: getComputedStyle(targetElement).display,
            visibility: targetElement.style.visibility || "",
            computedVisibility: getComputedStyle(targetElement).visibility,
            blocked: targetElement.dataset.bbvtCommentBlocked === "true",
            bypass: targetElement.dataset.bbvtCommentFilterBypass === "true",
            reason: targetElement.dataset.bbvtCommentBlockReason || "",
            originalDisplayStored: Object.prototype.hasOwnProperty.call(
              targetElement.dataset,
              "bbvtCommentOriginalDisplay"
            ),
            placeholderFound: Boolean(placeholder),
            placeholderText: clean(placeholder?.textContent),
            placeholderButtonText: clean(placeholderButton?.textContent),
          }
        : null,
    };
  }, keyword);
}

function deriveKeyword(commentText) {
  const cleaned = cleanText(commentText, 80);
  const compact = cleaned.replace(/\s+/g, "");
  if (compact.length <= 8) {
    return compact;
  }
  return compact.slice(0, 8);
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
  await page.evaluate(({ source, initialSettings }) => {
    window.__bbvtTimingStorage = {
      GM_blockedParameter: JSON.parse(JSON.stringify(initialSettings)),
    };
    window.__bbvtTimingGmWrites = [];
    window.GM_getValue = (key, defaultValue) => {
      if (Object.prototype.hasOwnProperty.call(window.__bbvtTimingStorage, key)) {
        return window.__bbvtTimingStorage[key];
      }
      return defaultValue;
    };
    window.GM_setValue = (key, value) => {
      window.__bbvtTimingStorage[key] = JSON.parse(JSON.stringify(value));
      window.__bbvtTimingGmWrites.push({ key, value, ts: Date.now() });
    };
    window.GM_addStyle = (css) => {
      const style = document.createElement("style");
      style.dataset.bbvtTimingStyle = "true";
      style.textContent = css;
      document.head.appendChild(style);
      return style;
    };
    window.GM_registerMenuCommand = () => {};
    window.__bbvtTimingInjectedAt = Date.now();
    (0, eval)(`${source}\n//# sourceURL=bbvt-comment-timing.user.js`);
    window.dispatchEvent(new Event("load"));
  }, { source: userscriptSource, initialSettings: settings });

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
    targetBypass: Boolean(state?.target?.bypass),
    targetDisplay: state?.target?.computedDisplay ?? "",
    targetVisibility: state?.target?.computedVisibility ?? "",
    placeholderButtonText: state?.target?.placeholderButtonText ?? "",
    placeholderText: cleanText(state?.target?.placeholderText, 160),
  };
}

async function clickPlaceholderButton(page, keyword, expectedText) {
  return page.evaluate(({ targetKeyword, buttonText }) => {
    function queryAllDeep(root, selector, visited = new WeakSet()) {
      const results = [];
      if (!root?.querySelectorAll) {
        return results;
      }
      if (root.matches?.(selector)) {
        results.push(root);
      }
      if (root.shadowRoot && !visited.has(root.shadowRoot)) {
        visited.add(root.shadowRoot);
        results.push(...queryAllDeep(root.shadowRoot, selector, visited));
      }
      results.push(...root.querySelectorAll(selector));
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot && !visited.has(element.shadowRoot)) {
          visited.add(element.shadowRoot);
          results.push(...queryAllDeep(element.shadowRoot, selector, visited));
        }
      });
      return [...new Set(results)];
    }

    const placeholders = queryAllDeep(document, ".bbvt-comment-filter-overlay");
    const placeholder = placeholders.find((item) =>
      item.textContent.includes(targetKeyword) && item.textContent.includes(buttonText)
    );
    const button = placeholder?.querySelector("button");
    if (!button) {
      return false;
    }
    button.click();
    return true;
  }, { targetKeyword: keyword, buttonText: expectedText });
}

async function moveAcrossPlaceholder(page, keyword) {
  return page.evaluate(async (targetKeyword) => {
    function queryAllDeep(root, selector, visited = new WeakSet()) {
      const results = [];
      if (!root?.querySelectorAll) {
        return results;
      }
      if (root.matches?.(selector)) {
        results.push(root);
      }
      if (root.shadowRoot && !visited.has(root.shadowRoot)) {
        visited.add(root.shadowRoot);
        results.push(...queryAllDeep(root.shadowRoot, selector, visited));
      }
      results.push(...root.querySelectorAll(selector));
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot && !visited.has(element.shadowRoot)) {
          visited.add(element.shadowRoot);
          results.push(...queryAllDeep(element.shadowRoot, selector, visited));
        }
      });
      return [...new Set(results)];
    }

    function readState(placeholder) {
      const target = placeholder?.nextElementSibling ?? null;
      const button = placeholder?.querySelector("button") ?? null;
      return {
        found: Boolean(placeholder),
        targetVisibility: target ? getComputedStyle(target).visibility : "",
        overlayOpacity: placeholder ? getComputedStyle(placeholder).opacity : "",
        overlayPeeking: placeholder?.dataset.bbvtCommentFilterPeeking === "true",
        commentPeeking: target?.dataset.bbvtCommentFilterPeeking === "true",
        buttonText: (button?.textContent || "").replace(/\s+/g, " ").trim(),
      };
    }

    const placeholders = queryAllDeep(document, ".bbvt-comment-filter-overlay");
    const placeholder = placeholders.find((item) => item.textContent.includes(targetKeyword)) || null;
    const actions = placeholder?.querySelector(".bbvt-comment-filter-overlay-actions") ?? null;
    const moveEvent = () => new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      view: window,
    });

    actions?.dispatchEvent(moveEvent());
    const afterActions = readState(placeholder);

    placeholder?.dispatchEvent(moveEvent());
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterBody = readState(placeholder);

    return { afterActions, afterBody };
  }, keyword);
}

async function leavePlaceholder(page, keyword) {
  return page.evaluate((targetKeyword) => {
    function queryAllDeep(root, selector, visited = new WeakSet()) {
      const results = [];
      if (!root?.querySelectorAll) {
        return results;
      }
      if (root.matches?.(selector)) {
        results.push(root);
      }
      if (root.shadowRoot && !visited.has(root.shadowRoot)) {
        visited.add(root.shadowRoot);
        results.push(...queryAllDeep(root.shadowRoot, selector, visited));
      }
      results.push(...root.querySelectorAll(selector));
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot && !visited.has(element.shadowRoot)) {
          visited.add(element.shadowRoot);
          results.push(...queryAllDeep(element.shadowRoot, selector, visited));
        }
      });
      return [...new Set(results)];
    }

    const placeholder = queryAllDeep(document, ".bbvt-comment-filter-overlay")
      .find((item) => item.textContent.includes(targetKeyword)) || null;
    placeholder?.dispatchEvent(new MouseEvent("mouseleave", {
      bubbles: false,
      cancelable: true,
      view: window,
    }));
    const target = placeholder?.nextElementSibling ?? null;
    return {
      found: Boolean(placeholder),
      targetVisibility: target ? getComputedStyle(target).visibility : "",
      overlayPeeking: placeholder?.dataset.bbvtCommentFilterPeeking === "true",
      commentPeeking: target?.dataset.bbvtCommentFilterPeeking === "true",
    };
  }, keyword);
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

async function triggerRefresh(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(400);
}

async function runTiming(runDir, recorder) {
  let browser;
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

    const page = await selectPage(context);
    recorder.mark("page.selected", { url: page.url() });

    const openedVideo = await ensureVideoPage(page, recorder);
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
        state.target?.placeholderButtonText === "显示",
      recorder
    );

    const showButtonText = hidden.target?.placeholderButtonText || "显示";
    const peeked = await moveAcrossPlaceholder(page, keyword);
    recorder.mark("ui.peek", peeked);
    if (
      peeked.afterActions.targetVisibility !== "hidden" ||
      peeked.afterActions.overlayPeeking ||
      peeked.afterBody.targetVisibility === "hidden" ||
      peeked.afterBody.overlayOpacity === "1" ||
      !peeked.afterBody.overlayPeeking ||
      !peeked.afterBody.commentPeeking
    ) {
      throw new Error("Comment overlay hover peek did not keep the expected hidden/visible states.");
    }

    await triggerRefresh(page);
    const peekedAfterRefresh = await collectCommentTimingState(page, keyword);
    recorder.mark("ui.peek.refresh", summarizeState("comment peek after refresh", peekedAfterRefresh));
    if (
      peekedAfterRefresh.target?.computedVisibility === "hidden" ||
      peekedAfterRefresh.target?.placeholderButtonText !== showButtonText
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
        state.target?.placeholderButtonText === showButtonText,
      recorder
    );

    const clickedShow = await clickPlaceholderButton(page, keyword, showButtonText);
    recorder.mark("ui.click", { action: "show", clicked: clickedShow });
    if (!clickedShow) {
      throw new Error("Could not click the comment placeholder show button.");
    }

    const revealed = await waitForState(
      page,
      keyword,
      "comment revealed with bypass",
      (state) =>
        state.target?.bypass === true &&
        state.target?.computedVisibility !== "hidden" &&
        state.target?.placeholderButtonText === "重新隐藏",
      recorder
    );

    await triggerRefresh(page);
    const revealedAfterRefresh = await waitForState(
      page,
      keyword,
      "comment remains revealed after refresh",
      (state) =>
        state.target?.bypass === true &&
        state.target?.computedVisibility !== "hidden" &&
        state.target?.placeholderButtonText === "重新隐藏",
      recorder
    );

    const rehideButtonText = revealed.target?.placeholderButtonText || "重新隐藏";
    const clickedHide = await clickPlaceholderButton(page, keyword, rehideButtonText);
    recorder.mark("ui.click", { action: "rehide", clicked: clickedHide });
    if (!clickedHide) {
      throw new Error("Could not click the comment placeholder rehide button.");
    }

    const rehidden = await waitForState(
      page,
      keyword,
      "comment hidden again",
      (state) =>
        state.target?.blocked === true &&
        state.target?.computedVisibility === "hidden" &&
        state.target?.placeholderButtonText === showButtonText,
      recorder
    );

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
        state.target.bypass === false &&
        state.target.computedVisibility !== "hidden" &&
        state.target.placeholderFound === false &&
        state.floatingButtonText === "关",
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
        revealed,
        revealedAfterRefresh,
        rehidden,
        restored,
      },
    };

    recorder.mark("run.end", {
      ok: true,
      bvid: result.video.bvid,
      keyword,
      placeholderCount: restored.placeholderCount,
    });
    const paths = await writeRunFiles(runDir, result, recorder.events);
    return { result, paths };
  } catch (error) {
    recorder.mark("run.error", { message: error.message });
    const result = {
      ok: false,
      endpoint,
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
        bvid: result.video.bvid,
        aid: result.video.aid,
        keyword: result.keyword,
        final: {
          placeholderCount: result.states.restored.placeholderCount,
          floatingButtonText: result.states.restored.floatingButtonText,
          targetDisplay: result.states.restored.target?.computedDisplay ?? "",
          targetVisibility: result.states.restored.target?.computedVisibility ?? "",
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  if (error.artifactPaths) {
    console.error(`Comment timing smoke failed. result=${toRelative(error.artifactPaths.resultPath)}`);
  }
  console.error(error.stack || error.message);
  process.exit(1);
});

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  cleanText,
  createRecorder,
  createRunId,
  readArg,
  toRelative,
  writeRunFiles,
} from "./lib/harness.js";
import { injectUserscriptInBrowser } from "./lib/userscript-runtime.js";

const fixtureUrl = "https://www.bilibili.com/video/BVciDeterministic/";
const outputRoot = path.resolve(readArg("--output-dir") ?? "artifacts/playwright/ci-deterministic-smoke");
const userscriptPath = path.resolve(readArg("--userscript") ?? "dist/bilibili_blocked_videos_by_tags.user.js");
const headed = process.argv.includes("--headed");

const initialSettings = {
  uiFeatureSwitchVersion: 1,
  scriptEnabled_Switch: true,
  floatingEntryVisible_Switch: true,
  blockedOverlayOnlyDisplaysType_Switch: false,
  hideVideoMode_Switch: false,
  legacyCardBoxOverlayDelay_Switch: false,
  consoleOutputLog_Switch: false,
  hideBlockedWordsInMenu_Switch: false,
  accumulateBlockedRules_Switch: false,
  hideNonVideoElements_Switch: false,
  blockedTitle_Switch: true,
  blockedTitle_UseRegular: true,
  blockedTitle_Array: ["CI_BLOCKED_TITLE"],
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
  blockedShortDuration_Switch: false,
  blockedBelowVideoViews_Switch: false,
  blockedBelowLikesRate_Switch: false,
  blockedBelowCoinRate_Switch: false,
  blockedAboveFavoriteCoinRatio_Switch: false,
  blockedPortraitVideo_Switch: false,
  blockedChargingExclusive_Switch: false,
  blockedFilteredCommentsVideo_Switch: false,
  blockedTopComment_Switch: false,
  blockedTopComment_Array: [],
  blockedCommentText_Switch: true,
  blockedCommentText_UseRegular: false,
  blockedCommentText_Array: ["CI_BLOCK_COMMENT"],
  blockedCommentUser_Switch: false,
  blockedCommentUser_Array: [],
  blockedCommentImage_Switch: false,
  hideCommentMode_Switch: false,
  whitelistUpUid_Switch: false,
  whitelistUpUid_Array: [],
  whitelistBv_Switch: false,
  whitelistBv_Array: [],
};

function createFixtureHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>CI deterministic Bilibili fixture</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f6f7f8;
      color: #111;
    }
    main {
      width: 960px;
      margin: 24px auto 120px;
    }
    .bili-video-card {
      position: relative;
      box-sizing: border-box;
      width: 320px;
      min-height: 180px;
      margin: 16px 0;
      padding: 16px;
      border: 1px solid #ddd;
      background: white;
    }
    .bili-video-card a {
      display: block;
      color: #0b65c2;
    }
    #commentapp {
      margin-top: 28px;
      padding: 16px;
      background: white;
      border: 1px solid #ddd;
    }
    bili-comments,
    bili-comment-thread-renderer,
    bili-comment-renderer,
    bili-rich-text {
      display: block;
      box-sizing: border-box;
    }
    bili-comment-thread-renderer {
      position: relative;
      min-height: 96px;
      padding: 12px;
      border: 1px solid #e3e5e7;
      background: #fff;
    }
    bili-comment-renderer {
      min-height: 72px;
      padding: 8px;
      background: #fff;
    }
  </style>
</head>
<body>
  <main>
    <section id="video-feed">
      <div class="bili-video-card" data-ci-card="initial">
        <a href="https://www.bilibili.com/video/BVciInitial/" title="CI_BLOCKED_TITLE initial card">CI_BLOCKED_TITLE initial card</a>
        <a href="https://space.bilibili.com/4242"><span>Fixture UP</span></a>
      </div>
    </section>
    <section id="commentapp">
      <bili-comments></bili-comments>
    </section>
  </main>
  <script>
    const commentData = {
      rpid: 9001,
      rpid_str: "9001",
      content: { message: "CI_BLOCK_COMMENT fixture text" },
      member: { mid: "4242", uname: "Fixture Commenter" },
      reply_control: { time_desc: "just now" }
    };

    class BiliRichText extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        const shadow = this.attachShadow({ mode: "open" });
        const contents = document.createElement("span");
        contents.id = "contents";
        contents.className = "reply-content";
        contents.textContent = this.getAttribute("message") || "";
        shadow.append(contents);
      }
    }

    class BiliCommentRenderer extends HTMLElement {
      connectedCallback() {
        this.__data = commentData;
        if (this.shadowRoot) return;
        const shadow = this.attachShadow({ mode: "open" });
        const richText = document.createElement("bili-rich-text");
        richText.setAttribute("message", commentData.content.message);
        shadow.append(richText);
      }
    }

    class BiliCommentThreadRenderer extends HTMLElement {
      connectedCallback() {
        this.__data = commentData;
        if (this.shadowRoot) return;
        const shadow = this.attachShadow({ mode: "open" });
        const renderer = document.createElement("bili-comment-renderer");
        renderer.__data = commentData;
        shadow.append(renderer);
      }
    }

    class BiliComments extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        const shadow = this.attachShadow({ mode: "open" });
        const thread = document.createElement("bili-comment-thread-renderer");
        thread.__data = commentData;
        shadow.append(thread);
      }
    }

    customElements.define("bili-rich-text", BiliRichText);
    customElements.define("bili-comment-renderer", BiliCommentRenderer);
    customElements.define("bili-comment-thread-renderer", BiliCommentThreadRenderer);
    customElements.define("bili-comments", BiliComments);

    window.__bbvtAddVideoCard = ({ bv, title }) => {
      const card = document.createElement("div");
      card.className = "bili-video-card";
      card.dataset.ciCard = bv;
      card.innerHTML = '<a href="https://www.bilibili.com/video/' + bv + '/" title="' +
        title.replaceAll('"', "&quot;") + '">' + title + '</a>' +
        '<a href="https://space.bilibili.com/4242"><span>Fixture UP</span></a>';
      document.getElementById("video-feed").appendChild(card);
      return true;
    };
  </script>
</body>
</html>`;
}

async function installRoutes(page, recorder) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === fixtureUrl) {
      recorder.mark("route.fixture", { url });
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: createFixtureHtml(),
      });
      return;
    }

    if (url.includes("api.bilibili.com")) {
      recorder.mark("route.api", { url });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "0", data: {} }),
      });
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });
}

async function waitForCount(page, selector, expected, label, recorder, timeoutMs = 5000) {
  const locator = page.locator(selector);
  await page
    .waitForFunction(
      ({ targetSelector, targetCount }) => document.querySelectorAll(targetSelector).length === targetCount,
      { targetSelector: selector, targetCount: expected },
      { timeout: timeoutMs }
    )
    .catch(() => {});
  const count = await locator.count();
  recorder.mark("assert.count", { label, selector, expected, count });
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} element(s) for ${selector}, got ${count}`);
  }
  return count;
}

async function waitForDeepCount(page, selector, expected, label, recorder, timeoutMs = 5000) {
  await page
    .waitForFunction(
      ({ targetSelector, targetCount }) => {
        const walk = (root) => {
          const results = [];
          if (!root?.querySelectorAll) return results;
          results.push(...root.querySelectorAll(targetSelector));
          root.querySelectorAll("*").forEach((element) => {
            if (element.shadowRoot) {
              results.push(...walk(element.shadowRoot));
            }
          });
          return results;
        };
        return walk(document).length === targetCount;
      },
      { targetSelector: selector, targetCount: expected },
      { timeout: timeoutMs }
    )
    .catch(() => {});

  const count = await page.evaluate((targetSelector) => {
    const walk = (root) => {
      const results = [];
      if (!root?.querySelectorAll) return results;
      results.push(...root.querySelectorAll(targetSelector));
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) {
          results.push(...walk(element.shadowRoot));
        }
      });
      return results;
    };
    return walk(document).length;
  }, selector);

  recorder.mark("assert.deepCount", { label, selector, expected, count });
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} deep element(s) for ${selector}, got ${count}`);
  }
  return count;
}

async function readSummary(page) {
  return page.evaluate(() => {
    const deepCount = (selector) => {
      const walk = (root) => {
        const results = [];
        if (!root?.querySelectorAll) return results;
        results.push(...root.querySelectorAll(selector));
        root.querySelectorAll("*").forEach((element) => {
          if (element.shadowRoot) {
            results.push(...walk(element.shadowRoot));
          }
        });
        return results;
      };
      return walk(document).length;
    };

    return {
      videoOverlayCount: document.querySelectorAll(".blockedOverlay").length,
      commentOverlayCount: deepCount(".bbvt-comment-filter-overlay"),
      commentPlaceholderCount: deepCount("[data-bbvt-comment-filter-overlay]"),
      floatingButtonText: document.querySelector("#bbvtFloatingEntry .bbvt-fe-main")?.innerText || "",
      scriptEnabled: window.__bbvtCiStorage?.GM_blockedParameter?.scriptEnabled_Switch ?? null,
      commentRules: window.__bbvtCiStorage?.GM_blockedParameter?.blockedCommentText_Array ?? null,
      gmWriteCount: window.__bbvtCiWrites?.length ?? 0,
    };
  });
}

async function readScriptEnabledFlag(page) {
  return page.evaluate(() => window.__bbvtCiStorage?.GM_blockedParameter?.scriptEnabled_Switch ?? null);
}

async function waitForScriptEnabledFlag(page, expected, timeoutMs) {
  try {
    await page.waitForFunction(
      (expectedValue) => window.__bbvtCiStorage?.GM_blockedParameter?.scriptEnabled_Switch === expectedValue,
      expected,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function toggleScriptOff(page, recorder) {
  const button = page.locator("#bbvtFloatingEntry .bbvt-fe-main").first();
  await button.waitFor({ state: "visible", timeout: 5000 });
  const beforeEnabled = await readScriptEnabledFlag(page);
  const beforeText = cleanText(await button.innerText());
  await button.click({ timeout: 3000 });

  let method = "click";
  let disabled = await waitForScriptEnabledFlag(page, false, 1000);
  if (!disabled) {
    await button.focus();
    await button.press("Enter");
    method = "keyboard";
    disabled = await waitForScriptEnabledFlag(page, false, 3000);
  }

  const afterEnabled = await readScriptEnabledFlag(page);
  const afterText = cleanText(await button.innerText());
  recorder.mark("ui.toggle-script", { method, beforeEnabled, afterEnabled, beforeText, afterText });

  if (!disabled) {
    throw new Error(`floating entry did not disable script; scriptEnabled=${afterEnabled}`);
  }
}

async function launchBrowser(recorder) {
  try {
    const browser = await chromium.launch({ headless: !headed });
    recorder.mark("browser.launched", { engine: "chromium" });
    return browser;
  } catch (error) {
    if (!/Executable doesn't exist|playwright install/i.test(error?.message ?? "")) {
      throw error;
    }

    const browser = await chromium.launch({ channel: "chrome", headless: !headed });
    recorder.mark("browser.launched", { engine: "chrome-channel", fallbackReason: error.message.split("\n")[0] });
    return browser;
  }
}

async function runSmoke(runDir, recorder) {
  const userscriptSource = await fs.readFile(userscriptPath, "utf8");
  const browser = await launchBrowser(recorder);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await installRoutes(page, recorder);
    await page.goto(fixtureUrl, { waitUntil: "load", timeout: 30000 });
    recorder.mark("page.loaded", { url: page.url(), title: await page.title() });

    await page.evaluate(injectUserscriptInBrowser, {
      source: userscriptSource,
      initialSettings,
      storageKey: "__bbvtCiStorage",
      writeLogKey: "__bbvtCiWrites",
      injectedAtKey: "__bbvtCiInjectedAt",
      sourceUrl: "bbvt-ci-deterministic.user.js",
      dispatchLoad: true,
    });
    recorder.mark("userscript.injected", {
      blockedTitleRule: initialSettings.blockedTitle_Array[0],
      blockedCommentRule: initialSettings.blockedCommentText_Array[0],
    });

    await waitForCount(page, ".bili-video-card[data-ci-card='initial'] > .blockedOverlay", 1, "initial card overlay", recorder);
    await waitForDeepCount(page, ".bbvt-comment-filter-overlay", 1, "initial comment overlay", recorder);

    await page.evaluate(() => window.__bbvtAddVideoCard({
      bv: "BVciAdded",
      title: "CI_BLOCKED_TITLE added mutation card",
    }));
    recorder.mark("fixture.card-added", { bv: "BVciAdded" });
    await waitForCount(page, ".bili-video-card[data-ci-card='BVciAdded'] > .blockedOverlay", 1, "mutation card overlay", recorder);

    const commentOverlay = page.locator("bili-comments .bbvt-comment-filter-overlay").first();
    await commentOverlay.hover({ timeout: 5000 });
    await commentOverlay.locator(".bbvt-comment-filter-details-toggle").click({ timeout: 5000 });
    await commentOverlay.locator(".bbvt-comment-filter-reason-remove").click({ timeout: 5000 });
    recorder.mark("ui.comment-rule-removed", {});
    await waitForDeepCount(page, ".bbvt-comment-filter-overlay", 0, "comment overlay removed after rule deletion", recorder);

    await toggleScriptOff(page, recorder);
    await waitForCount(page, ".blockedOverlay", 0, "video overlays cleared after script off", recorder);

    const summary = await readSummary(page);
    recorder.mark("run.end", { ok: true, ...summary });
    return {
      ok: true,
      fixtureUrl,
      userscriptPath: toRelative(userscriptPath),
      summary,
    };
  } catch (error) {
    const summary = await readSummary(page).catch(() => null);
    recorder.mark("run.end", { ok: false, error: error.message, summary });
    return {
      ok: false,
      fixtureUrl,
      userscriptPath: toRelative(userscriptPath),
      error: {
        message: error.message,
        stack: error.stack,
      },
      summary,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const runDir = path.join(outputRoot, createRunId());
  await fs.mkdir(runDir, { recursive: true });
  const recorder = createRecorder();
  const result = await runSmoke(runDir, recorder);
  const paths = await writeRunFiles(runDir, result, recorder.events);

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        artifactDir: toRelative(runDir),
        resultPath: toRelative(paths.resultPath),
        eventsPath: toRelative(paths.eventsPath),
        summary: result.summary,
      },
      null,
      2
    )
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

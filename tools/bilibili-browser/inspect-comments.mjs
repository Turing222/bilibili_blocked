import http from "node:http";
import { chromium } from "@playwright/test";
import { selectPage } from "../../scripts/lib/harness.js";
import { acquireBrowserLease, releaseBrowserLease } from "../../scripts/lib/browser-harness.js";
import {
  collectInspectPageStateInBrowser,
  collectInspectDomCommentInBrowser,
  fetchInspectApiReplyInBrowser,
  getFirstHomeVideoLinkInBrowser,
} from "../../scripts/lib/bilibili-dom.js";

const port = Number(readArg("--port") ?? 9223);
const openFirstVideo = process.argv.includes("--open-first-video");
const videoUrl = readArg("--video");
const forceHome = process.argv.includes("--home") || openFirstVideo;
const homeUrl = "https://www.bilibili.com/";
const endpoint = `http://127.0.0.1:${port}`;

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(body || error.message));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function ensureVideoContext(page) {
  const currentUrl = await page.evaluate(() => location.href);

  if (videoUrl) {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await delay(10_000);
    await page.bringToFront();
    await page
      .evaluate(() => {
        window.focus();
        document.querySelector("video")?.pause();
      })
      .catch(() => {});
    return;
  }

  if (forceHome || !currentUrl.includes("bilibili.com")) {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await delay(7000);
    await page.bringToFront();
  }

  if (!videoUrl && openFirstVideo) {
    const firstVideo = await page.evaluate(getFirstHomeVideoLinkInBrowser);
    if (firstVideo?.href) {
      await page.goto(firstVideo.href, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await delay(10_000);
      await page.bringToFront();
    }
  }
}

async function inspectVideoAndComments(page) {
  await page.evaluate(() => window.focus()).catch(() => {});

  const state = await page.evaluate(collectInspectPageStateInBrowser);

  let apiReply = null;
  if (state.video?.aid) {
    apiReply = await page.evaluate(fetchInspectApiReplyInBrowser, state.video.aid);
  }

  let domComment = null;
  for (const y of [350, 500, 650, 800, 1000, 1300, 1800, 2400, 3200, 4200]) {
    await page
      .evaluate((scrollY) => {
        window.focus();
        window.scrollTo(0, scrollY);
      }, y)
      .catch(() => {});
    await delay(2000);
    domComment = await page.evaluate(collectInspectDomCommentInBrowser);
    if (domComment?.firstComment || domComment?.text) {
      break;
    }
  }

  return { state, apiReply, domComment };
}

async function main() {
  await requestJson("/json/version");
  const lease = await acquireBrowserLease(port, "inspect-comments", {
    videoUrl: videoUrl ?? null,
    openFirstVideo,
  });

  let browser;
  try {
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error(`No browser context found at ${endpoint}`);
    }

    const page = await selectPage(context, [
      "www.bilibili.com/video/",
      "www.bilibili.com/",
      "bilibili.com",
    ]);
    await page.bringToFront();
    await ensureVideoContext(page);

    const summary = await inspectVideoAndComments(page);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser?.close().catch(() => {});
    await releaseBrowserLease(port, lease);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const port = Number(readArg("--port") ?? 9223);
const videoUrl = readArg("--video");
const outputRoot = path.resolve(readArg("--output-dir") ?? "artifacts/playwright/runs");
const openFirstVideo = process.argv.includes("--open-first-video") || !videoUrl;
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

async function collectCommentSnapshot(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const host = document.querySelector("bili-comments");
    const threads = host?.shadowRoot
      ? [...host.shadowRoot.querySelectorAll("bili-comment-thread-renderer")]
      : [];
    const firstThread = threads[0];
    const firstRenderer = firstThread?.shadowRoot?.querySelector("bili-comment-renderer");
    const firstRichText = firstRenderer?.shadowRoot?.querySelector("bili-rich-text");
    const richTextContents = firstRichText?.shadowRoot?.querySelector("#contents");
    const data = firstThread?.__data ?? null;
    const richText = clean(richTextContents?.innerText || richTextContents?.textContent);

    return {
      hostFound: !!host,
      hostHasShadowRoot: !!host?.shadowRoot,
      threadCount: threads.length,
      firstComment: data
        ? {
            user: data.member?.uname ?? null,
            message: clean(data.content?.message).slice(0, 300),
            rpid: data.rpid_str ?? String(data.rpid ?? ""),
          }
        : null,
      richText: richText || null,
    };
  });
}

async function runSmoke(runDir, recorder) {
  let browser;
  try {
    recorder.mark("run.start", { endpoint, videoUrl: videoUrl ?? null });
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error(`No browser context found at ${endpoint}`);
    }
    recorder.mark("browser.connected", { contextCount: browser.contexts().length });

    const network = [];
    context.on("response", (response) => {
      const url = response.url();
      if (url.includes("/x/v2/reply") || url.includes("/x/v2/reply/main")) {
        const item = { status: response.status(), url };
        network.push(item);
        recorder.mark("network.response", item);
      }
    });

    const page = await selectPage(context);
    await page.bringToFront();
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    recorder.mark("page.selected", { url: page.url() });

    if (!videoUrl && !page.url().startsWith("https://www.bilibili.com/")) {
      await page.goto("https://www.bilibili.com/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(5000);
      recorder.mark("page.home", { url: page.url() });
    }

    const before = {
      url: page.url(),
      title: await page.title().catch(() => ""),
      cookieNames: (await context.cookies("https://www.bilibili.com/")).map((cookie) => cookie.name),
    };

    const currentPageIsVideo = page.url().startsWith("https://www.bilibili.com/video/BV");
    let openedVideo = videoUrl ? { href: videoUrl, text: "" } : null;
    if (!openedVideo && openFirstVideo && !currentPageIsVideo) {
      openedVideo = await getFirstVideo(page);
      recorder.mark("video.candidate", { href: openedVideo?.href ?? null });
    }

    if (openedVideo?.href) {
      await page.goto(openedVideo.href, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(7000);
      await page.evaluate(() => document.querySelector("video")?.pause()).catch(() => {});
      recorder.mark("video.opened", { href: openedVideo.href, url: page.url() });
    }

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

    let commentSnapshot = null;
    for (const y of [500, 900, 1300, 1800, 2400, 3200, 4200]) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(1500);
      commentSnapshot = await collectCommentSnapshot(page);
      recorder.mark("comments.sample", {
        scrollY: y,
        hostFound: commentSnapshot.hostFound,
        threadCount: commentSnapshot.threadCount,
        hasFirstComment: !!commentSnapshot.firstComment,
      });
      if (commentSnapshot.firstComment || commentSnapshot.threadCount > 0) {
        break;
      }
    }

    const result = {
      ok: true,
      connected: true,
      endpoint,
      contextCount: browser.contexts().length,
      before: {
        ...before,
        title: cleanText(before.title),
        hasLikelyLoginCookies: before.cookieNames.some((name) =>
          ["DedeUserID", "SESSDATA", "bili_jct"].includes(name)
        ),
      },
      openedVideo: openedVideo ? { ...openedVideo, text: cleanText(openedVideo.text) } : null,
      video: { ...video, title: cleanText(video.title) },
      commentSnapshot,
      observedReplyResponses: network.slice(-10),
    };

    recorder.mark("run.end", {
      ok: true,
      bvid: result.video.bvid,
      threadCount: result.commentSnapshot?.threadCount ?? 0,
      replyResponses: result.observedReplyResponses.length,
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
  const { result, paths } = await runSmoke(runDir, recorder);

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
        comments: {
          hostFound: result.commentSnapshot?.hostFound ?? false,
          threadCount: result.commentSnapshot?.threadCount ?? 0,
          hasFirstComment: !!result.commentSnapshot?.firstComment,
        },
        replyResponses: result.observedReplyResponses.length,
        hasLikelyLoginCookies: result.before.hasLikelyLoginCookies,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  if (error.artifactPaths) {
    console.error(`Smoke failed. result=${toRelative(error.artifactPaths.resultPath)}`);
  }
  console.error(error.stack || error.message);
  process.exit(1);
});

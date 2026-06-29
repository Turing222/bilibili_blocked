import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import http from "node:http";
import { acquireBrowserLease, releaseBrowserLease } from "../../scripts/lib/browser-harness.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MCP_VERSION = "1.4.0";
const port = Number(readArg("--port") ?? 9223);
const openFirstVideo = process.argv.includes("--open-first-video");
const videoUrl = readArg("--video");
const forceHome = process.argv.includes("--home") || openFirstVideo;
const homeUrl = "https://www.bilibili.com/";
const browserUrl = `http://127.0.0.1:${port}`;

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

function parseListPagesMarkdown(text) {
  const pages = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(\d+):\s*(.*?)\s*\((https?:\/\/[^)]+)\)(?:\s*\[selected\])?$/);
    if (!match) {
      continue;
    }
    pages.push({
      id: Number(match[1]),
      title: match[2],
      url: match[3],
      selected: line.includes("[selected]"),
    });
  }
  return pages;
}

function parseToolText(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }
  try {
    return JSON.parse(text);
  } catch {
    if (text.includes("## Pages")) {
      return { pages: parseListPagesMarkdown(text) };
    }
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error(`Unable to parse MCP tool output: ${text.slice(0, 400)}`);
  }
}

function tryParseToolText(text) {
  try {
    return { ok: true, value: parseToolText(text) };
  } catch {
    return { ok: false };
  }
}

export function extractToolJson(result) {
  if (result.structuredContent !== undefined) {
    const structured = result.structuredContent;
    if (typeof structured?.message === "string") {
      const parsed = tryParseToolText(structured.message);
      if (parsed.ok) {
        return parsed.value;
      }
    }
    return structured;
  }

  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("MCP tool returned no text content");
  }
  return parseToolText(text);
}

class McpBrowser {
  constructor() {
    this.client = new Client({ name: "mcp-probe-collect", version: "1.0.0" });
    this.connected = false;
  }

  async connect() {
    if (this.connected) {
      return;
    }
    const transport = new StdioClientTransport({
      command: "npx",
      args: [
        "-y",
        `chrome-devtools-mcp@${MCP_VERSION}`,
        `--browser-url=${browserUrl}`,
        "--no-usage-statistics",
        "--no-performance-crux",
      ],
      env: {
        ...process.env,
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
      },
      stderr: "inherit",
    });
    await this.client.connect(transport);
    this.connected = true;
  }

  async callTool(name, args = {}) {
    await this.connect();
    const result = await this.client.callTool({ name, arguments: args });
    if (result.isError) {
      const message = result.content?.map((item) => item.text).join("\n") ?? "Unknown MCP tool error";
      throw new Error(message);
    }
    return extractToolJson(result);
  }

  async listPages() {
    const parsed = await this.callTool("list_pages");
    if (!parsed?.pages) {
      throw new Error(`Unexpected list_pages output: ${JSON.stringify(parsed).slice(0, 400)}`);
    }
    return parsed.pages;
  }

  async selectPage(pageId, bringToFront = true) {
    await this.callTool("select_page", { pageId, bringToFront });
  }

  async navigatePage(url) {
    await this.callTool("navigate_page", { type: "url", url, timeout: 30_000 });
  }

  async evaluateScript(source) {
    return this.callTool("evaluate_script", { function: source });
  }

  async close() {
    if (!this.connected) {
      return;
    }
    await this.client.close();
    this.connected = false;
  }
}

async function pickPage(mcp) {
  let pages = (await mcp.listPages()).filter((page) => !String(page.url).startsWith("chrome-extension://"));
  let page =
    pages.find((item) => item.url.includes("www.bilibili.com/video/")) ??
    pages.find((item) => item.url.startsWith("https://www.bilibili.com/")) ??
    pages.find((item) => item.url.includes("www.bilibili.com")) ??
    pages.find((item) => item.url.includes("bilibili.com")) ??
    pages[0];

  if (!page) {
    await mcp.navigatePage(homeUrl);
    await delay(3000);
    pages = (await mcp.listPages()).filter((item) => !String(item.url).startsWith("chrome-extension://"));
    page = pages.find((item) => item.url.includes("bilibili.com")) ?? pages[0];
  }

  if (!page) {
    throw new Error("No selectable browser page found.");
  }

  await mcp.selectPage(page.id, true);
  return page;
}

const STATE_EXPR = `() => ({
  url: location.href,
  title: document.title,
  loggedInHints: {
    hasLoginText: document.body.innerText.includes('登录'),
    cookieNames: document.cookie.split(';').map(x => x.trim().split('=')[0]).filter(Boolean),
  },
  video: {
    aid: window.__INITIAL_STATE__?.aid || window.__INITIAL_STATE__?.videoData?.aid || null,
    bvid: window.__INITIAL_STATE__?.bvid || window.__INITIAL_STATE__?.videoData?.bvid ||
      location.pathname.match(/BV[^/?#]+/)?.[0] || null,
  },
  commentHosts: [...document.querySelectorAll('#commentapp, bili-comments, [class*="comment" i], [class*="reply" i]')]
    .slice(0, 30)
    .map((el) => ({
      tag: el.tagName,
      id: el.id,
      className: String(el.className || '').slice(0, 120),
      hasShadowRoot: !!el.shadowRoot,
      text: (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 180),
    })),
})`;

const FIRST_VIDEO_EXPR = `() => {
  const links = [...document.querySelectorAll('a[href*="/video/"]')];
  for (const link of links) {
    const rect = link.getBoundingClientRect();
    const href = new URL(link.getAttribute('href'), location.href).href.split('?')[0];
    const text = (link.innerText || link.title || link.getAttribute('aria-label') || '')
      .replace(/\\s+/g, ' ')
      .trim();
    if (href.includes('/video/') && rect.width > 20 && rect.height > 20) {
      return { href, text };
    }
  }
  return null;
}`;

function domCommentExpr() {
  return `() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const host = document.querySelector('bili-comments');
    const threads = host?.shadowRoot ? [...host.shadowRoot.querySelectorAll('bili-comment-thread-renderer')] : [];
    const firstThread = threads[0];
    const firstRenderer = firstThread?.shadowRoot?.querySelector('bili-comment-renderer');
    const firstRichText = firstRenderer?.shadowRoot?.querySelector('bili-rich-text');
    const richTextContents = firstRichText?.shadowRoot?.querySelector('#contents');
    const data = firstThread?.__data ?? null;
    const dataMessage = data?.content?.message ?? null;
    const richText = clean(richTextContents?.innerText || richTextContents?.textContent);

    if (data || richText) {
      return {
        selector: 'bili-comments::shadowRoot > bili-comment-thread-renderer',
        componentTree: [
          'bili-comments',
          'bili-comment-thread-renderer',
          'bili-comment-renderer',
          'bili-rich-text',
        ],
        tag: firstThread?.tagName ?? null,
        hasShadowRoot: !!firstThread?.shadowRoot,
        threadCount: threads.length,
        text: clean(dataMessage || richText).slice(0, 1000),
        firstComment: data ? {
          user: data.member?.uname ?? null,
          message: data.content?.message ?? null,
          rpid: data.rpid_str ?? String(data.rpid ?? ''),
          oid: data.oid_str ?? String(data.oid ?? ''),
          like: data.like ?? null,
          time: data.reply_control?.time_desc ?? null,
          location: data.reply_control?.location ?? null,
          isPinned: !!data.reply_control?.is_up_top,
        } : null,
        richTextDom: richText || null,
      };
    }
    if (host?.shadowRoot) {
      const threadCount = host.shadowRoot.querySelectorAll('bili-comment-thread-renderer').length;
      const text = host.shadowRoot.innerText || '';
      return {
        selector: 'bili-comments::shadowRoot',
        tag: 'BILI-COMMENTS',
        hasShadowRoot: true,
        threadCount,
        text: text.slice(0, 500),
      };
    }
    return null;
  }`;
}

function apiReplyExpr(aid) {
  return `async () => {
    const url = 'https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=2&ps=1&pn=1';
    try {
      const res = await fetch(url, { credentials: 'include' });
      const contentType = res.headers.get('content-type');
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      const first = json?.data?.replies?.[0] ?? null;
      return {
        status: res.status,
        contentType,
        code: json?.code ?? null,
        message: json?.message ?? null,
        firstComment: first ? {
          user: first.member?.uname ?? null,
          message: first.content?.message ?? null,
        } : null,
        sample: first ? null : text.slice(0, 300),
      };
    } catch (error) {
      return { error: String(error) };
    }
  }`;
}

async function inspectVideoAndComments(mcp) {
  try {
    await mcp.evaluateScript("() => { window.focus(); return true; }");
  } catch {
    // focus is best-effort
  }

  const state = await mcp.evaluateScript(STATE_EXPR);
  let apiReply = null;
  if (state.video?.aid) {
    apiReply = await mcp.evaluateScript(apiReplyExpr(state.video.aid));
  }

  let domComment = null;
  for (const y of [350, 500, 650, 800, 1000, 1300, 1800, 2400, 3200, 4200]) {
    await mcp.evaluateScript(`() => { window.focus(); window.scrollTo(0, ${y}); return true; }`);
    await delay(2000);
    domComment = await mcp.evaluateScript(domCommentExpr());
    if (domComment?.firstComment || domComment?.text) {
      break;
    }
  }

  return { state, apiReply, domComment };
}

async function main() {
  await requestJson("/json/version");
  const lease = await acquireBrowserLease(port, "mcp:probe-collect", { videoUrl: videoUrl ?? null });
  const mcp = new McpBrowser();
  try {
    await pickPage(mcp);

    const currentUrl = await mcp.evaluateScript("() => location.href");
    if (videoUrl) {
      await mcp.navigatePage(videoUrl);
      await delay(10_000);
      const pages = await mcp.listPages();
      const videoPage = pages.find((page) => page.url.includes("/video/")) ?? pages[0];
      if (videoPage) {
        await mcp.selectPage(videoPage.id, true);
      }
      try {
        await mcp.evaluateScript("() => { window.focus(); document.querySelector('video')?.pause(); return true; }");
      } catch {
        // pause is best-effort
      }
    } else if (forceHome || !String(currentUrl).includes("bilibili.com")) {
      await mcp.navigatePage(homeUrl);
      await delay(7000);
      await pickPage(mcp);
    }

    if (!videoUrl && openFirstVideo) {
      const firstVideo = await mcp.evaluateScript(FIRST_VIDEO_EXPR);
      if (firstVideo?.href) {
        await mcp.navigatePage(firstVideo.href);
        await delay(10_000);
        await pickPage(mcp);
      }
    }

    const summary = await inspectVideoAndComments(mcp);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mcp.close();
    await releaseBrowserLease(port, lease);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

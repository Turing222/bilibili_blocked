import http from "node:http";

const port = Number(readArg("--port") ?? 9223);
const openFirstVideo = process.argv.includes("--open-first-video");
const videoUrl = readArg("--video");
const forceHome = process.argv.includes("--home") || openFirstVideo;
const homeUrl = "https://www.bilibili.com/";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

function requestText(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.end();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
      } else {
        this.events.push(message);
      }
    };
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(cdp, expression, timeout = 15000) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function selectPage() {
  let pages = await requestJson("/json/list");
  let page =
    pages.find((item) => item.type === "page" && item.url.includes("www.bilibili.com/video/")) ??
    pages.find((item) => item.type === "page" && item.url.startsWith("https://www.bilibili.com/")) ??
    pages.find((item) => item.type === "page" && item.url.includes("bilibili.com")) ??
    pages.find((item) => item.type === "page");

  if (!page) {
    page = await requestJson(`/json/new?${encodeURIComponent(homeUrl)}`, "PUT");
  }

  return page;
}

async function main() {
  await requestJson("/json/version");
  const page = await selectPage();
  await requestText(`/json/activate/${page.id}`, "PUT").catch(() => {});
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");

  const currentUrl = await evaluate(cdp, "location.href");
  if (videoUrl) {
    await cdp.send("Page.navigate", { url: videoUrl });
    await delay(10000);
    await requestText(`/json/activate/${page.id}`, "PUT").catch(() => {});
    await evaluate(cdp, "window.focus(); document.querySelector('video')?.pause(); true").catch(() => {});
  } else if (forceHome || !currentUrl.includes("bilibili.com")) {
    await cdp.send("Page.navigate", { url: homeUrl });
    await delay(7000);
    await requestText(`/json/activate/${page.id}`, "PUT").catch(() => {});
  }

  if (!videoUrl && openFirstVideo) {
    const firstVideo = await evaluate(
      cdp,
      `(() => {
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
      })()`
    );

    if (firstVideo?.href) {
      await cdp.send("Page.navigate", { url: firstVideo.href });
      await delay(10000);
      await requestText(`/json/activate/${page.id}`, "PUT").catch(() => {});
    }
  }

  const summary = await inspectVideoAndComments(cdp);
  console.log(JSON.stringify(summary, null, 2));
  cdp.close();
}

async function inspectVideoAndComments(cdp) {
  await evaluate(cdp, "window.focus(); true").catch(() => {});
  const state = await evaluate(
    cdp,
    `(() => ({
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
    }))()`
  );

  let apiReply = null;
  if (state.video.aid) {
    apiReply = await evaluate(
      cdp,
      `(async () => {
        const url = 'https://api.bilibili.com/x/v2/reply?type=1&oid=${state.video.aid}&sort=2&ps=1&pn=1';
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
      })()`,
      20000
    );
  }

  let domComment = null;
  for (const y of [350, 500, 650, 800, 1000, 1300, 1800, 2400, 3200, 4200]) {
    await evaluate(cdp, `window.focus(); window.scrollTo(0, ${y}); true`);
    await delay(2000);
    domComment = await evaluate(
      cdp,
      `(() => {
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
      })()`
    );
    if (domComment?.firstComment || domComment?.text) {
      break;
    }
  }

  return { state, apiReply, domComment };
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

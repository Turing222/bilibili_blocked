/**
 * Normalize inspect / MCP probe JSON for stable oracle diff.
 * Strips or sorts volatile fields listed in tool-layer-evolution-plan.md §7 阶段 1.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

const VOLATILE_KEYS = new Set([
  "requestId",
  "startedAt",
  "timestamp",
  "time",
  "sample",
  "text",
  "richTextDom",
  "debuggerUrl",
  "webSocketDebuggerUrl",
  "id",
  "pageId",
  "selected",
]);

export function normalizeUrl(value) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value.split("?")[0].split("#")[0];
  }
}

function normalizeCommentHost(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  return {
    tag: entry.tag ?? null,
    id: entry.id ?? null,
    className: entry.className ?? null,
    hasShadowRoot: !!entry.hasShadowRoot,
  };
}

function normalizeFirstComment(comment) {
  if (!comment || typeof comment !== "object") {
    return comment;
  }
  return {
    user: comment.user ?? null,
    message: comment.message ?? null,
    rpid: comment.rpid ?? null,
    oid: comment.oid ?? null,
    like: comment.like ?? null,
    isPinned: !!comment.isPinned,
  };
}

function normalizeDomComment(domComment) {
  if (!domComment || typeof domComment !== "object") {
    return domComment;
  }
  return {
    selector: domComment.selector ?? null,
    componentTree: Array.isArray(domComment.componentTree) ? [...domComment.componentTree] : null,
    tag: domComment.tag ?? null,
    hasShadowRoot: !!domComment.hasShadowRoot,
    firstComment: normalizeFirstComment(domComment.firstComment),
  };
}

function normalizeApiReply(apiReply) {
  if (!apiReply || typeof apiReply !== "object") {
    return apiReply;
  }
  return {
    status: apiReply.status ?? null,
    contentType: apiReply.contentType ?? null,
    code: apiReply.code ?? null,
    message: apiReply.message ?? null,
    firstComment: normalizeFirstComment(apiReply.firstComment),
    error: apiReply.error ?? null,
  };
}

export function normalizeInspectResult(raw) {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const state = raw.state ?? {};
  const video = state.video ?? {};

  return {
    state: {
      url: normalizeUrl(state.url),
      title: state.title ?? null,
      loggedInHints: {
        hasLoginText: !!state.loggedInHints?.hasLoginText,
        cookieNames: [...(state.loggedInHints?.cookieNames ?? [])].sort(),
      },
      video: {
        aid: video.aid ?? null,
        bvid: video.bvid ?? null,
      },
      commentHosts: [...(state.commentHosts ?? [])]
        .map(normalizeCommentHost)
        .sort((a, b) => `${a.tag}:${a.id}`.localeCompare(`${b.tag}:${b.id}`)),
    },
    apiReply: normalizeApiReply(raw.apiReply),
    domComment: normalizeDomComment(raw.domComment),
  };
}

export function deepEqual(a, b, path = "") {
  const diffs = [];

  if (a === b) {
    return diffs;
  }

  if (typeof a !== typeof b) {
    diffs.push({ path: path || "(root)", expected: a, actual: b });
    return diffs;
  }

  if (a === null || b === null || typeof a !== "object") {
    if (a !== b) {
      diffs.push({ path: path || "(root)", expected: a, actual: b });
    }
    return diffs;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      diffs.push({ path: path || "(root)", expected: a, actual: b });
      return diffs;
    }
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      diffs.push(...deepEqual(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of [...keys].sort()) {
    if (VOLATILE_KEYS.has(key)) {
      continue;
    }
    diffs.push(...deepEqual(a[key], b[key], path ? `${path}.${key}` : key));
  }
  return diffs;
}

export function diffInspectResults(left, right) {
  return deepEqual(normalizeInspectResult(left), normalizeInspectResult(right));
}

function readJsonArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function readJsonFile(filePath) {
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function main() {
  const leftPath = readJsonArg("--left");
  const rightPath = readJsonArg("--right");
  if (!leftPath || !rightPath) {
    console.error("Usage: node normalize-results.mjs --left oracle.json --right mcp.json");
    process.exit(2);
  }

  const left = await readJsonFile(leftPath);
  const right = await readJsonFile(rightPath);
  const diffs = diffInspectResults(left, right);

  if (diffs.length === 0) {
    console.log(JSON.stringify({ ok: true, diffs: [] }, null, 2));
    return;
  }

  console.log(JSON.stringify({ ok: false, diffs }, null, 2));
  process.exit(1);
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

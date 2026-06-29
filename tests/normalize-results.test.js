import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  diffInspectResults,
  normalizeInspectResult,
  normalizeUrl,
} from "../tools/bilibili-browser/normalize-results.mjs";

describe("normalizeUrl", () => {
  it("strips query and hash", () => {
    assert.equal(
      normalizeUrl("https://www.bilibili.com/video/BV1abc?t=1#reply"),
      "https://www.bilibili.com/video/BV1abc"
    );
  });
});

describe("normalizeInspectResult", () => {
  it("sorts cookie names and comment hosts", () => {
    const normalized = normalizeInspectResult({
      state: {
        url: "https://www.bilibili.com/?spm=1",
        title: "t",
        loggedInHints: { hasLoginText: true, cookieNames: ["b", "a"] },
        video: { aid: 1, bvid: "BV1" },
        commentHosts: [{ tag: "B", id: "2" }, { tag: "A", id: "1" }],
      },
      apiReply: { status: 200, code: 0, firstComment: { user: "u", message: "m" } },
      domComment: { selector: "x", firstComment: { user: "u", message: "m" } },
    });

    assert.deepEqual(normalized.state.loggedInHints.cookieNames, ["a", "b"]);
    assert.equal(normalized.state.url, "https://www.bilibili.com");
    assert.equal(normalized.state.commentHosts[0].tag, "A");
  });
});

describe("diffInspectResults", () => {
  it("ignores volatile dom text fields", () => {
    const left = {
      state: { url: "https://www.bilibili.com/video/BV1", title: "t", loggedInHints: { hasLoginText: false, cookieNames: [] }, video: { aid: null, bvid: "BV1" }, commentHosts: [] },
      apiReply: null,
      domComment: { selector: "s", firstComment: { user: "u", message: "hello" }, text: "hello" },
    };
    const right = {
      ...left,
      domComment: { ...left.domComment, text: "hello world" },
    };
    assert.deepEqual(diffInspectResults(left, right), []);
  });

  it("reports semantic mismatches", () => {
    const left = {
      state: { url: "https://www.bilibili.com/video/BV1", title: "t", loggedInHints: { hasLoginText: false, cookieNames: [] }, video: { aid: 1, bvid: "BV1" }, commentHosts: [] },
      apiReply: null,
      domComment: null,
    };
    const right = {
      ...left,
      state: { ...left.state, video: { aid: 2, bvid: "BV2" } },
    };
    assert.ok(diffInspectResults(left, right).length > 0);
  });
});

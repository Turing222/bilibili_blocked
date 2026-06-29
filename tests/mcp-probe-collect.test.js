import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractToolJson } from "../tools/bilibili-browser/mcp-probe-collect.mjs";

describe("extractToolJson", () => {
  it("unwraps evaluate_script JSON from structuredContent.message", () => {
    const parsed = extractToolJson({
      structuredContent: {
        message: 'Script ran on page and returned:\n```json\n{"state":{"url":"https://www.bilibili.com/video/BV1"}}\n```',
      },
    });

    assert.deepEqual(parsed, {
      state: { url: "https://www.bilibili.com/video/BV1" },
    });
  });

  it("keeps native structured content for list_pages", () => {
    const parsed = extractToolJson({
      structuredContent: {
        pages: [{ id: 0, url: "https://www.bilibili.com/", selected: true }],
      },
    });

    assert.deepEqual(parsed.pages, [
      { id: 0, url: "https://www.bilibili.com/", selected: true },
    ]);
  });
});

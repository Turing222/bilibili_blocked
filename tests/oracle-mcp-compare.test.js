import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMcpArgs } from "../tools/bilibili-browser/oracle-mcp-compare.mjs";

describe("buildMcpArgs", () => {
  it("pins MCP collection to the oracle video selected by --open-first-video", () => {
    assert.deepEqual(
      buildMcpArgs(["--open-first-video"], {
        state: { url: "https://www.bilibili.com/video/BV1abc" },
      }),
      ["--open-first-video", "--video", "https://www.bilibili.com/video/BV1abc"]
    );
  });

  it("keeps an explicit --video unchanged", () => {
    assert.deepEqual(
      buildMcpArgs(["--open-first-video", "--video", "https://www.bilibili.com/video/BVfixed"], {
        state: { url: "https://www.bilibili.com/video/BVother" },
      }),
      ["--open-first-video", "--video", "https://www.bilibili.com/video/BVfixed"]
    );
  });
});

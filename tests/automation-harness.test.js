import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    readArg,
    cleanText,
    createRunId,
    createRecorder,
    toRelative,
    writeRunFiles,
    selectPage,
} from "../scripts/lib/harness.js";

describe("readArg", () => {
    it("reads the value following a flag from an injected argv", () => {
        const argv = ["node", "script.mjs", "--port", "9333", "--video", "BV1"];
        assert.equal(readArg("--port", argv), "9333");
        assert.equal(readArg("--video", argv), "BV1");
    });

    it("returns undefined for a missing flag", () => {
        assert.equal(readArg("--missing", ["node", "s.mjs"]), undefined);
    });

    it("returns undefined when the flag is last with no value", () => {
        assert.equal(readArg("--port", ["node", "s.mjs", "--port"]), undefined);
    });
});

describe("cleanText", () => {
    it("collapses whitespace and trims", () => {
        assert.equal(cleanText("  a\n\t b   c "), "a b c");
    });

    it("maps null and undefined to an empty string", () => {
        assert.equal(cleanText(null), "");
        assert.equal(cleanText(undefined), "");
    });

    it("truncates to the max length", () => {
        assert.equal(cleanText("abcdef", 3), "abc");
    });
});

describe("createRunId", () => {
    it("produces a filesystem-safe timestamp without colons or dots", () => {
        const id = createRunId();
        assert.ok(!id.includes(":"));
        assert.ok(!id.includes("."));
        assert.match(id, /^\d{4}-\d{2}-\d{2}T/);
    });
});

describe("createRecorder", () => {
    it("records events with relative timing, kind and extra data", () => {
        const recorder = createRecorder();
        recorder.mark("run.start", { endpoint: "x" });
        recorder.mark("run.end", { ok: true });

        assert.equal(recorder.events.length, 2);
        const [first, second] = recorder.events;
        assert.equal(first.kind, "run.start");
        assert.equal(first.endpoint, "x");
        assert.equal(typeof first.t, "number");
        assert.equal(typeof first.ts, "string");
        assert.equal(second.kind, "run.end");
        assert.equal(second.ok, true);
        assert.ok(second.t >= first.t);
    });
});

describe("toRelative", () => {
    it("returns '.' for the current working directory", () => {
        assert.equal(toRelative(process.cwd()), ".");
    });

    it("returns a path relative to cwd", () => {
        const abs = path.join(process.cwd(), "artifacts", "run");
        assert.equal(toRelative(abs), path.join("artifacts", "run"));
    });
});

describe("writeRunFiles", () => {
    it("writes result.json and events.jsonl that round-trip", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-"));
        try {
            const result = { ok: true, bvid: "BV1", nested: { a: 1 } };
            const events = [
                { t: 0, kind: "run.start" },
                { t: 5, kind: "run.end" },
            ];
            const { resultPath, eventsPath } = await writeRunFiles(dir, result, events);

            const parsedResult = JSON.parse(await fs.readFile(resultPath, "utf8"));
            assert.deepEqual(parsedResult, result);

            const lines = (await fs.readFile(eventsPath, "utf8")).trim().split("\n");
            assert.equal(lines.length, events.length);
            assert.deepEqual(JSON.parse(lines[0]), events[0]);
            assert.deepEqual(JSON.parse(lines[1]), events[1]);
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});

function makeContext(urls) {
    const pages = urls.map((url) => ({ url: () => url }));
    const state = { newPageCalls: 0 };
    return {
        state,
        pages: () => pages,
        async newPage() {
            state.newPageCalls += 1;
            return { url: () => "about:blank", isNew: true };
        },
    };
}

describe("selectPage", () => {
    it("matches prefer needles in priority order", async () => {
        const context = makeContext([
            "https://www.bilibili.com/",
            "https://www.bilibili.com/video/BV1",
        ]);
        const page = await selectPage(context, ["www.bilibili.com/video/", "bilibili.com"]);
        assert.equal(page.url(), "https://www.bilibili.com/video/BV1");
    });

    it("falls through to the next needle when the first misses", async () => {
        const context = makeContext(["https://www.bilibili.com/"]);
        const page = await selectPage(context, ["www.bilibili.com/video/", "bilibili.com"]);
        assert.equal(page.url(), "https://www.bilibili.com/");
    });

    it("falls back to the first page when no needle matches (single-needle case)", async () => {
        const context = makeContext(["https://example.com/", "https://other.com/"]);
        const page = await selectPage(context, ["www.bilibili.com"]);
        assert.equal(page.url(), "https://example.com/");
    });

    it("opens a new page when the context has none", async () => {
        const context = makeContext([]);
        const page = await selectPage(context, ["www.bilibili.com"]);
        assert.equal(context.state.newPageCalls, 1);
        assert.equal(page.isNew, true);
    });
});

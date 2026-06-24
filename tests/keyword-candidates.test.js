import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getKeywordCandidates } from "../src/utils/keyword-candidates.js";
import {
    collectSelectedKeywords,
    hasQuickBlockSelection,
} from "../src/utils/multi-select-chips.js";

describe("getKeywordCandidates", () => {
    it("extracts bracketed and segmented parts from text", () => {
        const candidates = getKeywordCandidates("【广告】这是一条测试评论，快来看看");
        assert.ok(candidates.includes("广告"));
    });

    it("returns an empty list for blank text", () => {
        assert.deepEqual(getKeywordCandidates(""), []);
    });
});

describe("multi-select chip helpers", () => {
    it("merges selected chips with manual input without duplicates", () => {
        const selected = new Set(["广告", "测试"]);
        assert.deepEqual(collectSelectedKeywords(selected, "测试"), ["广告", "测试"]);
        assert.deepEqual(collectSelectedKeywords(selected, "额外"), ["广告", "测试", "额外"]);
    });

    it("detects whether there is anything to block", () => {
        assert.equal(hasQuickBlockSelection(new Set(), ""), false);
        assert.equal(hasQuickBlockSelection(new Set(["广告"]), ""), true);
        assert.equal(hasQuickBlockSelection(new Set(), "广告"), true);
    });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createUpBlockStatsStore } from "../src/state/up-block-stats-store.js";

function blockVideo(store, bv, upUid, upName = "测试UP") {
    return store.recordBlockedVideo(bv, {
        videoBv: bv,
        videoUpUid: upUid,
        videoUpName: upName,
        videoTitle: `视频-${bv}`,
        triggeredBlockedRules: ["按标题屏蔽: x"],
    });
}

describe("createUpBlockStatsStore", () => {
    it("counts a blocked video once and deduplicates by bv+upUid", () => {
        const store = createUpBlockStatsStore();

        assert.equal(blockVideo(store, "BV1", "100"), true);
        assert.equal(blockVideo(store, "BV1", "100"), false);

        const suggestions = store.getSuggestions(1);
        assert.equal(suggestions.length, 1);
        assert.equal(suggestions[0].blockedCount, 1);
    });

    it("aggregates blocked counts per upUid across distinct videos", () => {
        const store = createUpBlockStatsStore();

        blockVideo(store, "BV1", "100");
        blockVideo(store, "BV2", "100");
        blockVideo(store, "BV3", "200");

        const suggestions = store.getSuggestions(2);
        assert.deepEqual(suggestions.map((item) => item.upUid), ["100"]);
        assert.equal(suggestions[0].blockedCount, 2);
    });

    it("prunes countedVideoKeys and keeps blockedCount in sync with the live window", () => {
        const store = createUpBlockStatsStore();
        const upUid = "100";

        for (let i = 0; i < 2500; i++) {
            blockVideo(store, `BV${i}`, upUid);
        }

        // prune 后窗口只保留最近 MAX_COUNTED_VIDEO_KEYS 条，blockedCount 等于窗口内在册数。
        const suggestions = store.getSuggestions(1);
        assert.equal(suggestions.length, 1);
        assert.equal(suggestions[0].blockedCount, 2000);

        // 窗口已饱和：新视频进入会挤掉最旧的一条，blockedCount 维持在窗口上限，不再增长。
        const newVideo = blockVideo(store, "BV-new-after-prune", upUid);
        assert.equal(newVideo, true);
        assert.equal(store.getSuggestions(1)[0].blockedCount, 2000);
    });

    it("does not double-count a video that is still inside the dedup window", () => {
        const store = createUpBlockStatsStore();
        const upUid = "100";

        assert.equal(blockVideo(store, "BV1", upUid), true);
        // 同 BV+UP 仍在窗口内，重复屏蔽不重复计数。
        assert.equal(blockVideo(store, "BV1", upUid), false);

        assert.equal(store.getSuggestions(1)[0].blockedCount, 1);
    });

    it("rebuilds blockedCount from countedVideoKeys on load, fixing legacy inflated counts", () => {
        // 模拟旧版数据：blockedCount 被虚高写成 9999，但 countedVideoKeys 里只有一个 key。
        const legacyData = {
            ups: {
                "100": {
                    upUid: "100",
                    upName: "测试UP",
                    blockedCount: 9999,
                    lastReason: "按标题屏蔽: x",
                    lastVideoTitle: "视频-BV1",
                    lastVideoBv: "BV1",
                    updatedAt: 1000,
                },
            },
            countedVideoKeys: { "BV1:100": true },
        };
        globalThis.GM_getValue = (key) => (key === "GM_blockedUpStats" ? legacyData : undefined);

        const store = createUpBlockStatsStore();
        const suggestions = store.getSuggestions(1);
        assert.equal(suggestions[0].blockedCount, 1);

        delete globalThis.GM_getValue;
    });
});

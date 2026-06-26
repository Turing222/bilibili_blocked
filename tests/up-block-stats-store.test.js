import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createUpBlockStatsStore } from "../src/state/up-block-stats-store.js";

const originalGMGetValue = globalThis.GM_getValue;
const originalGMSetValue = globalThis.GM_setValue;
const originalDateNow = Date.now;

let gmStorage;
let now;

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function blockVideo(store, bv, upUid, upName = "Test UP") {
    return store.recordBlockedVideo(bv, {
        videoBv: bv,
        videoUpUid: upUid,
        videoUpName: upName,
        videoTitle: `Video-${bv}`,
        triggeredBlockedRules: ["Blocked by title: x"],
    });
}

describe("createUpBlockStatsStore", () => {
    beforeEach(() => {
        gmStorage = {};
        now = 1_000;
        globalThis.GM_getValue = (key, fallbackValue) => (
            Object.prototype.hasOwnProperty.call(gmStorage, key) ? clone(gmStorage[key]) : fallbackValue
        );
        globalThis.GM_setValue = (key, value) => {
            gmStorage[key] = clone(value);
        };
        Date.now = () => now;
    });

    afterEach(() => {
        if (originalGMGetValue) {
            globalThis.GM_getValue = originalGMGetValue;
        } else {
            delete globalThis.GM_getValue;
        }

        if (originalGMSetValue) {
            globalThis.GM_setValue = originalGMSetValue;
        } else {
            delete globalThis.GM_setValue;
        }

        Date.now = originalDateNow;
    });

    it("deduplicates a blocked video within one store instance", () => {
        const store = createUpBlockStatsStore();

        assert.equal(blockVideo(store, "BV1", "100"), true);
        assert.equal(blockVideo(store, "BV1", "100"), false);

        const suggestions = store.getSuggestions(1);
        assert.equal(suggestions.length, 1);
        assert.equal(suggestions[0].blockedCount, 1);
        assert.deepEqual(Object.keys(gmStorage.GM_blockedUpStats), ["version", "ups"]);
        assert.equal(gmStorage.GM_blockedUpStats.version, 2);
        assert.equal(gmStorage.GM_blockedUpStats.ups["100"].blockedCount, 1);
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

    it("allows the same video to be counted again after store recreation", () => {
        const firstStore = createUpBlockStatsStore();

        assert.equal(blockVideo(firstStore, "BV1", "100"), true);
        assert.equal(blockVideo(firstStore, "BV1", "100"), false);
        assert.equal(firstStore.getSuggestions(1)[0].blockedCount, 1);

        const secondStore = createUpBlockStatsStore();

        assert.equal(blockVideo(secondStore, "BV1", "100"), true);
        assert.equal(secondStore.getSuggestions(1)[0].blockedCount, 2);
        assert.equal(gmStorage.GM_blockedUpStats.ups["100"].blockedCount, 2);
    });

    it("persists long-lived counts without a countedVideoKeys payload", () => {
        const store = createUpBlockStatsStore();

        for (let i = 0; i < 2500; i++) {
            assert.equal(blockVideo(store, `BV${i}`, "100"), true);
        }

        const persisted = gmStorage.GM_blockedUpStats;
        assert.equal(persisted.version, 2);
        assert.equal(Object.prototype.hasOwnProperty.call(persisted, "countedVideoKeys"), false);
        assert.equal(persisted.ups["100"].blockedCount, 2500);
        assert.equal(store.getSuggestions(1)[0].blockedCount, 2500);
    });

    it("preserves legacy blockedCount and drops countedVideoKeys on load", () => {
        gmStorage.GM_blockedUpStats = {
            ups: {
                "100": {
                    upUid: "100",
                    upName: "Test UP",
                    blockedCount: 9999,
                    lastReason: "Blocked by title: x",
                    lastVideoTitle: "Video-BV1",
                    lastVideoBv: "BV1",
                    updatedAt: 1000,
                },
            },
            countedVideoKeys: { "BV1:100": true },
        };

        const store = createUpBlockStatsStore();

        assert.equal(store.getSuggestions(1)[0].blockedCount, 9999);
        assert.deepEqual(Object.keys(gmStorage.GM_blockedUpStats), ["version", "ups"]);
        assert.equal(gmStorage.GM_blockedUpStats.version, 2);
        assert.equal(gmStorage.GM_blockedUpStats.ups["100"].blockedCount, 9999);
        assert.equal(blockVideo(store, "BV2", "100"), true);
        assert.equal(gmStorage.GM_blockedUpStats.ups["100"].blockedCount, 10000);
        assert.equal(Object.prototype.hasOwnProperty.call(gmStorage.GM_blockedUpStats, "countedVideoKeys"), false);
    });

    it("uses legacy countedVideoKeys only when no up aggregate exists", () => {
        gmStorage.GM_blockedUpStats = {
            countedVideoKeys: {
                "BV1:100": true,
                "BV2:100": {},
                "BV3:200": true,
            },
        };

        const store = createUpBlockStatsStore();
        const suggestions = store.getSuggestions(1);

        assert.deepEqual(
            suggestions.map((item) => [item.upUid, item.blockedCount]),
            [["100", 2], ["200", 1]]
        );
        assert.deepEqual(Object.keys(gmStorage.GM_blockedUpStats), ["version", "ups"]);
        assert.equal(gmStorage.GM_blockedUpStats.version, 2);
        assert.equal(Object.prototype.hasOwnProperty.call(gmStorage.GM_blockedUpStats, "countedVideoKeys"), false);
    });

    it("sorts suggestions by count and then updatedAt", () => {
        const store = createUpBlockStatsStore();

        now = 1_000;
        blockVideo(store, "BV1", "100");
        now = 2_000;
        blockVideo(store, "BV2", "200");
        now = 3_000;
        blockVideo(store, "BV3", "100");
        now = 4_000;
        blockVideo(store, "BV4", "200");
        now = 5_000;
        blockVideo(store, "BV5", "300");

        assert.deepEqual(
            store.getSuggestions(1).map((item) => item.upUid),
            ["200", "100", "300"]
        );
    });
});

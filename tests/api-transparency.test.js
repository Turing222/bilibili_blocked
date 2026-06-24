import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tagsFeature } from "../src/features/tags.js";
import { videoStatsFeature } from "../src/features/video-stats.js";
import {
    API_DATA_KEYS,
    API_DATA_STATUS,
    createApiHealthStore,
} from "../src/platform/api-health.js";
import { createVideoStore } from "../src/state/video-store.js";

const bv = "BV1api";

function createApiClientWithStatus(status) {
    const calls = {
        tags: 0,
        view: 0,
    };

    return {
        calls,
        getVideoDataStatus() {
            return { status };
        },
        requestVideoTagsIfNeeded() {
            calls.tags++;
        },
        requestVideoInfoIfNeeded() {
            calls.view++;
        },
    };
}

describe("api health store", () => {
    it("records endpoint and capability failures separately", () => {
        const apiHealth = createApiHealthStore({ unavailableThreshold: 2 });

        apiHealth.recordFailure({
            capabilityId: "tags",
            endpointId: "video-tags",
            httpStatus: 200,
            apiCode: -403,
            errorKind: "api-code",
        });
        apiHealth.recordFailure({
            capabilityId: "tags",
            endpointId: "video-tags",
            httpStatus: 200,
            apiCode: -403,
            errorKind: "api-code",
        });

        const capability = apiHealth.getCapabilitySnapshot("tags");
        const endpoint = apiHealth.getEndpointSnapshot("video-tags");

        assert.equal(capability.status, "unavailable");
        assert.equal(capability.consecutiveFailures, 2);
        assert.equal(endpoint.failureCount, 2);
        assert.equal(endpoint.lastEvent.apiCode, -403);
    });

    it("keeps empty responses visible without treating them as failures", () => {
        const apiHealth = createApiHealthStore();

        apiHealth.recordEmpty({
            capabilityId: "tags",
            endpointId: "video-tags",
            httpStatus: 200,
            apiCode: 0,
        });

        const capability = apiHealth.getCapabilitySnapshot("tags");

        assert.equal(capability.status, "normal");
        assert.equal(capability.successCount, 1);
        assert.equal(capability.emptyCount, 1);
        assert.equal(capability.failureCount, 0);
    });
});

describe("api data status in rule features", () => {
    it("does not block later features when tags API is unavailable", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo(bv, { videoTitle: "测试" });
        const apiClient = createApiClientWithStatus(API_DATA_STATUS.UNAVAILABLE);

        const isReady = tagsFeature.run({
            videoBv: bv,
            settings: {
                blockedTag_Switch: true,
                blockedTag_Array: ["动画"],
                doubleBlockedTag_Switch: false,
                doubleBlockedTag_Array: [],
            },
            apiClient,
            videoStore,
        });

        assert.equal(isReady, true);
        assert.equal(apiClient.calls.tags, 0);
    });

    it("keeps waiting while video view data is pending", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo(bv, { videoTitle: "测试" });
        const apiClient = createApiClientWithStatus(API_DATA_STATUS.PENDING);

        const isReady = videoStatsFeature.run({
            videoBv: bv,
            settings: {
                blockedShortDuration_Switch: true,
                blockedShortDuration: 60,
                blockedBelowVideoViews_Switch: false,
                blockedBelowVideoViews: 0,
                blockedBelowLikesRate_Switch: false,
                blockedBelowLikesRate: 0,
                blockedBelowCoinRate_Switch: false,
                blockedBelowCoinRate: 0,
                blockedAboveFavoriteCoinRatio_Switch: false,
                blockedAboveFavoriteCoinRatio: 0,
                blockedPortraitVideo_Switch: false,
                blockedChargingExclusive_Switch: false,
                blockedVideoPartitions_Switch: false,
                blockedVideoPartitions_Array: [],
            },
            apiClient,
            videoStore,
        });

        assert.equal(isReady, false);
        assert.equal(apiClient.calls.view, 1);
    });

    it("uses the expected data status keys", () => {
        assert.equal(API_DATA_KEYS.VIDEO_TAGS, "videoTags");
        assert.equal(API_DATA_KEYS.VIDEO_VIEW, "videoView");
    });
});

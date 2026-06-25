import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSettingsStore } from "../src/settings/storage.js";
import { createVideoStore } from "../src/state/video-store.js";

const bv = "BV1test";

function seedVideo(videoStore, overrides = {}) {
    videoStore.mergeVideoInfo(bv, {
        videoTitle: "测试标题",
        videoUpName: "测试UP",
        videoUpUid: "12345",
        ...overrides,
    });
}

describe("applyTitleAndUpRules", () => {
    it("blocks video when title exactly matches (non-regex)", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "原神" });

        videoStore.applyTitleAndUpRules(bv, {
            blockedTitle_Switch: true,
            blockedTitle_UseRegular: false,
            blockedTitle_Array: ["原神"],
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("does not block when title is substring but not exact match (non-regex)", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "原神攻略" });

        // findMatch uses === in non-regex mode, so "原神" !== "原神攻略"
        videoStore.applyTitleAndUpRules(bv, {
            blockedTitle_Switch: true,
            blockedTitle_UseRegular: false,
            blockedTitle_Array: ["原神"],
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("does not block when title switch is off", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "原神" });

        videoStore.applyTitleAndUpRules(bv, {
            blockedTitle_Switch: false,
            blockedTitle_UseRegular: false,
            blockedTitle_Array: ["原神"],
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("does not block when videoTitle is missing", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: undefined });

        videoStore.applyTitleAndUpRules(bv, {
            blockedTitle_Switch: true,
            blockedTitle_UseRegular: false,
            blockedTitle_Array: ["原神"],
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("blocks video when title regex matches", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "原神攻略" });

        videoStore.applyTitleAndUpRules(bv, {
            blockedTitle_Switch: true,
            blockedTitle_UseRegular: true,
            blockedTitle_Array: ["原神"],
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks video when UP uid matches with loose equality", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoUpUid: 12345 });

        videoStore.applyTitleAndUpRules(bv, {
            blockedTitle_Switch: false,
            blockedTitle_Array: [],
            blockedUpUid_Switch: true,
            blockedUpUid_Array: ["12345"],
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks video when UP name keyword is included", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoUpName: "测试UP主" });

        videoStore.applyTitleAndUpRules(bv, {
            blockedTitle_Switch: false,
            blockedTitle_Array: [],
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            blockedUpNameKeyword_Switch: true,
            blockedUpNameKeyword_UseRegular: false,
            blockedUpNameKeyword_Array: ["UP"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("ignores invalid title regex without throwing", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "原神攻略" });

        assert.doesNotThrow(() => {
            videoStore.applyTitleAndUpRules(bv, {
                blockedTitle_Switch: true,
                blockedTitle_UseRegular: true,
                blockedTitle_Array: ["("],
                blockedUpUid_Switch: false,
                blockedUpUid_Array: [],
                blockedUpNameKeyword_Switch: false,
                blockedUpNameKeyword_Array: [],
            });
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });
});

describe("applyTagRules", () => {
    it("blocks video when a single tag matches", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTags: ["动画", "日常"] });

        videoStore.applyTagRules(bv, {
            blockedTag_Switch: true,
            blockedTag_UseRegular: false,
            blockedTag_Array: ["日常"],
            doubleBlockedTag_Switch: false,
            doubleBlockedTag_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.deepEqual(videoStore.getVideoInfo(bv).blockedReasons[0], {
            id: "按标签屏蔽\u0001blockedTag_Array\u0001日常\u0001日常\u0001按标签屏蔽: 日常",
            type: "按标签屏蔽",
            item: "日常",
            displayText: "按标签屏蔽: 日常",
            configKey: "blockedTag_Array",
            regularKey: "blockedTag_UseRegular",
            configValue: "日常",
            matchedValue: "日常",
            canRemoveConfig: true,
        });
    });

    it("blocks video when both tags in a double rule match", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTags: ["原神", "攻略", "抽卡"] });

        videoStore.applyTagRules(bv, {
            blockedTag_Switch: false,
            blockedTag_Array: [],
            doubleBlockedTag_Switch: true,
            doubleBlockedTag_UseRegular: false,
            doubleBlockedTag_Array: ["原神|攻略"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.equal(videoStore.getVideoInfo(bv).blockedReasons[0].configKey, "doubleBlockedTag_Array");
        assert.equal(videoStore.getVideoInfo(bv).blockedReasons[0].configValue, "原神|攻略");
        assert.equal(videoStore.getVideoInfo(bv).blockedReasons[0].matchedValue, "原神,攻略");
    });

    it("collects all matching single tag reasons for review without changing block state", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTags: ["tag-a", "tag-b", "tag-c"] });
        const settings = {
            blockedTag_Switch: true,
            blockedTag_UseRegular: false,
            blockedTag_Array: ["tag-a", "tag-b"],
            doubleBlockedTag_Switch: false,
            doubleBlockedTag_Array: [],
        };

        videoStore.applyTagRules(bv, settings);

        assert.equal(videoStore.getVideoInfo(bv).blockedReasons.length, 1);
        const reasons = videoStore.getReviewBlockedReasons(bv, settings);
        assert.deepEqual(reasons.map((reason) => reason.configValue), ["tag-a", "tag-b"]);
        assert.equal(videoStore.getVideoInfo(bv).blockedReasons.length, 1);
    });

    it("collects all matching double tag reasons for review without changing block state", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTags: ["tag-a", "tag-b", "tag-c"] });
        const settings = {
            blockedTag_Switch: false,
            blockedTag_Array: [],
            doubleBlockedTag_Switch: true,
            doubleBlockedTag_UseRegular: false,
            doubleBlockedTag_Array: ["tag-a|tag-b", "tag-a|tag-c"],
        };

        videoStore.applyTagRules(bv, settings);

        assert.equal(videoStore.getVideoInfo(bv).blockedReasons.length, 1);
        const reasons = videoStore.getReviewBlockedReasons(bv, settings);
        assert.deepEqual(reasons.map((reason) => reason.configValue), ["tag-a|tag-b", "tag-a|tag-c"]);
        assert.equal(videoStore.getVideoInfo(bv).blockedReasons.length, 1);
    });
});

describe("applyVideoStatsRules", () => {
    it("blocks short duration videos", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoDuration: 30 });

        videoStore.applyVideoStatsRules(bv, {
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
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks videos below likes rate threshold", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoLikesRate: 1.5 });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: false,
            blockedBelowVideoViews: 0,
            blockedBelowLikesRate_Switch: true,
            blockedBelowLikesRate: 2,
            blockedBelowCoinRate_Switch: false,
            blockedBelowCoinRate: 0,
            blockedAboveFavoriteCoinRatio_Switch: false,
            blockedAboveFavoriteCoinRatio: 0,
            blockedPortraitVideo_Switch: false,
            blockedChargingExclusive_Switch: false,
            blockedVideoPartitions_Switch: false,
            blockedVideoPartitions_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks videos with a real 0% likes rate (not treated as missing data)", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoLikesRate: 0 });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: false,
            blockedBelowVideoViews: 0,
            blockedBelowLikesRate_Switch: true,
            blockedBelowLikesRate: 2,
            blockedBelowCoinRate_Switch: false,
            blockedBelowCoinRate: 0,
            blockedAboveFavoriteCoinRatio_Switch: false,
            blockedAboveFavoriteCoinRatio: 0,
            blockedPortraitVideo_Switch: false,
            blockedChargingExclusive_Switch: false,
            blockedVideoPartitions_Switch: false,
            blockedVideoPartitions_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.ok(videoStore.getVideoInfo(bv).triggeredBlockedRules.some((r) => r.includes("屏蔽低点赞率")));
    });

    it("blocks videos below likes rate threshold with string-like imported threshold", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoLikesRate: 1.5 });

        const settingsStore = createSettingsStore();
        const normalized = settingsStore.normalizeSettings({
            blockedBelowLikesRate_Switch: true,
            blockedBelowLikesRate: "2",
        });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: false,
            blockedBelowVideoViews: 0,
            blockedBelowLikesRate_Switch: normalized.blockedBelowLikesRate_Switch,
            blockedBelowLikesRate: normalized.blockedBelowLikesRate,
            blockedBelowCoinRate_Switch: false,
            blockedBelowCoinRate: 0,
            blockedAboveFavoriteCoinRatio_Switch: false,
            blockedAboveFavoriteCoinRatio: 0,
            blockedPortraitVideo_Switch: false,
            blockedChargingExclusive_Switch: false,
            blockedVideoPartitions_Switch: false,
            blockedVideoPartitions_Array: [],
        });

        assert.equal(typeof normalized.blockedBelowLikesRate, "number");
        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("skips favorite/coin ratio rule for new or low-traffic videos", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, {
            videoView: 1000,
            videoFavorite: 100,
            videoFavoriteCoinRatio: 20,
            videoPubdate: Math.floor(Date.now() / 1000),
        });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: false,
            blockedBelowVideoViews: 0,
            blockedBelowLikesRate_Switch: false,
            blockedBelowLikesRate: 0,
            blockedBelowCoinRate_Switch: false,
            blockedBelowCoinRate: 0,
            blockedAboveFavoriteCoinRatio_Switch: true,
            blockedAboveFavoriteCoinRatio: 10,
            blockedPortraitVideo_Switch: false,
            blockedChargingExclusive_Switch: false,
            blockedVideoPartitions_Switch: false,
            blockedVideoPartitions_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("blocks favorite/coin ratio rule when coins are zero (ratio treated as infinite)", () => {
        const videoStore = createVideoStore();
        // safeRatio 在投币为 0 时返回 null，这里直接用 null 模拟该状态。
        seedVideo(videoStore, {
            videoView: 10000,
            videoFavorite: 100,
            videoCoin: 0,
            videoFavoriteCoinRatio: null,
            videoPubdate: Math.floor(Date.now() / 1000) - 7200,
        });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: false,
            blockedBelowVideoViews: 0,
            blockedBelowLikesRate_Switch: false,
            blockedBelowLikesRate: 0,
            blockedBelowCoinRate_Switch: false,
            blockedBelowCoinRate: 0,
            blockedAboveFavoriteCoinRatio_Switch: true,
            blockedAboveFavoriteCoinRatio: 10,
            blockedPortraitVideo_Switch: false,
            blockedChargingExclusive_Switch: false,
            blockedVideoPartitions_Switch: false,
            blockedVideoPartitions_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.ok(videoStore.getVideoInfo(bv).triggeredBlockedRules.some((r) => r.includes("屏蔽高收藏投币比")));
    });

    it("blocks videos with zero views when threshold is above zero", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoView: 0 });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: true,
            blockedBelowVideoViews: 100,
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
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks videos below views threshold with non-zero views", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoView: 50 });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: true,
            blockedBelowVideoViews: 1000,
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
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("does not block when views equal threshold", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoView: 1000 });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: true,
            blockedBelowVideoViews: 1000,
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
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("blocks videos below coin rate threshold", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoCoinRate: 1.5 });

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: false,
            blockedBelowVideoViews: 0,
            blockedBelowLikesRate_Switch: false,
            blockedBelowLikesRate: 0,
            blockedBelowCoinRate_Switch: true,
            blockedBelowCoinRate: 3,
            blockedAboveFavoriteCoinRatio_Switch: false,
            blockedAboveFavoriteCoinRatio: 0,
            blockedPortraitVideo_Switch: false,
            blockedChargingExclusive_Switch: false,
            blockedVideoPartitions_Switch: false,
            blockedVideoPartitions_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.ok(videoStore.getVideoInfo(bv).triggeredBlockedRules.some((r) => r.includes("屏蔽低投币率")));
    });
});

describe("applyUpProfileRules", () => {
    it("blocks videos from low-level UP accounts", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        videoStore.mergeUpInfo("12345", { upLevel: 2, upFans: 100, upSign: "hello" });

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: true,
            blockedBelowUpLevel: 4,
            blockedBelowUpFans_Switch: false,
            blockedBelowUpFans: 0,
            blockedUpSigns_Switch: false,
            blockedUpSigns_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks level-0 UP accounts when threshold is above zero", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        videoStore.mergeUpInfo("12345", { upLevel: 0, upFans: 100, upSign: "hello" });

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: true,
            blockedBelowUpLevel: 1,
            blockedBelowUpFans_Switch: false,
            blockedBelowUpFans: 0,
            blockedUpSigns_Switch: false,
            blockedUpSigns_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks UP accounts with zero fans when threshold is above zero", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        videoStore.mergeUpInfo("12345", { upLevel: 5, upFans: 0, upSign: "hello" });

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: false,
            blockedBelowUpLevel: 0,
            blockedBelowUpFans_Switch: true,
            blockedBelowUpFans: 1,
            blockedUpSigns_Switch: false,
            blockedUpSigns_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("blocks when UP sign exactly matches (non-regex)", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        videoStore.mergeUpInfo("12345", { upLevel: 5, upFans: 10000, upSign: "商务合作" });

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: false,
            blockedBelowUpLevel: 0,
            blockedBelowUpFans_Switch: false,
            blockedBelowUpFans: 0,
            blockedUpSigns_Switch: true,
            blockedUpSigns_UseRegular: false,
            blockedUpSigns_Array: ["商务合作"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.ok(videoStore.getVideoInfo(bv).triggeredBlockedRules.some((r) => r.includes("按UP主简介屏蔽")));
    });

    it("blocks when UP sign matches via regex", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        videoStore.mergeUpInfo("12345", { upLevel: 5, upFans: 10000, upSign: "商务合作请联系" });

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: false,
            blockedBelowUpLevel: 0,
            blockedBelowUpFans_Switch: false,
            blockedBelowUpFans: 0,
            blockedUpSigns_Switch: true,
            blockedUpSigns_UseRegular: true,
            blockedUpSigns_Array: ["商务合作"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("does not block when UP sign does not match keyword", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        videoStore.mergeUpInfo("12345", { upLevel: 5, upFans: 10000, upSign: "正常简介" });

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: false,
            blockedBelowUpLevel: 0,
            blockedBelowUpFans_Switch: false,
            blockedBelowUpFans: 0,
            blockedUpSigns_Switch: true,
            blockedUpSigns_UseRegular: false,
            blockedUpSigns_Array: ["商务合作"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("does not block when UP sign switch is off", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        videoStore.mergeUpInfo("12345", { upLevel: 5, upFans: 10000, upSign: "商务合作请联系" });

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: false,
            blockedBelowUpLevel: 0,
            blockedBelowUpFans_Switch: false,
            blockedBelowUpFans: 0,
            blockedUpSigns_Switch: false,
            blockedUpSigns_UseRegular: false,
            blockedUpSigns_Array: ["商务合作"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("skips UP profile rules when no upInfo is cached", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);
        // no mergeUpInfo call

        videoStore.applyUpProfileRules(bv, {
            blockedBelowUpLevel_Switch: true,
            blockedBelowUpLevel: 5,
            blockedBelowUpFans_Switch: true,
            blockedBelowUpFans: 1000,
            blockedUpSigns_Switch: true,
            blockedUpSigns_UseRegular: false,
            blockedUpSigns_Array: ["test"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });
});

describe("applyCommentRules", () => {
    it("blocks videos with filtered comments enabled", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { filteredComments: true });

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: true,
            blockedTopComment_Switch: false,
            blockedTopComment_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });

    it("does not block when filteredComments is undefined", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore);

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: true,
            blockedTopComment_Switch: false,
            blockedTopComment_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("does not block when filteredComments is false", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { filteredComments: false });

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: true,
            blockedTopComment_Switch: false,
            blockedTopComment_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("blocks when top comment exactly matches (non-regex)", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { topComment: "请关注店铺" });

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: false,
            blockedTopComment_Switch: true,
            blockedTopComment_UseRegular: false,
            blockedTopComment_Array: ["请关注店铺"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
        assert.ok(videoStore.getVideoInfo(bv).triggeredBlockedRules.some((r) => r.includes("按置顶评论屏蔽")));
    });

    it("does not block when top comment does not match", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { topComment: "正常评论内容" });

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: false,
            blockedTopComment_Switch: true,
            blockedTopComment_UseRegular: false,
            blockedTopComment_Array: ["店铺"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("does not block when topComment is empty string", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { topComment: "" });

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: false,
            blockedTopComment_Switch: true,
            blockedTopComment_UseRegular: false,
            blockedTopComment_Array: ["店铺"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("does not block when top comment switch is off", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { topComment: "请关注我的店铺" });

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: false,
            blockedTopComment_Switch: false,
            blockedTopComment_UseRegular: false,
            blockedTopComment_Array: ["店铺"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, undefined);
    });

    it("blocks top comment with regex mode", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { topComment: "关注店铺123号" });

        videoStore.applyCommentRules(bv, {
            blockedFilteredCommentsVideo_Switch: false,
            blockedTopComment_Switch: true,
            blockedTopComment_UseRegular: true,
            blockedTopComment_Array: ["店铺\\d+"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });
});

describe("resetBlockEvaluation", () => {
    it("clears blocked state so removed rules no longer apply", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "原神攻略" });

        const settings = {
            blockedTitle_Switch: true,
            blockedTitle_UseRegular: false,
            blockedTitle_Array: ["原神攻略"],
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
            blockedOverlayOnlyDisplaysType_Switch: false,
        };

        videoStore.applyTitleAndUpRules(bv, settings);
        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);

        videoStore.resetBlockEvaluation(bv);
        videoStore.applyTitleAndUpRules(bv, {
            ...settings,
            blockedTitle_Array: ["其他标题"],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, false);
        assert.deepEqual(videoStore.getVideoInfo(bv).triggeredBlockedRules, []);
        assert.deepEqual(videoStore.getVideoInfo(bv).blockedReasons, []);
    });
});

describe("oldParameterAdaptation", () => {
    it("maps legacy config keys to the new schema", () => {
        const settingsStore = createSettingsStore();
        const normalized = settingsStore.normalizeSettings({
            blockedTitleArray: ["legacy-title"],
            blockedNameOrUidArray: ["12345", "legacy-up"],
            blockedTagArray: ["legacy-tag"],
            doubleBlockedTagArray: ["a|b"],
            hideVideoModeSwitch: true,
            consoleOutputLogSwitch: false,
        });

        assert.deepEqual(normalized.blockedTitle_Array, ["legacy-title"]);
        assert.deepEqual(normalized.blockedUpUid_Array, ["12345"]);
        assert.deepEqual(normalized.blockedUpNameKeyword_Array, ["legacy-up"]);
        assert.equal(normalized.blockedUpNameKeyword_UseRegular, true);
        assert.deepEqual(normalized.blockedTag_Array, ["legacy-tag"]);
        assert.deepEqual(normalized.doubleBlockedTag_Array, ["a|b"]);
        assert.equal(normalized.hideVideoMode_Switch, true);
        assert.equal(normalized.consoleOutputLog_Switch, false);
        assert.equal(Object.hasOwn(normalized, "blockedTitleArray"), false);
        assert.equal(Object.hasOwn(normalized, "blockedNameOrUid_Array"), false);
    });

    it("keeps UP uid blacklist and whitelist mutually exclusive after normalization", () => {
        const settingsStore = createSettingsStore();
        const normalized = settingsStore.normalizeSettings({
            blockedUpUid_Array: ["12345", "67890"],
            whitelistUpUid_Array: ["12345"],
        });

        assert.deepEqual(normalized.blockedUpUid_Array, ["67890"]);
        assert.deepEqual(normalized.whitelistUpUid_Array, ["12345"]);
    });

    it("coerces non-array *_Array fields to empty arrays during normalization", () => {
        const settingsStore = createSettingsStore();
        const normalized = settingsStore.normalizeSettings({
            blockedTitle_Array: null,
            blockedTag_Array: "not-an-array",
            doubleBlockedTag_Array: { 0: "oops" },
            blockedUpUid_Array: undefined,
        });

        assert.deepEqual(normalized.blockedTitle_Array, []);
        assert.deepEqual(normalized.blockedTag_Array, []);
        assert.deepEqual(normalized.doubleBlockedTag_Array, []);
        assert.deepEqual(normalized.blockedUpUid_Array, []);
    });

    it("survives importing a legacy JSON config with string thresholds and null arrays", () => {
        const settingsStore = createSettingsStore();
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoLikesRate: 1.5, videoTitle: "标题含敏感词" });

        const legacyJson = {
            blockedBelowLikesRate_Switch: "true",
            blockedBelowLikesRate: "2",
            blockedBelowCoinRate_Switch: true,
            blockedBelowCoinRate: "0.5",
            blockedAboveFavoriteCoinRatio_Switch: true,
            blockedAboveFavoriteCoinRatio: "5",
            blockedTitle_Switch: true,
            blockedTitle_Array: null,
            blockedTag_Array: "动画,游戏",
            doubleBlockedTag_Array: { 0: "影视" },
        };

        const normalized = settingsStore.normalizeSettings(legacyJson);

        assert.equal(typeof normalized.blockedBelowLikesRate, "number");
        assert.equal(typeof normalized.blockedBelowCoinRate, "number");
        assert.equal(typeof normalized.blockedAboveFavoriteCoinRatio, "number");
        assert.deepEqual(normalized.blockedTitle_Array, []);
        assert.deepEqual(normalized.blockedTag_Array, []);
        assert.deepEqual(normalized.doubleBlockedTag_Array, []);

        videoStore.applyVideoStatsRules(bv, {
            blockedShortDuration_Switch: false,
            blockedShortDuration: 0,
            blockedBelowVideoViews_Switch: false,
            blockedBelowVideoViews: 0,
            blockedBelowLikesRate_Switch: normalized.blockedBelowLikesRate_Switch,
            blockedBelowLikesRate: normalized.blockedBelowLikesRate,
            blockedBelowCoinRate_Switch: false,
            blockedBelowCoinRate: 0,
            blockedAboveFavoriteCoinRatio_Switch: false,
            blockedAboveFavoriteCoinRatio: 0,
            blockedPortraitVideo_Switch: false,
            blockedChargingExclusive_Switch: false,
            blockedVideoPartitions_Switch: false,
            blockedVideoPartitions_Array: [],
        });

        assert.equal(videoStore.getVideoInfo(bv).blockedTarget, true);
    });
});

describe("pruneStaleVideoInfo", () => {
    it("removes video info entries not in the keep set once outside the grace window", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "保留视频" });
        // 把"过期视频"的 lastSeenAt 设到宽限期外，模拟滚出视口很久。
        videoStore.mergeVideoInfo("BV-other", { videoTitle: "过期视频", lastSeenAt: Date.now() - 120_000 });

        videoStore.pruneStaleVideoInfo({ keepBvs: new Set([bv]) });

        assert.ok(videoStore.getVideoInfo(bv));
        assert.equal(videoStore.getVideoInfo("BV-other"), undefined);
    });

    it("keeps entries in the keep set and drops nothing when all kept", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "保留视频" });
        videoStore.mergeVideoInfo("BV-also", { videoTitle: "也保留" });

        videoStore.pruneStaleVideoInfo({ keepBvs: new Set([bv, "BV-also"]) });

        assert.ok(videoStore.getVideoInfo(bv));
        assert.ok(videoStore.getVideoInfo("BV-also"));
    });

    it("accepts an iterable keep set in addition to a Set", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "保留视频" });
        videoStore.mergeVideoInfo("BV-other", { videoTitle: "过期视频", lastSeenAt: Date.now() - 120_000 });

        videoStore.pruneStaleVideoInfo({ keepBvs: [bv] });

        assert.ok(videoStore.getVideoInfo(bv));
        assert.equal(videoStore.getVideoInfo("BV-other"), undefined);
    });

    it("keeps recently seen entries inside the grace window even when not in keep set", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, { videoTitle: "保留视频" });
        // 刚滚出视口的视频仍在宽限期内，应保留以避免滚回时 overlay 闪烁。
        videoStore.mergeVideoInfo("BV-recent", { videoTitle: "刚滚出视口", lastSeenAt: Date.now() - 1_000 });

        videoStore.pruneStaleVideoInfo({ keepBvs: new Set([bv]) });

        assert.ok(videoStore.getVideoInfo(bv));
        assert.ok(videoStore.getVideoInfo("BV-recent"));
    });
});

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
        seedVideo(videoStore, { videoLikesRate: "1.50" });

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

    it("skips favorite/coin ratio rule for new or low-traffic videos", () => {
        const videoStore = createVideoStore();
        seedVideo(videoStore, {
            videoView: 1000,
            videoFavorite: 100,
            videoFavoriteCoinRatio: "20.00",
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
});

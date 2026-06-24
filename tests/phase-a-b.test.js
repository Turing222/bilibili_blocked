import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUpProfileDataReady } from "../src/features/up-profile.js";
import {
    appendWhitelistBv,
    appendWhitelistUp,
    appendBlockedTitle,
    appendBlockedTitles,
    appendBlockedUp,
    appendBlockedCommentText,
    appendBlockedCommentTexts,
    appendBlockedCommentUser,
    removeConfigArrayItem,
} from "../src/settings/mutations.js";
import { createVideoStore } from "../src/state/video-store.js";

function createMockSettingsStore(initial = {}) {
    let settings = { ...initial };

    return {
        exportSettings() {
            return { ...settings };
        },
        saveSettings(nextSettings) {
            settings = { ...nextSettings };
            return settings;
        },
    };
}

describe("isUpProfileDataReady", () => {
    it("returns false when UP uid is missing", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo("BV1test", {});

        assert.equal(isUpProfileDataReady(videoStore, "BV1test"), false);
    });

    it("returns false when videoUpInfoDict has no cached profile", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo("BV1test", { videoUpUid: "42" });

        assert.equal(isUpProfileDataReady(videoStore, "BV1test"), false);
    });

    it("returns true when cached UP profile exists", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo("BV1test", { videoUpUid: "42" });
        videoStore.mergeUpInfo("42", { upLevel: 5, upFans: 1000, upSign: "hello" });

        assert.equal(isUpProfileDataReady(videoStore, "BV1test"), true);
    });
});

describe("whitelist mutations", () => {
    it("appendWhitelistUp enables the whitelist switch", () => {
        const settingsStore = createMockSettingsStore({
            whitelistUpUid_Switch: false,
            whitelistUpUid_Array: [],
        });

        appendWhitelistUp(settingsStore, "12345");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.whitelistUpUid_Switch, true);
        assert.deepEqual(settings.whitelistUpUid_Array, ["12345"]);
    });

    it("appendWhitelistUp removes the same UID from blocked UP list", () => {
        const settingsStore = createMockSettingsStore({
            whitelistUpUid_Switch: false,
            whitelistUpUid_Array: [],
            blockedUpUid_Array: ["12345", "67890"],
        });

        appendWhitelistUp(settingsStore, "12345");

        const settings = settingsStore.exportSettings();
        assert.deepEqual(settings.whitelistUpUid_Array, ["12345"]);
        assert.deepEqual(settings.blockedUpUid_Array, ["67890"]);
    });

    it("appendWhitelistBv enables the BV whitelist switch", () => {
        const settingsStore = createMockSettingsStore({
            whitelistBv_Switch: false,
            whitelistBv_Array: [],
        });

        appendWhitelistBv(settingsStore, "BV1abc");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.whitelistBv_Switch, true);
        assert.deepEqual(settings.whitelistBv_Array, ["BV1abc"]);
    });
});

describe("quick block mutations", () => {
    it("appendBlockedTitle enables the title switch", () => {
        const settingsStore = createMockSettingsStore({
            blockedTitle_Switch: false,
            blockedTitle_Array: [],
        });

        appendBlockedTitle(settingsStore, "测试标题");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedTitle_Switch, true);
        assert.deepEqual(settings.blockedTitle_Array, ["测试标题"]);
    });

    it("appendBlockedTitle escapes literal text when title regex mode is on", () => {
        const settingsStore = createMockSettingsStore({
            blockedTitle_Switch: false,
            blockedTitle_UseRegular: true,
            blockedTitle_Array: [],
        });

        appendBlockedTitle(settingsStore, "a+b[1]");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedTitle_Switch, true);
        assert.deepEqual(settings.blockedTitle_Array, ["a\\+b\\[1\\]"]);
    });

    it("appendBlockedTitles appends multiple unique title keywords", () => {
        const settingsStore = createMockSettingsStore({
            blockedTitle_Switch: false,
            blockedTitle_Array: ["已有"],
        });

        appendBlockedTitles(settingsStore, ["广告", "已有", "测试"]);

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedTitle_Switch, true);
        assert.deepEqual(settings.blockedTitle_Array, ["已有", "广告", "测试"]);
    });

    it("appendBlockedUp enables the UP switch", () => {
        const settingsStore = createMockSettingsStore({
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
        });

        appendBlockedUp(settingsStore, "12345");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedUpUid_Switch, true);
        assert.deepEqual(settings.blockedUpUid_Array, ["12345"]);
    });

    it("appendBlockedUp routes non-UID text to UP name keywords", () => {
        const settingsStore = createMockSettingsStore({
            blockedUpNameKeyword_Switch: false,
            blockedUpNameKeyword_Array: [],
        });

        appendBlockedUp(settingsStore, "测试UP");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedUpNameKeyword_Switch, true);
        assert.deepEqual(settings.blockedUpNameKeyword_Array, ["测试UP"]);
    });

    it("appendBlockedUp removes the same UID from whitelist", () => {
        const settingsStore = createMockSettingsStore({
            blockedUpUid_Switch: false,
            blockedUpUid_Array: [],
            whitelistUpUid_Array: ["12345", "67890"],
        });

        appendBlockedUp(settingsStore, "12345");

        const settings = settingsStore.exportSettings();
        assert.deepEqual(settings.blockedUpUid_Array, ["12345"]);
        assert.deepEqual(settings.whitelistUpUid_Array, ["67890"]);
    });

    it("appendBlockedCommentText enables the comment text switch", () => {
        const settingsStore = createMockSettingsStore({
            blockedCommentText_Switch: false,
            blockedCommentText_UseRegular: false,
            blockedCommentText_Array: [],
        });

        appendBlockedCommentText(settingsStore, "广告");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedCommentText_Switch, true);
        assert.deepEqual(settings.blockedCommentText_Array, ["广告"]);
    });

    it("appendBlockedCommentText escapes literal text when comment regex mode is on", () => {
        const settingsStore = createMockSettingsStore({
            blockedCommentText_Switch: false,
            blockedCommentText_UseRegular: true,
            blockedCommentText_Array: [],
        });

        appendBlockedCommentText(settingsStore, "a+b[1]");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedCommentText_Switch, true);
        assert.deepEqual(settings.blockedCommentText_Array, ["a\\+b\\[1\\]"]);
    });

    it("appendBlockedCommentTexts appends multiple unique comment keywords", () => {
        const settingsStore = createMockSettingsStore({
            blockedCommentText_Switch: false,
            blockedCommentText_Array: ["已有"],
        });

        appendBlockedCommentTexts(settingsStore, ["广告", "已有", "引流"]);

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedCommentText_Switch, true);
        assert.deepEqual(settings.blockedCommentText_Array, ["已有", "广告", "引流"]);
    });

    it("appendBlockedCommentUser enables the comment user switch", () => {
        const settingsStore = createMockSettingsStore({
            blockedCommentUser_Switch: false,
            blockedCommentUser_Array: [],
        });

        appendBlockedCommentUser(settingsStore, "uid:12345");

        const settings = settingsStore.exportSettings();
        assert.equal(settings.blockedCommentUser_Switch, true);
        assert.deepEqual(settings.blockedCommentUser_Array, ["uid:12345"]);
    });

    it("removeConfigArrayItem removes one exact rule value", () => {
        const settingsStore = createMockSettingsStore({
            blockedTag_Array: ["动画", "游戏", "日常"],
        });

        removeConfigArrayItem(settingsStore, "blockedTag_Array", "游戏");

        const settings = settingsStore.exportSettings();
        assert.deepEqual(settings.blockedTag_Array, ["动画", "日常"]);
    });
});

describe("applyWhitelistRules", () => {
    it("clears blockedTarget for whitelisted UP", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo("BV1up", {
            videoUpUid: "99",
            videoUpName: "tester",
            blockedTarget: true,
        });

        videoStore.applyWhitelistRules("BV1up", {
            whitelistUpUid_Switch: true,
            whitelistUpUid_Array: ["99"],
        });

        assert.equal(videoStore.getVideoInfo("BV1up").blockedTarget, false);
    });

    it("clears blockedTarget for whitelisted BV", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo("BV1bv", { blockedTarget: true });

        videoStore.applyWhitelistRules("BV1bv", {
            whitelistBv_Switch: true,
            whitelistBv_Array: ["BV1bv"],
        });

        assert.equal(videoStore.getVideoInfo("BV1bv").blockedTarget, false);
    });

    it("does not clear blockedTarget when BV whitelist switch is off", () => {
        const videoStore = createVideoStore();
        videoStore.mergeVideoInfo("BV1bv", { blockedTarget: true });

        videoStore.applyWhitelistRules("BV1bv", {
            whitelistBv_Switch: false,
            whitelistBv_Array: ["BV1bv"],
        });

        assert.equal(videoStore.getVideoInfo("BV1bv").blockedTarget, true);
    });
});

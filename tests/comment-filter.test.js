import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { commentFilterFeature } from "../src/features/comment-filter.js";
import {
    findBlockedCommentTextMatch,
    findBlockedCommentUserMatch,
} from "../src/utils/comment-filter.js";

describe("findBlockedCommentTextMatch", () => {
    it("matches plain keywords by containment", () => {
        assert.equal(findBlockedCommentTextMatch("这是一条广告评论", ["广告"], false), "广告");
    });

    it("matches regular expressions safely", () => {
        assert.equal(findBlockedCommentTextMatch("VX 12345", ["VX\\s+\\d+"], true), "VX\\s+\\d+");
        assert.equal(findBlockedCommentTextMatch("普通评论", ["("], true), "");
    });
});

describe("findBlockedCommentUserMatch", () => {
    it("matches comment users by UID or name", () => {
        const commentInfo = {
            userId: "12345",
            userName: "测试用户",
        };

        assert.equal(findBlockedCommentUserMatch(commentInfo, ["uid:12345"]), "uid:12345");
        assert.equal(findBlockedCommentUserMatch(commentInfo, ["12345"]), "12345");
        assert.equal(findBlockedCommentUserMatch(commentInfo, ["name:测试用户"]), "name:测试用户");
        assert.equal(findBlockedCommentUserMatch(commentInfo, ["测试用户"]), "测试用户");
        assert.equal(findBlockedCommentUserMatch(commentInfo, ["其他用户"]), "");
    });
});

afterEach(() => {
    commentFilterFeature.run({
        settings: {},
        domAdapter: {
            getCommentElements: () => [],
        },
        renderer: {
            renderCommentBlockedState: () => false,
        },
        statsStore: null,
    });
    mock.timers.reset();
    delete globalThis.window;
});

describe("commentFilterFeature", () => {
    it("blocks rendered comments whose text matches the configured rules", () => {
        globalThis.window = {
            location: { href: "https://www.bilibili.com/video/BV1test/" },
        };

        const commentElement = { id: "comment-1" };
        const rendered = [];
        const stats = [];

        commentFilterFeature.run({
            settings: {
                blockedCommentText_Switch: true,
                blockedCommentText_UseRegular: false,
                blockedCommentText_Array: ["广告"],
            },
            domAdapter: {
                getCommentElements: () => [commentElement],
                readCommentInfo: () => ({ text: "这是一条广告评论" }),
            },
            renderer: {
                renderCommentBlockedState(element, blockResult) {
                    rendered.push({ element, blockResult });
                    return blockResult.blocked;
                },
            },
            statsStore: {
                increment(ruleKey) {
                    stats.push(ruleKey);
                },
            },
        });

        assert.equal(rendered[0].element, commentElement);
        assert.equal(rendered[0].blockResult.blocked, true);
        assert.equal(rendered[0].blockResult.reason, "按评论内容屏蔽: 广告");
        assert.equal(rendered[0].blockResult.blockReason.configKey, "blockedCommentText_Array");
        assert.equal(rendered[0].blockResult.blockReason.configValue, "广告");
        assert.equal(rendered[0].blockResult.blockReason.canRemoveConfig, true);
        assert.deepEqual(stats, ["按评论内容屏蔽: 广告"]);
    });

    it("restores comment state when the text rule is disabled", () => {
        const commentElement = { id: "comment-1" };
        const rendered = [];

        commentFilterFeature.run({
            settings: {
                blockedCommentText_Switch: false,
                blockedCommentText_UseRegular: false,
                blockedCommentText_Array: ["广告"],
            },
            domAdapter: {
                getCommentElements: () => [commentElement],
                readCommentInfo: () => ({ text: "这是一条广告评论" }),
            },
            renderer: {
                renderCommentBlockedState(element, blockResult) {
                    rendered.push({ element, blockResult });
                    return false;
                },
            },
            statsStore: null,
        });

        assert.equal(rendered[0].element, commentElement);
        assert.equal(rendered[0].blockResult.blocked, false);
        assert.ok(rendered[0].blockResult.commentKey.includes("这是一条广告评论"));
    });

    it("blocks rendered comments whose user matches the configured rules", () => {
        const commentElement = { id: "comment-1" };
        const rendered = [];
        const stats = [];

        commentFilterFeature.run({
            settings: {
                blockedCommentText_Switch: false,
                blockedCommentText_UseRegular: false,
                blockedCommentText_Array: [],
                blockedCommentUser_Switch: true,
                blockedCommentUser_Array: ["uid:12345"],
                blockedCommentImage_Switch: false,
            },
            domAdapter: {
                getCommentElements: () => [commentElement],
                readCommentInfo: () => ({ text: "普通评论", userId: "12345", userName: "测试用户", hasImage: false }),
            },
            renderer: {
                renderCommentBlockedState(element, blockResult) {
                    rendered.push({ element, blockResult });
                    return blockResult.blocked;
                },
            },
            statsStore: {
                increment(ruleKey) {
                    stats.push(ruleKey);
                },
            },
        });

        assert.equal(rendered[0].blockResult.blocked, true);
        assert.equal(rendered[0].blockResult.type, "按评论用户屏蔽");
        assert.equal(rendered[0].blockResult.reason, "按评论用户屏蔽: 测试用户 (12345)");
        assert.equal(rendered[0].blockResult.blockReason.configKey, "blockedCommentUser_Array");
        assert.equal(rendered[0].blockResult.blockReason.configValue, "uid:12345");
        assert.deepEqual(stats, ["按评论用户屏蔽: uid:12345"]);
    });

    it("blocks rendered comments with body images when image blocking is enabled", () => {
        const commentElement = { id: "comment-1" };
        const rendered = [];

        commentFilterFeature.run({
            settings: {
                blockedCommentText_Switch: false,
                blockedCommentText_UseRegular: false,
                blockedCommentText_Array: [],
                blockedCommentUser_Switch: false,
                blockedCommentUser_Array: [],
                blockedCommentImage_Switch: true,
            },
            domAdapter: {
                getCommentElements: () => [commentElement],
                readCommentInfo: () => ({ text: "带图评论", userId: "", userName: "", hasImage: true }),
            },
            renderer: {
                renderCommentBlockedState(element, blockResult) {
                    rendered.push({ element, blockResult });
                    return blockResult.blocked;
                },
            },
            statsStore: null,
        });

        assert.equal(rendered[0].blockResult.blocked, true);
        assert.equal(rendered[0].blockResult.type, "按带图评论屏蔽");
        assert.equal(rendered[0].blockResult.reason, "按带图评论屏蔽");
    });

    it("keeps a short retry window after comments are first found", () => {
        mock.timers.enable({ apis: ["setTimeout"] });

        const commentElement = { id: "comment-1" };
        let refreshCount = 0;
        const context = {
            settings: {
                blockedCommentText_Switch: true,
                blockedCommentText_UseRegular: false,
                blockedCommentText_Array: ["ad"],
            },
            domAdapter: {
                getCommentElements: () => [commentElement],
                readCommentInfo: () => ({ text: "normal comment", userId: "", userName: "", hasImage: false }),
                observeCommentChanges: () => {},
            },
            renderer: {
                renderCommentBlockedState: () => false,
            },
            statsStore: null,
            refresh: () => {
                refreshCount++;
            },
        };

        commentFilterFeature.run(context);
        mock.timers.tick(999);
        assert.equal(refreshCount, 0);

        mock.timers.tick(1);
        assert.equal(refreshCount, 1);

        commentFilterFeature.run(context);
        mock.timers.tick(1000);
        assert.equal(refreshCount, 2);
    });
});

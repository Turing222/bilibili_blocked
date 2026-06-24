// == 评论内容过滤 ============================================================
//
// 职责：
// - 在视频页评论区中按关键词或正则折叠单条评论。
// - 只处理页面已经渲染出来的评论，新增评论由页面 MutationObserver 触发重跑。
//
// 不负责：
// - 不主动请求评论 API。
// - 不做评论用户、图片、链接等后续规则。
// - 不处理视频卡片屏蔽。

import {
    findBlockedCommentTextMatch,
    findBlockedCommentUserMatch,
} from "../utils/comment-filter.js";
import { mountCommentQuickBlock } from "../actions/comment-quick-block.js";

const blockedCommentTextType = "按评论内容屏蔽";
const blockedCommentUserType = "按评论用户屏蔽";
const blockedCommentImageType = "按带图评论屏蔽";
const retryDelayMs = 1000;
const maxRetryAttempts = 8;

let retryTimer = null;
let retryAttempts = 0;
let lastObservedCommentCount = -1;

export const commentFilterFeature = {
    name: "comment-filter",
    enabled: ({ domAdapter }) => domAdapter.shouldHandleCommentFiltering(window.location.href),
    run: (context) => {
        const { settings, domAdapter, renderer, statsStore, refresh, settingsStore } = context;
        const commentElements = domAdapter.getCommentElements();
        const enabled = hasEnabledCommentRules(settings);
        const shouldTrackComments = enabled || Boolean(settingsStore);

        if (shouldTrackComments) {
            domAdapter.observeCommentChanges?.(() => {
                resetRetry();
                refresh?.();
            });
            scheduleCommentSettlingRetry(refresh, commentElements.length);
        } else {
            resetRetry();
        }

        commentElements.forEach((commentElement) => {
            const commentInfo = domAdapter.readCommentInfo(commentElement);
            const blockResult = getCommentBlockResult(settings, commentInfo);
            blockResult.commentKey = getCommentKey(commentInfo);

            mountCommentQuickBlock(context, commentElement, commentInfo);

            const changedToBlocked = renderer.renderCommentBlockedState(commentElement, blockResult);
            if (changedToBlocked && blockResult.item) {
                statsStore?.increment(`${blockResult.type}: ${blockResult.item}`);
            }
        });
    },
};

function hasEnabledCommentRules(settings) {
    return Boolean(
        (settings.blockedCommentUser_Switch && settings.blockedCommentUser_Array?.length > 0) ||
        (settings.blockedCommentText_Switch && settings.blockedCommentText_Array?.length > 0) ||
        settings.blockedCommentImage_Switch
    );
}

function getCommentBlockResult(settings, commentInfo) {
    const matchedUser = settings.blockedCommentUser_Switch
        ? findBlockedCommentUserMatch(commentInfo, settings.blockedCommentUser_Array)
        : "";

    if (matchedUser) {
        return createCommentBlockResult({
            type: blockedCommentUserType,
            item: matchedUser,
            reasonItem: formatCommentUserReason(commentInfo, matchedUser),
            configKey: "blockedCommentUser_Array",
            configValue: matchedUser,
            matchedValue: formatCommentUserReason(commentInfo, matchedUser),
        });
    }

    const matchedText = settings.blockedCommentText_Switch
        ? findBlockedCommentTextMatch(
            commentInfo.text,
            settings.blockedCommentText_Array,
            settings.blockedCommentText_UseRegular
        )
        : "";

    if (matchedText) {
        return createCommentBlockResult({
            type: blockedCommentTextType,
            item: matchedText,
            reasonItem: matchedText,
            configKey: "blockedCommentText_Array",
            regularKey: "blockedCommentText_UseRegular",
            configValue: matchedText,
            matchedValue: commentInfo.text,
        });
    }

    if (settings.blockedCommentImage_Switch && commentInfo.hasImage) {
        return createCommentBlockResult({
            type: blockedCommentImageType,
            item: "带图评论",
            reasonItem: "",
            matchedValue: "带图评论",
        });
    }

    return { blocked: false };
}

function getCommentKey(commentInfo) {
    const text = String(commentInfo?.text || "").replace(/\s+/g, " ").trim();
    const userId = String(commentInfo?.userId || "").trim();
    const userName = String(commentInfo?.userName || "").replace(/\s+/g, " ").trim();

    if (!text && !userId && !userName) {
        return "";
    }

    return JSON.stringify([userId, userName, text.slice(0, 240)]);
}

function createCommentBlockResult({ type, item, reasonItem, configKey = "", regularKey = "", configValue = "", matchedValue = "" }) {
    const reason = reasonItem ? `${type}: ${reasonItem}` : type;
    const blockReason = {
        id: [type, configKey, configValue, matchedValue, reason].join("\u0001"),
        type,
        item,
        displayText: reason,
        configKey,
        regularKey,
        configValue,
        matchedValue,
        canRemoveConfig: Boolean(configKey && configValue),
    };

    return {
        blocked: true,
        type,
        item,
        reason,
        blockReason,
        blockedReasons: [blockReason],
    };
}

function formatCommentUserReason(commentInfo, matchedUser) {
    const userName = String(commentInfo?.userName || "").trim();
    const userId = String(commentInfo?.userId || "").trim();

    if (userName && userId) {
        return `${userName} (${userId})`;
    }

    return userName || userId || matchedUser;
}

function scheduleCommentSettlingRetry(refresh, commentCount) {
    if (!refresh) {
        return;
    }

    if (commentCount !== lastObservedCommentCount) {
        lastObservedCommentCount = commentCount;
        retryAttempts = 0;
    }

    if (retryTimer || retryAttempts >= maxRetryAttempts) {
        return;
    }

    retryAttempts++;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        refresh();
    }, retryDelayMs);
}

function resetRetry() {
    retryAttempts = 0;
    lastObservedCommentCount = -1;
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
}

import { safeRegexTest } from "./regex.js";

export function findBlockedCommentTextMatch(text, patterns, useRegular) {
    const commentText = String(text || "");
    if (!commentText || !Array.isArray(patterns) || patterns.length === 0) {
        return "";
    }

    return patterns.find((pattern) => {
        const normalizedPattern = String(pattern || "").trim();
        if (!normalizedPattern) {
            return false;
        }

        if (useRegular) {
            return safeRegexTest(normalizedPattern, commentText);
        }

        return commentText.includes(normalizedPattern);
    }) || "";
}

export function findBlockedCommentUserMatch(commentInfo, users) {
    if (!Array.isArray(users) || users.length === 0) {
        return "";
    }

    const userId = normalizeToken(commentInfo?.userId);
    const userName = normalizeToken(commentInfo?.userName);

    if (!userId && !userName) {
        return "";
    }

    return users.find((user) => {
        const normalizedUser = normalizeToken(user);
        if (!normalizedUser) {
            return false;
        }

        const lowerUser = normalizedUser.toLowerCase();
        if (userId && (lowerUser === userId.toLowerCase() || lowerUser === `uid:${userId}`.toLowerCase())) {
            return true;
        }

        return Boolean(userName && (
            lowerUser === userName.toLowerCase() ||
            lowerUser === `name:${userName}`.toLowerCase()
        ));
    }) || "";
}

function normalizeToken(value) {
    return String(value || "").trim();
}

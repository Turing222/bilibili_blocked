// == 评论区屏蔽功能组 ========================================================
//
// 职责：
// - 按精选评论状态屏蔽视频。
// - 按置顶评论内容屏蔽视频。
// - 管理评论 API 的请求需要，但具体节流策略放在 api-client.js。
//
// 不负责：
// - 不处理普通标签。
// - 不处理 UP 资料。
//
// 原脚本迁移来源：
// - getVideoApiComments()
// - handleBlockedFilteredCommentsVideo()
// - handleBlockedTopComment()

import { API_DATA_KEYS, API_DATA_STATUS } from "../platform/api-health.js";

export const commentsFeature = {
    name: "comments",
    enabled: ({ settings }) =>
        settings.blockedFilteredCommentsVideo_Switch ||
        (settings.blockedTopComment_Switch && settings.blockedTopComment_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);
        if (!info || info.filteredComments === undefined) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_COMMENTS).status;
            if (isCommentsApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestCommentsIfNeeded(videoBv, videoStore);
            return false;
        }
        videoStore.applyCommentRules(videoBv, settings);
        return true;
    },
};

function isCommentsApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

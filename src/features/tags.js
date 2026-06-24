// == 标签屏蔽功能组 ==========================================================
//
// 职责：
// - 按单标签屏蔽。
// - 按双重标签屏蔽。
// - 只在相关开关打开时请求标签 API。
//
// 不负责：
// - 不处理标题。
// - 不处理热搜。
//
// 原脚本迁移来源：
// - getVideoApiTags()
// - handleBlockedTag()
// - handleDoubleBlockedTag()

import { API_DATA_KEYS, API_DATA_STATUS } from "../platform/api-health.js";

export const tagsFeature = {
    name: "tags",
    enabled: ({ settings }) =>
        (settings.blockedTag_Switch && settings.blockedTag_Array.length > 0) ||
        (settings.doubleBlockedTag_Switch && settings.doubleBlockedTag_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);
        if (!info || info.videoTags === undefined) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_TAGS).status;
            if (isTagsApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestVideoTagsIfNeeded(videoBv, videoStore);
            return false;
        }
        videoStore.applyTagRules(videoBv, settings);
        return true;
    },
};

function isTagsApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

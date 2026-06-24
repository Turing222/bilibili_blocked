// == 视频统计和基础属性屏蔽 ==================================================
//
// 职责：
// - 按时长屏蔽。
// - 按播放量屏蔽。
// - 按点赞率、投币率屏蔽。
// - 按收藏/投币比屏蔽。
// - 按竖屏视频屏蔽。
// - 按充电专属屏蔽。
// - 按视频分区屏蔽。
//
// 不负责：
// - 不处理标签。
// - 不处理评论。
// - 不处理 UP 主页资料。
//
// 原脚本迁移来源：
// - handleBlockedShortDuration()
// - handleBlockedBelowVideoViews()
// - handleBlockedBelowLikesRate()
// - handleBlockedBelowCoinRate()
// - handleBlockedAboveFavoriteCoinRatio()
// - handleBlockedPortraitVideo()
// - handleBlockedChargingExclusive()
// - handleBlockedVideoPartitions()

import { API_DATA_KEYS, API_DATA_STATUS } from "../platform/api-health.js";

export const videoStatsFeature = {
    name: "video-stats",
    enabled: ({ settings }) =>
        (settings.blockedShortDuration_Switch && settings.blockedShortDuration > 0) ||
        (settings.blockedBelowVideoViews_Switch && settings.blockedBelowVideoViews > 0) ||
        (settings.blockedBelowLikesRate_Switch && settings.blockedBelowLikesRate > 0) ||
        (settings.blockedBelowCoinRate_Switch && settings.blockedBelowCoinRate > 0) ||
        (settings.blockedAboveFavoriteCoinRatio_Switch && settings.blockedAboveFavoriteCoinRatio > 0) ||
        settings.blockedPortraitVideo_Switch ||
        settings.blockedChargingExclusive_Switch ||
        (settings.blockedVideoPartitions_Switch && settings.blockedVideoPartitions_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);
        if (!info || info.videoDuration === undefined) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW).status;
            if (isVideoStatsApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestVideoInfoIfNeeded(videoBv, videoStore);
            return false;
        }
        videoStore.applyVideoStatsRules(videoBv, settings);
        return true;
    },
};

function isVideoStatsApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

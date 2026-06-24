// == UP 主页资料屏蔽功能组 ===================================================
//
// 职责：
// - 按 UP 等级屏蔽。
// - 按 UP 粉丝数屏蔽。
// - 按 UP 简介屏蔽。
// - 只在相关开关打开时请求 UP 资料 API。
//
// 不负责：
// - 不处理 UP 名称或 UID 的基础屏蔽；那部分在 title-up.js。
//
// 原脚本迁移来源：
// - getVideoApiUpInfo()
// - handleBlockedBelowUpLevel()
// - handleBlockedBelowUpFans()
// - handleBlockedUpSigns()

import { API_DATA_KEYS, API_DATA_STATUS } from "../platform/api-health.js";

export function isUpProfileDataReady(videoStore, videoBv) {
    const info = videoStore.getVideoInfo(videoBv);
    if (!info?.videoUpUid) {
        return false;
    }

    const upCached = videoStore.getUpInfo(info.videoUpUid);
    return Boolean(upCached && upCached.upLevel != null);
}

export const upProfileFeature = {
    name: "up-profile",
    enabled: ({ settings }) =>
        (settings.blockedBelowUpLevel_Switch && settings.blockedBelowUpLevel > 0) ||
        (settings.blockedBelowUpFans_Switch && settings.blockedBelowUpFans > 0) ||
        (settings.blockedUpSigns_Switch && settings.blockedUpSigns_Array.length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        const info = videoStore.getVideoInfo(videoBv);

        if (!info?.videoUpUid) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.VIDEO_VIEW).status;
            if (isUpProfileApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestVideoInfoIfNeeded(videoBv, videoStore);
            return false;
        }

        if (!isUpProfileDataReady(videoStore, videoBv)) {
            const dataStatus = apiClient.getVideoDataStatus(videoBv, videoStore, API_DATA_KEYS.UP_PROFILE).status;
            if (isUpProfileApiTerminalWithoutData(dataStatus)) {
                return true;
            }

            apiClient.requestUpInfoIfNeeded(videoBv, videoStore);
            return false;
        }

        videoStore.applyUpProfileRules(videoBv, settings);
        return true;
    },
};

function isUpProfileApiTerminalWithoutData(status) {
    return status === API_DATA_STATUS.EMPTY || status === API_DATA_STATUS.UNAVAILABLE;
}

// == UP 屏蔽建议统计 ========================================================
//
// 职责：
// - 在视频最终被屏蔽后，按 UP 维度记录本脚本自己的本地统计。
// - 使用 videoBv + upUid 去重，避免刷新或重复 pipeline 把同一视频刷爆。
//
// 不负责：
// - 不渲染建议列表。
// - 不修改用户的屏蔽配置。

export const upBlockSuggestionsFeature = {
    name: "up-block-suggestions",
    enabled: ({ upBlockStatsStore }) => Boolean(upBlockStatsStore),
    run: ({ videoBv, videoStore, upBlockStatsStore }) => {
        const videoInfo = videoStore.getVideoInfo(videoBv);
        if (!videoInfo?.blockedTarget) {
            return;
        }

        upBlockStatsStore.recordBlockedVideo(videoBv, videoInfo);
    },
};

// == 视频基础信息准备 ========================================================
//
// 职责：
// - 从视频卡片 DOM 中提取 BV、标题、链接。
// - 尽量从 DOM 中提取 UP 名称和 UID。
// - 只做 DOM 基础读取；需要 API 的功能由各自 feature 按需触发。
//
// 不负责：
// - 不判断是否应该屏蔽。
// - 不渲染叠加层。
//
// 原脚本迁移来源：
// - getBvAndTitle()
// - getNameAndUid()

export const basicVideoInfoFeature = {
    name: "basic-video-info",
    enabled: () => true,
    run: ({ videoBv, videoElement, domAdapter, videoStore }) => {
        const domInfo = domAdapter.readVideoBasicInfo(videoElement, videoBv);
        videoStore.mergeVideoInfo(videoBv, domInfo);
    },
};

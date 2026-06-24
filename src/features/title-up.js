// == 标题和 UP 基础屏蔽 ======================================================
//
// 职责：
// - 按标题屏蔽。
// - 按 UP UID 精确屏蔽。
// - 按 UP 名称关键词屏蔽。
//
// 不负责：
// - 不处理白名单；白名单必须放到屏蔽规则之后作为覆盖逻辑。
// - 不请求 UP 详细资料，例如等级、粉丝数、简介。
//
// 原脚本迁移来源：
// - handleBlockedTitle()
// - handleBlockedNameOrUid()

export const titleUpFeature = {
    name: "title-up",
    enabled: ({ settings }) =>
        (settings.blockedTitle_Switch && settings.blockedTitle_Array.length > 0) ||
        (settings.blockedUpUid_Switch && (settings.blockedUpUid_Array || []).length > 0) ||
        (settings.blockedUpNameKeyword_Switch && (settings.blockedUpNameKeyword_Array || []).length > 0),
    run: ({ videoBv, settings, apiClient, videoStore }) => {
        if (
            (settings.blockedUpUid_Switch && (settings.blockedUpUid_Array || []).length > 0) ||
            (settings.blockedUpNameKeyword_Switch && (settings.blockedUpNameKeyword_Array || []).length > 0)
        ) {
            apiClient.requestVideoInfoIfNeeded(videoBv, videoStore);
        }

        videoStore.applyTitleAndUpRules(videoBv, settings);
        return true;
    },
};

// == 功能注册表 ==============================================================
//
// 新增/删除功能时，优先改这个文件。
//
// 原则：
// - 删除一个功能：移除对应 import 和数组项。
// - 新增一个功能：新增 feature 文件，然后挂到合适阶段。
// - 主 pipeline 不关心功能细节，只遍历这些列表。

import { pageCleanupFeature } from "./page-cleanup.js";
import { promotedVideoCardsFeature } from "./promoted-video-cards.js";
import { commentFilterFeature } from "./comment-filter.js";
import { trendingFeature } from "./trending.js";
import { basicVideoInfoFeature } from "./basic-video-info.js";
import { titleUpFeature } from "./title-up.js";
import { videoStatsFeature } from "./video-stats.js";
import { tagsFeature } from "./tags.js";
import { upProfileFeature } from "./up-profile.js";
import { commentsFeature } from "./comments.js";
import { whitelistFeature } from "./whitelist.js";
import { upBlockSuggestionsFeature } from "./up-block-suggestions.js";

export function createFeatureRegistry() {
    return {
        pageFeatures: [
            promotedVideoCardsFeature,
            pageCleanupFeature,
            commentFilterFeature,
        ],

        trendingFeatures: [
            trendingFeature,
        ],

        videoPrepareFeatures: [
            basicVideoInfoFeature,
        ],

        videoRuleFeatures: [
            titleUpFeature,
            videoStatsFeature,
            upProfileFeature,
            tagsFeature,
            commentsFeature,
        ],

        videoPostRuleFeatures: [
            whitelistFeature,
            upBlockSuggestionsFeature,
        ],
    };
}

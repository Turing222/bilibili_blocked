import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    formatFeatureRuleSummary,
    getListRuleChipLabel,
    partitionReviewReasons,
} from "../src/settings/rule-metadata.js";
import { disableFeatureRuleSwitch } from "../src/settings/mutations.js";

describe("partitionReviewReasons", () => {
    it("splits list rules from feature rules", () => {
        const reasons = [
            {
                type: "按标签屏蔽",
                configKey: "blockedTag_Array",
                configValue: "CS2",
                canRemoveConfig: true,
            },
            {
                type: "屏蔽低时长",
                item: "120秒",
                canRemoveConfig: false,
            },
            {
                type: "未知规则",
                displayText: "未知规则: foo",
                canRemoveConfig: false,
            },
        ];

        const grouped = partitionReviewReasons(reasons);

        assert.equal(grouped.listRules.length, 1);
        assert.equal(grouped.featureRules.length, 1);
        assert.equal(grouped.otherRules.length, 1);
        assert.equal(grouped.listRules[0].configValue, "CS2");
        assert.equal(grouped.featureRules[0].type, "屏蔽低时长");
    });
});

describe("formatFeatureRuleSummary", () => {
    it("includes hit value and current threshold for number rules", () => {
        const summary = formatFeatureRuleSummary(
            { type: "屏蔽低时长", item: "120秒" },
            { blockedShortDuration: 180 }
        );

        assert.match(summary, /屏蔽低时长/);
        assert.match(summary, /命中 120秒/);
        assert.match(summary, /当前阈值 180秒/);
    });
});

describe("getListRuleChipLabel", () => {
    it("uses config value by default", () => {
        assert.equal(
            getListRuleChipLabel({
                type: "按标签屏蔽",
                configValue: "CS2",
            }),
            "CS2"
        );
    });

    it("hides words when menu privacy switch is on", () => {
        assert.equal(
            getListRuleChipLabel(
                {
                    type: "按标签屏蔽",
                    configValue: "CS2",
                },
                { hideBlockedWordsInMenu_Switch: true }
            ),
            "按标签屏蔽"
        );
    });
});

describe("disableFeatureRuleSwitch", () => {
    it("turns off the mapped feature switch", () => {
        let saved = null;
        const settingsStore = {
            exportSettings: () => ({
                blockedShortDuration_Switch: true,
                blockedShortDuration: 180,
            }),
            saveSettings(settings) {
                saved = settings;
                return settings;
            },
        };

        disableFeatureRuleSwitch(settingsStore, "blockedShortDuration_Switch");

        assert.equal(saved.blockedShortDuration_Switch, false);
        assert.equal(saved.blockedShortDuration, 180);
    });
});

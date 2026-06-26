import { performance } from "node:perf_hooks";

import { defaultSettings } from "../src/settings/defaults.js";
import { createSettingsStore } from "../src/settings/storage.js";
import { createVideoStore } from "../src/state/video-store.js";
import {
    findBlockedCommentTextMatches,
    findBlockedCommentUserMatches,
} from "../src/utils/comment-filter.js";

const STORAGE_KEY = "GM_blockedParameter";
const SIZES = [1000, 2000, 5000];
const VIDEO_COUNT = 100;
const COMMENT_COUNT = 500;
const TAGS_PER_VIDEO = 6;
const WARMUP_COUNT = 1;
const SAMPLE_COUNT = 5;

const FULL_LIST_KEYS = [
    "blockedTitle_Array",
    "blockedUpUid_Array",
    "blockedUpNameKeyword_Array",
    "blockedTag_Array",
    "blockedCommentText_Array",
    "blockedCommentUser_Array",
    "whitelistUpUid_Array",
    "whitelistBv_Array",
];

function main() {
    const webStorageTripwire = installWebStorageTripwire();
    try {
        installGmStorageMock();

        const storageRows = SIZES.map((size) => runStorageBoundary(size));
        const ruleRows = SIZES.flatMap((size) => runRuleBoundary(size));

        console.log("\nBoundary targets");
        console.table([
            { target: "1000 items/list", meaning: "expected stable use" },
            { target: "2000 items/list", meaning: "pressure target" },
            { target: "5000 items/list", meaning: "exploratory ceiling" },
        ]);

        console.log("\nStorage boundary");
        console.table(storageRows);

        console.log("\nRule boundary");
        console.table(ruleRows);

        const webStorageCalls = webStorageTripwire.getCalls();
        const webStoragePassed = webStorageCalls.localStorage === 0 && webStorageCalls.sessionStorage === 0;
        console.log("\nWeb Storage tripwire");
        console.table([
            {
                localStorageCalls: webStorageCalls.localStorage,
                sessionStorageCalls: webStorageCalls.sessionStorage,
                result: webStoragePassed ? "PASS" : "CHECK",
            },
        ]);

        if (!webStoragePassed) {
            process.exitCode = 1;
        }
    } finally {
        webStorageTripwire.restore();
    }
}

function runStorageBoundary(size) {
    const settings = createFullBoundarySettings(size);
    const json = JSON.stringify(settings);
    let store = createSettingsStore();

    const save = measureSamples(() => {
        store.saveSettings(settings);
    });

    setGmPayload(settings);
    const load = measureSamples(() => {
        store = createSettingsStore();
        assertRoundTrip(store.exportSettings(), size);
    });

    return {
        size,
        lists: FULL_LIST_KEYS.length,
        entries: formatInteger(size * FULL_LIST_KEYS.length),
        configMiB: formatMs(Buffer.byteLength(json, "utf8") / 1024 / 1024),
        saveP95Ms: formatMs(save.p95),
        loadP95Ms: formatMs(load.p95),
        roundTrip: "PASS",
    };
}

function runRuleBoundary(size) {
    return [
        benchVideoRule({
            size,
            caseName: "title/plain/no-hit",
            theoryChecks: VIDEO_COUNT * size,
            settings: {
                ...createEmptyRuleSettings(),
                blockedTitle_Switch: true,
                blockedTitle_UseRegular: false,
                blockedTitle_Array: makeList("blocked-title", size),
            },
            runRule: (store, bv, settings) => store.applyTitleAndUpRules(bv, settings),
        }),
        benchVideoRule({
            size,
            caseName: "title/regex/no-hit",
            theoryChecks: VIDEO_COUNT * size,
            settings: {
                ...createEmptyRuleSettings(),
                blockedTitle_Switch: true,
                blockedTitle_UseRegular: true,
                blockedTitle_Array: makeRegexList("blocked-title", size),
            },
            runRule: (store, bv, settings) => store.applyTitleAndUpRules(bv, settings),
        }),
        benchVideoRule({
            size,
            caseName: "up-uid/no-hit",
            theoryChecks: VIDEO_COUNT * size,
            settings: {
                ...createEmptyRuleSettings(),
                blockedUpUid_Switch: true,
                blockedUpUid_Array: makeUidList(size, 1_000_000_000),
            },
            runRule: (store, bv, settings) => store.applyTitleAndUpRules(bv, settings),
        }),
        benchVideoRule({
            size,
            caseName: "whitelist-up/no-hit",
            theoryChecks: VIDEO_COUNT * size,
            settings: {
                ...createEmptyRuleSettings(),
                whitelistUpUid_Switch: true,
                whitelistUpUid_Array: makeUidList(size, 2_000_000_000),
            },
            runRule: (store, bv, settings) => store.applyWhitelistRules(bv, settings),
        }),
        benchVideoRule({
            size,
            caseName: "tag/plain/no-hit",
            theoryChecks: VIDEO_COUNT * size * TAGS_PER_VIDEO,
            settings: {
                ...createEmptyRuleSettings(),
                blockedTag_Switch: true,
                blockedTag_UseRegular: false,
                blockedTag_Array: makeList("blocked-tag", size),
            },
            runRule: (store, bv, settings) => store.applyTagRules(bv, settings),
        }),
        benchCommentRule({
            size,
            caseName: "comment-text/plain/no-hit",
            theoryChecks: COMMENT_COUNT * size,
            patterns: makeList("blocked-comment", size),
            runRule: (comments, patterns) => {
                let matches = 0;
                for (const comment of comments) {
                    matches += findBlockedCommentTextMatches(comment.text, patterns, false).length;
                }
                assertNoMatches(matches);
            },
        }),
        benchCommentRule({
            size,
            caseName: "comment-text/regex/no-hit",
            theoryChecks: COMMENT_COUNT * size,
            patterns: makeRegexList("blocked-comment", size),
            runRule: (comments, patterns) => {
                let matches = 0;
                for (const comment of comments) {
                    matches += findBlockedCommentTextMatches(comment.text, patterns, true).length;
                }
                assertNoMatches(matches);
            },
        }),
        benchCommentRule({
            size,
            caseName: "comment-user/no-hit",
            theoryChecks: COMMENT_COUNT * size,
            patterns: makeUserList(size),
            runRule: (comments, patterns) => {
                let matches = 0;
                for (const comment of comments) {
                    matches += findBlockedCommentUserMatches(comment, patterns).length;
                }
                assertNoMatches(matches);
            },
        }),
    ];
}

function benchVideoRule({ size, caseName, theoryChecks, settings, runRule }) {
    const { store, bvs } = createSeededVideoStore();
    const samples = measureSamples(() => {
        store.resetAllBlockEvaluations();
        for (const bv of bvs) {
            runRule(store, bv, settings);
        }
    });

    return createRuleRow({ size, caseName, theoryChecks, samples });
}

function benchCommentRule({ size, caseName, theoryChecks, patterns, runRule }) {
    const comments = createSeededComments();
    const samples = measureSamples(() => {
        runRule(comments, patterns);
    });

    return createRuleRow({ size, caseName, theoryChecks, samples });
}

function createRuleRow({ size, caseName, theoryChecks, samples }) {
    return {
        size,
        case: caseName,
        theoryChecks: formatInteger(theoryChecks),
        p50Ms: formatMs(samples.p50),
        p95Ms: formatMs(samples.p95),
        maxMs: formatMs(samples.max),
        checksPerMs: formatInteger(theoryChecks / Math.max(samples.p50, 0.001)),
    };
}

function createFullBoundarySettings(size) {
    const settings = clone(defaultSettings);

    settings.blockedTitle_Switch = true;
    settings.blockedTitle_UseRegular = false;
    settings.blockedTitle_Array = makeList("title", size);

    settings.blockedUpUid_Switch = true;
    settings.blockedUpUid_Array = makeUidList(size, 1_000_000_000);

    settings.blockedUpNameKeyword_Switch = true;
    settings.blockedUpNameKeyword_UseRegular = false;
    settings.blockedUpNameKeyword_Array = makeList("up-name", size);

    settings.blockedTag_Switch = true;
    settings.blockedTag_UseRegular = false;
    settings.blockedTag_Array = makeList("tag", size);

    settings.blockedCommentText_Switch = true;
    settings.blockedCommentText_UseRegular = false;
    settings.blockedCommentText_Array = makeList("comment-text", size);

    settings.blockedCommentUser_Switch = true;
    settings.blockedCommentUser_Array = makeUserList(size);

    settings.whitelistUpUid_Switch = true;
    settings.whitelistUpUid_Array = makeUidList(size, 2_000_000_000);

    settings.whitelistBv_Switch = true;
    settings.whitelistBv_Array = makeBvList(size);

    return settings;
}

function createEmptyRuleSettings() {
    return {
        ...clone(defaultSettings),
        blockedTitle_Switch: false,
        blockedTitle_Array: [],
        blockedUpUid_Switch: false,
        blockedUpUid_Array: [],
        blockedUpNameKeyword_Switch: false,
        blockedUpNameKeyword_Array: [],
        blockedTag_Switch: false,
        blockedTag_Array: [],
        doubleBlockedTag_Switch: false,
        doubleBlockedTag_Array: [],
        whitelistBv_Switch: false,
        whitelistBv_Array: [],
        whitelistUpUid_Switch: false,
        whitelistUpUid_Array: [],
    };
}

function createSeededVideoStore() {
    const store = createVideoStore();
    const bvs = [];

    for (let index = 0; index < VIDEO_COUNT; index++) {
        const bv = `BVBoundary${index.toString(36).padStart(4, "0")}`;
        bvs.push(bv);
        store.mergeVideoInfo(bv, {
            videoTitle: `actual video title ${index}`,
            videoUpName: `Actual UP ${index}`,
            videoUpUid: String(9_000_000_000 + index),
            videoTags: Array.from({ length: TAGS_PER_VIDEO }, (_, tagIndex) => `actual-tag-${index}-${tagIndex}`),
        });
    }

    return { store, bvs };
}

function createSeededComments() {
    return Array.from({ length: COMMENT_COUNT }, (_, index) => ({
        text: `actual comment text ${index} without configured keyword`,
        userId: String(9_000_000_000 + index),
        userName: `ActualUser${index}`,
    }));
}

function measureSamples(fn) {
    for (let index = 0; index < WARMUP_COUNT; index++) {
        fn();
    }

    const durations = [];
    for (let index = 0; index < SAMPLE_COUNT; index++) {
        const start = performance.now();
        fn();
        durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    return {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations[durations.length - 1],
    };
}

function percentile(values, percentileValue) {
    const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
    return values[index];
}

let gmPayload = "{}";

function installGmStorageMock() {
    globalThis.GM_getValue = (key, fallbackValue) => {
        if (key !== STORAGE_KEY) {
            return fallbackValue;
        }
        return gmPayload ? JSON.parse(gmPayload) : fallbackValue;
    };

    globalThis.GM_setValue = (key, value) => {
        if (key !== STORAGE_KEY) {
            throw new Error(`Unexpected GM_setValue key: ${key}`);
        }
        gmPayload = JSON.stringify(value);
    };
}

function setGmPayload(value) {
    gmPayload = JSON.stringify(value);
}

function installWebStorageTripwire() {
    const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const previousSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    const calls = {
        localStorage: 0,
        sessionStorage: 0,
    };

    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: createStorageTripwire(() => {
            calls.localStorage++;
        }),
    });
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: createStorageTripwire(() => {
            calls.sessionStorage++;
        }),
    });

    return {
        getCalls() {
            return { ...calls };
        },
        restore() {
            restoreGlobalProperty("localStorage", previousLocalStorage);
            restoreGlobalProperty("sessionStorage", previousSessionStorage);
        },
    };
}

function createStorageTripwire(recordCall) {
    return {
        get length() {
            recordCall();
            return 0;
        },
        clear() {
            recordCall();
        },
        getItem() {
            recordCall();
            return null;
        },
        key() {
            recordCall();
            return null;
        },
        removeItem() {
            recordCall();
        },
        setItem() {
            recordCall();
        },
    };
}

function restoreGlobalProperty(propertyName, descriptor) {
    if (descriptor) {
        Object.defineProperty(globalThis, propertyName, descriptor);
        return;
    }
    delete globalThis[propertyName];
}

function assertRoundTrip(settings, size) {
    for (const key of FULL_LIST_KEYS) {
        if (!Array.isArray(settings[key]) || settings[key].length !== size) {
            throw new Error(`Storage round-trip failed for ${key}: expected ${size}, got ${settings[key]?.length}`);
        }
    }
}

function assertNoMatches(matches) {
    if (matches !== 0) {
        throw new Error(`Expected no matches, got ${matches}`);
    }
}

function makeList(prefix, size) {
    return Array.from({ length: size }, (_, index) => `${prefix}-${index.toString().padStart(5, "0")}`);
}

function makeRegexList(prefix, size) {
    return Array.from({ length: size }, (_, index) => `^${prefix}-${index.toString().padStart(5, "0")}$`);
}

function makeUidList(size, offset) {
    return Array.from({ length: size }, (_, index) => String(offset + index));
}

function makeUserList(size) {
    return Array.from({ length: size }, (_, index) => `uid:${1_000_000_000 + index}`);
}

function makeBvList(size) {
    return Array.from({ length: size }, (_, index) => `BVWL${index.toString(36).padStart(8, "0")}`);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function formatMs(value) {
    return Number(value).toFixed(2);
}

function formatInteger(value) {
    return Math.round(value).toLocaleString("en-US");
}

main();

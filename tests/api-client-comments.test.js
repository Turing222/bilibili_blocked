import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import { createBilibiliApiClient } from "../src/platform/api-client.js";
import { createVideoStore } from "../src/state/video-store.js";

const originalFetch = globalThis.fetch;

function createCommentResponseJson(message) {
    return {
        code: 0,
        data: {
            control: { web_selection: 0 },
            top: { upper: { content: { message } } },
        },
    };
}

function createFetchStub({ resolveSequence, latencyMs = 0 }) {
    const calls = [];
    const fetchFn = (url) => {
        calls.push(url);
        const isCommentApi = url.includes("/x/v2/reply");
        const responseJson = isCommentApi
            ? resolveSequence(calls.filter((c) => c.includes("/x/v2/reply")).length)
            : {
                  code: 0,
                  data: {
                      aid: 12345,
                      stat: { view: 1000, like: 100, coin: 50, favorite: 30 },
                      owner: { name: "测试UP", mid: "999" },
                      pubdate: Math.floor(Date.now() / 1000) - 100000,
                      duration: 600,
                      tid: 1,
                      tname: "动画",
                  },
              };
        const response = {
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve(responseJson),
        };
        const result = latencyMs > 0
            ? new Promise((resolve) => setTimeout(() => resolve(response), latencyMs))
            : Promise.resolve(response);
        return result;
    };
    return { fetchFn, calls };
}

function commentApiCalls(calls) {
    return calls.filter((url) => url.includes("/x/v2/reply"));
}

function waitForPendingTimers(ms = 50) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settleCommentQueue(ms = 600) {
    await waitForPendingTimers(ms);
}

describe("createBilibiliApiClient comment queue", () => {
    let apiClient;
    let videoStore;
    let refreshCalls;
    let fetchStub;

    beforeEach(() => {
        refreshCalls = 0;
        videoStore = createVideoStore();
        fetchStub = createFetchStub({
            resolveSequence: () => createCommentResponseJson("置顶评论"),
        });
        globalThis.fetch = fetchStub.fetchFn;
        apiClient = createBilibiliApiClient();
        apiClient.setRefreshCallback(() => {
            refreshCalls++;
        });
    });

    afterEach(async () => {
        await settleCommentQueue();
        globalThis.fetch = originalFetch;
    });

    it("enqueues and processes distinct comment requests sequentially", async () => {
        for (let i = 0; i < 3; i++) {
            videoStore.mergeVideoInfo(`BV${i}`, { videoTitle: `视频${i}`, videoAVid: 1000 + i });
        }

        apiClient.requestCommentsIfNeeded("BV0", videoStore);
        apiClient.requestCommentsIfNeeded("BV1", videoStore);
        apiClient.requestCommentsIfNeeded("BV2", videoStore);

        await settleCommentQueue(900);

        assert.equal(commentApiCalls(fetchStub.calls).length, 3);
        for (let i = 0; i < 3; i++) {
            assert.equal(videoStore.getVideoInfo(`BV${i}`).topComment, "置顶评论");
        }
    });

    it("does not fire concurrent comment requests", async () => {
        let commentInFlight = 0;
        let maxCommentInFlight = 0;
        globalThis.fetch = (url) => {
            const isComment = url.includes("/x/v2/reply");
            if (isComment) {
                commentInFlight++;
                maxCommentInFlight = Math.max(maxCommentInFlight, commentInFlight);
            }
            const responseJson = isComment
                ? createCommentResponseJson("置顶")
                : { code: 0, data: { aid: 1, stat: { view: 1, like: 1, coin: 1, favorite: 1 }, owner: { name: "UP", mid: "1" } } };
            const response = {
                ok: true,
                status: 200,
                statusText: "OK",
                json: () => Promise.resolve(responseJson),
            };
            return new Promise((resolve) => {
                setTimeout(() => {
                    if (isComment) {
                        commentInFlight--;
                    }
                    resolve(response);
                }, 20);
            });
        };

        for (let i = 0; i < 4; i++) {
            videoStore.mergeVideoInfo(`BV${i}`, { videoTitle: `视频${i}`, videoAVid: 2000 + i });
            apiClient.requestCommentsIfNeeded(`BV${i}`, videoStore);
        }

        await settleCommentQueue(1200);

        assert.equal(maxCommentInFlight, 1);
    });

    it("deduplicates repeated enqueue for the same bv", async () => {
        videoStore.mergeVideoInfo("BVdup", { videoTitle: "重复视频", videoAVid: 555 });

        apiClient.requestCommentsIfNeeded("BVdup", videoStore);
        apiClient.requestCommentsIfNeeded("BVdup", videoStore);
        apiClient.requestCommentsIfNeeded("BVdup", videoStore);

        await settleCommentQueue(400);

        assert.equal(commentApiCalls(fetchStub.calls).length, 1);
    });

    it("calls refresh callback after draining the queue", async () => {
        videoStore.mergeVideoInfo("BV1", { videoTitle: "视频1", videoAVid: 11 });
        videoStore.mergeVideoInfo("BV2", { videoTitle: "视频2", videoAVid: 12 });

        apiClient.requestCommentsIfNeeded("BV1", videoStore);
        apiClient.requestCommentsIfNeeded("BV2", videoStore);

        await settleCommentQueue(700);

        assert.ok(refreshCalls >= 2);
    });
});

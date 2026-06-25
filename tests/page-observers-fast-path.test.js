import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { startPageObservers } from "../src/platform/page-observers.js";

afterEach(() => {
    mock.timers.reset();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.MutationObserver;
});

describe("page observer fast path", () => {
    it("batches newly added video cards before running the single-card refresh", () => {
        mock.timers.enable({ apis: ["setTimeout"] });

        const observers = installFakeMutationObserver();
        globalThis.window = {
            addEventListener: () => {},
        };
        globalThis.document = {
            body: {},
        };

        const addedRuns = [];
        let fullRuns = 0;

        startPageObservers(() => {
            fullRuns++;
        }, {
            getAddedVideoElements: (records) => records.flatMap((record) => record.addedNodes || []),
            onAddedVideoElements: (videoElements) => {
                addedRuns.push(videoElements);
            },
        });

        const observer = observers[0];
        const firstCard = { id: "a" };
        const secondCard = { id: "b" };

        observer.trigger([
            {
                type: "childList",
                addedNodes: [firstCard],
                removedNodes: [],
            },
        ]);
        observer.trigger([
            {
                type: "childList",
                addedNodes: [firstCard, secondCard],
                removedNodes: [],
            },
        ]);

        mock.timers.tick(49);
        assert.equal(addedRuns.length, 0);
        assert.equal(fullRuns, 0);

        mock.timers.tick(1);
        assert.equal(addedRuns.length, 1);
        assert.deepEqual(addedRuns[0], [firstCard, secondCard]);
        assert.equal(fullRuns, 0);

        mock.timers.tick(249);
        assert.equal(fullRuns, 0);

        mock.timers.tick(1);
        assert.equal(fullRuns, 1);
    });
});

function installFakeMutationObserver() {
    const observers = [];

    globalThis.MutationObserver = class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            observers.push(this);
        }

        observe(target, options) {
            this.target = target;
            this.options = options;
        }

        trigger(records) {
            this.callback(records);
        }
    };

    return observers;
}

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createCardActions } from "../src/platform/card-actions.js";

function createMockVideoElement() {
    let contextMenuHandler = null;

    return {
        addEventListener(type, handler) {
            if (type === "contextmenu") {
                contextMenuHandler = handler;
            }
        },
        dispatchContextMenu(event) {
            contextMenuHandler?.(event);
        },
    };
}

function createContextMenuEvent(modifiers = {}) {
    let defaultPrevented = false;
    let propagationStopped = false;

    return {
        shiftKey: modifiers.shift === true,
        ctrlKey: modifiers.ctrl === true,
        altKey: modifiers.alt === true,
        metaKey: modifiers.meta === true,
        clientX: 10,
        clientY: 20,
        preventDefault() {
            defaultPrevented = true;
        },
        stopPropagation() {
            propagationStopped = true;
        },
        get defaultPrevented() {
            return defaultPrevented;
        },
        get propagationStopped() {
            return propagationStopped;
        },
    };
}

function mountCardAction({ modifier, videoInfo = {}, scriptEnabled = true }) {
    const videoElement = createMockVideoElement();
    const cardActions = createCardActions();
    const context = {
        settingsStore: {
            getSettings: () => ({
                contextMenuScriptModifier: modifier,
                scriptEnabled_Switch: scriptEnabled,
            }),
        },
        videoStore: {
            getVideoInfo: () => videoInfo,
        },
    };

    cardActions.mount(context, videoElement, "BV1test");
    return { videoElement, context };
}

afterEach(() => {
    delete globalThis.window;
});

describe("card context menu actions", () => {
    it("keeps the native menu when the configured trigger does not match", () => {
        const { videoElement } = mountCardAction({ modifier: "shift" });
        const event = createContextMenuEvent();

        videoElement.dispatchContextMenu(event);

        assert.equal(event.defaultPrevented, false);
    });

    it("opens the script panel when the configured trigger matches exactly", () => {
        let panelCall = null;
        globalThis.window = {
            bbvtShowHoverReviewPanel: (...args) => {
                panelCall = args;
            },
        };

        const { videoElement } = mountCardAction({
            modifier: "shift",
            videoInfo: { blockedTarget: true },
        });
        const event = createContextMenuEvent({ shift: true });

        videoElement.dispatchContextMenu(event);

        assert.equal(event.defaultPrevented, true);
        assert.equal(event.propagationStopped, true);
        assert.equal(panelCall?.[1], "BV1test");
        assert.equal(panelCall?.[3], undefined);
        assert.equal(panelCall?.[4], 10);
        assert.equal(panelCall?.[5], 20);
    });

    it("ignores the script context menu when the master switch is off", () => {
        let panelCall = null;
        globalThis.window = {
            bbvtShowHoverReviewPanel: (...args) => {
                panelCall = args;
            },
        };

        const { videoElement } = mountCardAction({
            modifier: "shift",
            videoInfo: { blockedTarget: true },
            scriptEnabled: false,
        });
        const event = createContextMenuEvent({ shift: true });

        videoElement.dispatchContextMenu(event);

        assert.equal(event.defaultPrevented, false);
        assert.equal(panelCall, null);
    });
});

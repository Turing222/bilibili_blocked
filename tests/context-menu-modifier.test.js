import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    normalizeContextMenuScriptModifier,
    shouldOpenScriptContextMenu,
} from "../src/utils/context-menu-modifier.js";

function createMouseEvent(modifiers = {}) {
    return {
        shiftKey: modifiers.shift === true,
        ctrlKey: modifiers.ctrl === true,
        altKey: modifiers.alt === true,
        metaKey: modifiers.meta === true,
    };
}

describe("contextMenuScriptModifier", () => {
    it("normalizes unknown values to none", () => {
        assert.equal(normalizeContextMenuScriptModifier("shift"), "shift");
        assert.equal(normalizeContextMenuScriptModifier("invalid"), "none");
    });

    it("opens the script menu on plain right click when right click is bound", () => {
        assert.equal(shouldOpenScriptContextMenu(createMouseEvent(), "none"), true);
        assert.equal(shouldOpenScriptContextMenu(createMouseEvent({ shift: true }), "none"), false);
    });

    it("opens the script menu only when the selected modifier matches exactly", () => {
        const shiftEvent = createMouseEvent({ shift: true });
        const shiftCtrlEvent = createMouseEvent({ shift: true, ctrl: true });

        assert.equal(shouldOpenScriptContextMenu(shiftEvent, "shift"), true);
        assert.equal(shouldOpenScriptContextMenu(shiftCtrlEvent, "shift"), false);
        assert.equal(shouldOpenScriptContextMenu(createMouseEvent({ shift: true, meta: true }), "shift"), false);
        assert.equal(shouldOpenScriptContextMenu(createMouseEvent({ ctrl: true }), "ctrl"), true);
        assert.equal(shouldOpenScriptContextMenu(createMouseEvent({ alt: true }), "alt"), true);
        assert.equal(shouldOpenScriptContextMenu(createMouseEvent(), "shift"), false);
    });
});

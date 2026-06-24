import { quickBlockVideo } from "../actions/quick-block.js";
import { shouldOpenScriptContextMenu } from "../utils/context-menu-modifier.js";
import { isMasterSwitchEnabled } from "../utils/script-enabled.js";

export function createCardActions() {
    const mounted = new WeakSet();

    return {
        mount(context, videoElement, videoBv) {
            if (mounted.has(videoElement)) return;
            mounted.add(videoElement);

            videoElement.addEventListener("contextmenu", (event) => {
                if (!isMasterSwitchEnabled(context)) {
                    return;
                }

                const settings = context.settingsStore.getSettings();
                if (!shouldOpenScriptContextMenu(event, settings.contextMenuScriptModifier)) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation?.();
                const videoInfo = context.videoStore.getVideoInfo(videoBv);
                if (videoInfo && videoInfo.blockedTarget) {
                    if (typeof window.bbvtShowHoverReviewPanel === "function") {
                        window.bbvtShowHoverReviewPanel(context, videoBv, videoElement, undefined, event.clientX, event.clientY);
                    }
                } else {
                    quickBlockVideo(context, videoBv, videoElement, event.clientX, event.clientY);
                }
            });
        },
    };
}

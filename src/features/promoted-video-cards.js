export const promotedVideoCardsFeature = {
    name: "promoted-video-cards",
    enabled: () => true,
    run: ({ settings, domAdapter }) => {
        if (settings.hidePromotedVideoCards_Switch) {
            domAdapter.hidePromotedVideoCards?.();
            return;
        }

        domAdapter.restorePromotedVideoCards?.();
    },
};

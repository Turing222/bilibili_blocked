// == API 健康状态记录 ========================================================
//
// 职责：
// - 记录脚本侧观察到的 API 请求结果。
// - 按 endpoint 和 capability 聚合最近状态。
// - 只提供状态，不做熔断、不决定规则是否启用。

export const API_DATA_STATUS = {
    UNKNOWN: "unknown",
    PENDING: "pending",
    READY: "ready",
    EMPTY: "empty",
    UNAVAILABLE: "unavailable",
};

export const API_DATA_KEYS = {
    VIDEO_VIEW: "videoView",
    VIDEO_TAGS: "videoTags",
    UP_PROFILE: "upProfile",
    VIDEO_COMMENTS: "videoComments",
};

export const API_EVENT_OUTCOME = {
    SUCCESS: "success",
    EMPTY: "empty",
    FAILURE: "failure",
};

export const API_HEALTH_STATUS = {
    UNOBSERVED: "unobserved",
    NORMAL: "normal",
    UNSTABLE: "unstable",
    UNAVAILABLE: "unavailable",
};

export function createApiHealthStore({ recentLimit = 10, unavailableThreshold = 5 } = {}) {
    const capabilityStates = {};
    const endpointStates = {};

    return {
        recordSuccess(details) {
            recordEvent({
                ...details,
                outcome: API_EVENT_OUTCOME.SUCCESS,
            });
        },

        recordEmpty(details) {
            recordEvent({
                ...details,
                outcome: API_EVENT_OUTCOME.EMPTY,
            });
        },

        recordFailure(details) {
            recordEvent({
                ...details,
                outcome: API_EVENT_OUTCOME.FAILURE,
            });
        },

        getCapabilitySnapshot(capabilityId) {
            return snapshotState(capabilityStates[capabilityId]);
        },

        getEndpointSnapshot(endpointId) {
            return snapshotState(endpointStates[endpointId]);
        },

        getSnapshot() {
            return {
                capabilities: snapshotStates(capabilityStates),
                endpoints: snapshotStates(endpointStates),
            };
        },
    };

    function recordEvent(details) {
        const event = normalizeEvent(details);
        updateState(ensureState(capabilityStates, event.capabilityId), event);
        updateState(ensureState(endpointStates, event.endpointId), event);
    }

    function updateState(state, event) {
        state.lastEvent = event;
        state.recentEvents.push(event);
        if (state.recentEvents.length > recentLimit) {
            state.recentEvents.shift();
        }

        if (event.outcome === API_EVENT_OUTCOME.FAILURE) {
            state.failureCount++;
            state.consecutiveFailures++;
        } else {
            state.successCount++;
            state.consecutiveFailures = 0;
        }

        if (event.outcome === API_EVENT_OUTCOME.EMPTY) {
            state.emptyCount++;
        }

        state.status = resolveHealthStatus(state);
    }

    function resolveHealthStatus(state) {
        if (!state.lastEvent) {
            return API_HEALTH_STATUS.UNOBSERVED;
        }

        if (state.consecutiveFailures >= unavailableThreshold) {
            return API_HEALTH_STATUS.UNAVAILABLE;
        }

        const hasRecentFailure = state.recentEvents.some((event) => event.outcome === API_EVENT_OUTCOME.FAILURE);
        return hasRecentFailure ? API_HEALTH_STATUS.UNSTABLE : API_HEALTH_STATUS.NORMAL;
    }
}

function ensureState(states, id) {
    if (!states[id]) {
        states[id] = {
            status: API_HEALTH_STATUS.UNOBSERVED,
            successCount: 0,
            emptyCount: 0,
            failureCount: 0,
            consecutiveFailures: 0,
            recentEvents: [],
            lastEvent: null,
        };
    }

    return states[id];
}

function normalizeEvent(details) {
    return {
        capabilityId: details.capabilityId || "unknown",
        endpointId: details.endpointId || "unknown",
        outcome: details.outcome,
        time: details.time || new Date().toISOString(),
        durationMs: details.durationMs ?? null,
        httpStatus: details.httpStatus ?? null,
        apiCode: details.apiCode ?? null,
        errorKind: details.errorKind || "",
        message: details.message || "",
    };
}

function snapshotStates(states) {
    const snapshots = {};
    for (const id in states) {
        snapshots[id] = snapshotState(states[id]);
    }
    return snapshots;
}

function snapshotState(state) {
    if (!state) {
        return {
            status: API_HEALTH_STATUS.UNOBSERVED,
            successCount: 0,
            emptyCount: 0,
            failureCount: 0,
            consecutiveFailures: 0,
            recentEvents: [],
            lastEvent: null,
        };
    }

    return {
        status: state.status,
        successCount: state.successCount,
        emptyCount: state.emptyCount,
        failureCount: state.failureCount,
        consecutiveFailures: state.consecutiveFailures,
        recentEvents: state.recentEvents.map((event) => ({ ...event })),
        lastEvent: state.lastEvent ? { ...state.lastEvent } : null,
    };
}

import { setButtonIcon } from "./icons.js";

const statsPanelId = "bbvtStatsPanel";
const aggregateOnlyStatsTypes = new Set([
    "屏蔽低UP主粉丝数",
]);

export function openStatsPanel(context) {
    if (document.getElementById(statsPanelId)) return;

    injectStatsStyles();

    const overlay = document.createElement("div");
    overlay.id = statsPanelId;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });

    renderStats(overlay, context);
}

function renderStats(overlay, context) {
    overlay.replaceChildren();

    const panel = createStatsPanelEl("div", "sp-panel");

    const header = createStatsPanelEl("div", "sp-header");
    const closeBtn = createStatsPanelEl("button", "sp-close", "×");
    setButtonIcon(closeBtn, "close", "关闭统计面板");
    closeBtn.addEventListener("click", () => overlay.remove());
    header.append(createStatsPanelEl("span", "sp-title", "屏蔽统计"), closeBtn);

    const data = context.statsStore.getData();
    const groups = groupData(data);
    const total = Object.values(data).reduce((s, v) => s + v, 0);

    const body = createStatsPanelEl("div", "sp-body");
    body.appendChild(createStatsPanelEl("div", "sp-total", `累计命中：${total} 次`));

    if (Object.keys(data).length === 0) {
        body.appendChild(createStatsPanelEl("div", "sp-empty", "暂无统计数据"));
    } else {
        for (const [type, items] of Object.entries(groups)) {
            const typeTotal = items.reduce((s, [, v]) => s + v, 0);
            const section = createStatsPanelEl("div", "sp-section");
            section.appendChild(createStatsPanelEl("div", "sp-section-title", `${type}（${typeTotal}）`));
            if (!aggregateOnlyStatsTypes.has(type)) {
                for (const [item, count] of items) {
                    const row = createStatsPanelEl("div", "sp-row");
                    row.append(createStatsPanelEl("span", "sp-label", item), createStatsPanelEl("span", "sp-badge", String(count)));
                    section.appendChild(row);
                }
            }
            body.appendChild(section);
        }
    }

    const actions = createStatsPanelEl("div", "sp-actions");
    const clearBtn = createStatsPanelEl("button", "sp-btn", "清除数据");
    setButtonIcon(clearBtn, "trash", "清除统计数据", "清除数据");
    clearBtn.addEventListener("click", () => {
        context.statsStore.clear();
        renderStats(overlay, context);
    });
    const closeBtn2 = createStatsPanelEl("button", "sp-btn-primary", "关闭");
    setButtonIcon(closeBtn2, "close", "关闭统计面板", "关闭");
    closeBtn2.addEventListener("click", () => overlay.remove());
    actions.append(clearBtn, closeBtn2);

    panel.append(header, body, actions);
    overlay.appendChild(panel);
}

function groupData(data) {
    const groups = {};
    for (const [key, count] of Object.entries(data)) {
        const sep = key.indexOf(": ");
        const type = sep >= 0 ? key.slice(0, sep) : key;
        const item = sep >= 0 ? key.slice(sep + 2) : key;
        if (!groups[type]) groups[type] = [];
        groups[type].push([item, count]);
    }
    for (const type in groups) {
        groups[type].sort(([, a], [, b]) => b - a);
    }
    return groups;
}

function createStatsPanelEl(tag, className, text = "") {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
}

function injectStatsStyles() {
    if (document.getElementById("bbvtStatsStyles")) return;

    const css = `
        #${statsPanelId} {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            background: rgba(0,0,0,0.65);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            animation: spFadeIn 0.25s ease-out forwards;
        }

        @keyframes spFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        #${statsPanelId} ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        #${statsPanelId} ::-webkit-scrollbar-track {
            background: transparent;
        }

        #${statsPanelId} ::-webkit-scrollbar-thumb {
            background: rgba(120, 120, 120, 0.4);
            border-radius: 3px;
        }

        #${statsPanelId} ::-webkit-scrollbar-thumb:hover {
            background: rgba(120, 120, 120, 0.6);
        }

        #${statsPanelId} .sp-panel {
            width: min(560px, calc(100vw - 32px));
            max-height: min(700px, calc(100vh - 32px));
            background: rgba(22, 25, 30, 0.96);
            color: rgb(239,244,248);
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: scale(0.97);
            animation: spZoomIn 0.25s ease-out forwards;
        }

        @keyframes spZoomIn {
            to { transform: scale(1); }
        }

        #${statsPanelId} .sp-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            background: rgba(31,36,43,0.86);
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        #${statsPanelId} .sp-title { font-size: 16px; font-weight: 700; }

        #${statsPanelId} .sp-close {
            width: 32px; height: 32px; padding: 0; font-size: 13px;
            line-height: 32px; border: 0; border-radius: 8px;
            background: rgba(255,255,255,0.08); color: rgb(215,222,229); cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center;
        }

        #${statsPanelId} .sp-close:hover {
            background: rgba(232,93,93,0.92);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(232,93,93,0.26);
        }

        #${statsPanelId} .sp-body {
            flex: 1; overflow: auto; padding: 18px;
            display: flex; flex-direction: column; gap: 16px;
        }

        #${statsPanelId} .sp-total {
            font-size: 13px; color: rgb(91,213,237);
            padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        #${statsPanelId} .sp-empty { color: rgb(142,154,168); font-size: 13px; }

        #${statsPanelId} .sp-section { display: flex; flex-direction: column; gap: 6px; }

        #${statsPanelId} .sp-section-title {
            font-size: 13px; font-weight: 600;
            color: rgb(188,198,208); margin-bottom: 4px;
        }

        #${statsPanelId} .sp-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 12px; border-radius: 6px;
            background: rgba(255,255,255,0.06); font-size: 13px;
            transition: background 0.2s ease;
        }

        #${statsPanelId} .sp-row:hover {
            background: rgba(255,255,255,0.1);
        }

        #${statsPanelId} .sp-label {
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
        }

        #${statsPanelId} .sp-badge {
            background: rgb(18,183,219); color: white; border-radius: 999px;
            padding: 2px 10px; font-size: 12px; margin-left: 10px; flex-shrink: 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        #${statsPanelId} .sp-actions {
            display: flex; justify-content: flex-end; gap: 10px;
            padding: 14px 18px; background: rgba(31,36,43,0.86);
            border-top: 1px solid rgba(255,255,255,0.08);
        }

        #${statsPanelId} .sp-btn,
        #${statsPanelId} .sp-btn-primary {
            border: 0; border-radius: 8px; padding: 7px 16px;
            font-size: 13px; cursor: pointer; transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        }

        #${statsPanelId} .sp-btn-primary { background: rgb(18,183,219); color: white; }
        #${statsPanelId} .sp-btn-primary:hover {
            background: rgb(33,202,238); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(18,183,219,0.28);
        }

        #${statsPanelId} .sp-btn { background: rgba(255,255,255,0.08); color: rgb(215,222,229); }
        #${statsPanelId} .sp-btn:hover {
            background: rgba(232,93,93,0.9); color: white; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(232,93,93,0.22);
        }

        #${statsPanelId} .bbvt-icon {
            width: 14px;
            height: 14px;
            flex: 0 0 auto;
        }
    `;

    const style = document.createElement("style");
    style.id = "bbvtStatsStyles";
    style.textContent = css;
    document.head.appendChild(style);
}

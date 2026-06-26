const iconPaths = {
    settings: [
        "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
        "M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12",
    ],
    close: ["M18 6 6 18M6 6l12 12"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
    save: ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"],
    upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"],
    download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"],
    refresh: ["M21 12a9 9 0 0 1-15.5 6.3M3 12A9 9 0 0 1 18.5 5.7M18 3v4h-4M6 21v-4h4"],
    eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z", "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6"],
    code: ["M16 18l6-6-6-6M8 6l-6 6 6 6"],
    chart: ["M3 3v18h18M7 16v-5M12 16V8M17 16v-9"],
    plus: ["M12 5v14M5 12h14"],
    trash: ["M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"],
    userX: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8M17 8l5 5M22 8l-5 5"],
    tag: ["M20.5 13.5 13.5 20.5a2 2 0 0 1-2.8 0L3 12.8V3h9.8l7.7 7.7a2 2 0 0 1 0 2.8zM7.5 7.5h.01"],
};

export function setButtonIcon(button, iconName, label, text = "") {
    if (!button) {
        return;
    }

    button.textContent = "";
    button.appendChild(createIcon(iconName));

    if (text) {
        const labelElement = document.createElement("span");
        labelElement.className = "bbvt-icon-label";
        labelElement.textContent = text;
        button.appendChild(labelElement);
    }

    if (label && !button.title) {
        button.title = label;
    }
    button.setAttribute?.("aria-label", label || text || iconName);
}

export function createIcon(iconName) {
    if (typeof document.createElementNS !== "function") {
        const fallback = document.createElement("span");
        fallback.className = "bbvt-icon";
        fallback.setAttribute?.("aria-hidden", "true");
        return fallback;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "bbvt-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const paths = iconPaths[iconName] || iconPaths.shield;
    paths.forEach((pathData) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        svg.appendChild(path);
    });

    return svg;
}

// == B 站 DOM 适配层 =========================================================
//
// 职责：
// - 集中管理 B 站页面 selector。
// - 判断哪些 URL 不需要处理视频屏蔽。
// - 获取视频卡片元素。
// - 从视频卡片读取 BV、标题、链接、UP 名称、UID。
// - 获取热搜项。
// - 隐藏非视频元素。
//
// 不负责：
// - 不判断具体屏蔽规则。
// - 不请求 API。
// - 不创建叠加层。
//
// 原脚本迁移来源：
// - noBlockedVideoUrls
// - determineURL()
// - getVideoElements()
// - isAlreadyBlockedChildElement()
// - getBvAndTitle()
// - getNameAndUid()
// - getTrendingItemElements()
// - hideNonVideoElements()

const noBlockedVideoUrls = [
    /^https:\/\/www\.bilibili\.com\/anime\//,
    /^https:\/\/live\.bilibili\.com\//,
    /^https:\/\/account\.bilibili\.com\//,
    /^https:\/\/message\.bilibili\.com\//,
    /^https:\/\/t\.bilibili\.com\//,
    /^https:\/\/space\.bilibili\.com\/[0-9]+/,
    /^https:\/\/www\.bilibili\.com\/history/,
    /^https:\/\/link\.bilibili\.com\//,
];

const commentShadowRootObservers = new WeakMap();
let commentDocumentObserver = null;
let commentChangeCallback = null;
let commentChangeTimer = null;
let commentShadowRootDiscoveryTimer = null;

const commentContentSelectors = [
    ".reply-content",
    ".sub-reply-content",
    ".reply-content-text",
    ".sub-reply-content-text",
    ".reply-content-container",
    ".reply-text",
    ".comment-content",
    ".content",
    "#contents",
    "bili-rich-text",
    "bili-comment-rich-text",
    "bili-comment-content-renderer",
    "[class*='reply-content']",
    "[class*='reply-text']",
    "[class*='comment-content']",
    "[class*='rich-text']",
];

const commentUserSelectors = [
    ".reply-name",
    ".sub-user-name",
    ".user-name",
    ".name",
    "a[href*='space.bilibili.com/']",
    "[class*='reply-name']",
    "[class*='user-name']",
];

const excludedCommentImageUrlParts = [
    "bfs/face",
    "bfs/emote",
    "bfs/garb",
    "bfs/vip",
    "bfs/member",
    "bfs/pendant",
    "avatar",
];

const commentObservedAttributeNames = [
    "aria-label",
    "data-mid",
    "data-original",
    "data-src",
    "data-uid",
    "data-uname",
    "data-url",
    "data-user-id",
    "data-user-name",
    "href",
    "mid",
    "src",
    "style",
    "title",
    "uid",
    "uname",
    "user-id",
    "user-name",
];

export function createBilibiliDomAdapter() {
    return {
        shouldSkipVideoBlocking(currentUrl) {
            return noBlockedVideoUrls.some((urlRule) => urlRule.test(currentUrl));
        },

        getVideoElements() {
            let videoElements = document.querySelectorAll(
                "div.bili-video-card, div.video-page-card-small, li.bili-rank-list-video__item, div.video-card, li.rank-item, div.video-card-reco, div.video-card-common, div.rank-wrap"
            );

            videoElements = Array.from(videoElements).filter((element) => element.querySelector("a"));

            if (document.querySelector("div.recommend-container__2-line") == null) {
                videoElements = videoElements.filter((element) => element.classList.value !== "bili-video-card is-rcmd");
            }

            return videoElements;
        },

        isAlreadyBlockedChildElement(videoElement) {
            // 仅跳过 card-box 延迟叠加层动画中的卡片（与 legacy 仅跳过 blur pending 一致）
            return videoElement.dataset.bbvtBlocked === "pending";
        },

        readVideoRef(videoElement) {
            const videoLinkElements = videoElement.querySelectorAll("a");
            let videoBv;
            let videoLink;

            for (let videoLinkElement of videoLinkElements) {
                if (videoBv) {
                    continue;
                }

                if (videoLinkElement.className == "other-link") {
                    continue;
                }

                const videoAvTemp = videoLinkElement.href.match(/\/(av)(\d+)/);
                if (videoAvTemp) {
                    videoBv = av2bv(videoAvTemp[2]);
                }

                const videoBvTemp = videoLinkElement.href.match(/\/(BV\w+)/);
                if (videoBvTemp) {
                    videoBv = videoBvTemp[1];
                }

                if (videoBv) {
                    videoLink = videoLinkElement.href;
                }
            }

            if (!videoBv) {
                return null;
            }

            const titleElement = videoElement.querySelector("[title]:not(span)");

            return {
                videoBv,
                videoLink,
                videoTitle: titleElement?.title || "",
            };
        },

        readVideoBasicInfo(videoElement) {
            const videoLinkElements = videoElement.querySelectorAll("a");

            for (let videoLinkElement of videoLinkElements) {
                const uidLink = videoLinkElement.href.match(/space\.bilibili\.com\/(\d+)/);
                if (uidLink) {
                    return {
                        videoUpUid: uidLink[1],
                        videoUpName: videoLinkElement.querySelector("span")?.innerText || "",
                    };
                }
            }

            return {};
        },

        getTrendingItemElements() {
            return Array.from(document.querySelectorAll("div.trending-item"));
        },

        hideTrendingModule(settings) {
            if (!settings.hideTrending_Switch) return;
            document.querySelectorAll("div.trending").forEach((el) => {
                el.style.display = "none";
            });
        },

        shouldHandleCommentFiltering(currentUrl) {
            return /^https:\/\/www\.bilibili\.com\/video\//.test(currentUrl);
        },

        getCommentElements() {
            const primarySelectors = [
                "div.reply-item",
                "div.root-reply-container",
                "div.sub-reply-item",
                "bili-comment-renderer",
                "bili-comment-reply-renderer",
            ];
            const fallbackSelectors = [
                "div.reply-wrap",
                "bili-comment-thread-renderer",
            ];

            const primaryElements = querySelectorAllDeep(document, primarySelectors.join(","))
                .filter(isFilterableCommentElement);

            if (primaryElements.length > 0) {
                return primaryElements;
            }

            return querySelectorAllDeep(document, fallbackSelectors.join(","))
                .filter(isFilterableCommentElement);
        },

        readCommentInfo(commentElement) {
            const contentElement = getCommentContentElement(commentElement);
            return {
                text: readCommentText(commentElement),
                userId: readCommentUserId(commentElement),
                userName: readCommentUserName(commentElement),
                hasImage: hasCommentContentImage(commentElement, contentElement),
            };
        },

        observeCommentChanges(callback) {
            observeCommentShadowRoots(callback);
        },

        hideNonVideoElements() {
            if (window.location.href.startsWith("https://www.bilibili.com/")) {
                document
                    .querySelectorAll(
                        `div.floor-single-card,
                        div.feed-card:has(a[href^="//cm.bilibili.com/"]),
                        div.bili-feed-card:has(a[href^="//cm.bilibili.com/"]),
                        div.bili-feed-card:has(a[href^="https://live.bilibili.com/"])`
                    )
                    .forEach((el) => el.classList.add("hideAD"));
            }

            if (window.location.href.startsWith("https://search.bilibili.com/all")) {
                document
                    .querySelectorAll(
                        `div.bili-video-card:has(a[href^="https://www.bilibili.com/cheese/"]),
                        div.bili-video-card:has(a[href^="//cm.bilibili.com/"]),
                        div.bili-video-card:has(a[href^="//live.bilibili.com/"])`
                    )
                    .forEach((el) => el.parentNode.classList.add("hideAD"));
            }

            if (window.location.href.startsWith("https://www.bilibili.com/video/")) {
                document
                    .querySelectorAll(
                        `div#slide_ad,
                        .ad-report,
                        div.video-page-game-card-small,
                        div.video-page-special-card-small,
                        div.video-page-operator-card-small,
                        div.pop-live-small-mode,
                        div.activity-m-v1,
                        div.video-card-ad-small`
                    )
                    .forEach((el) => el.classList.add("hideAD"));
            }
        },
    };
}

function readCommentText(commentElement) {
    const contentElement = getCommentContentElement(commentElement);
    return combineCommentTexts(
        readCommentDataText(commentElement),
        readTextDeep(contentElement || commentElement)
    );
}

function getCommentContentElement(commentElement) {
    return querySelectorDeep(commentElement, commentContentSelectors.join(","));
}

function readCommentDataText(commentElement) {
    const parts = [];
    collectCommentDataText(commentElement, parts, new WeakSet());
    return parts.join(" ");
}

function collectCommentDataText(node, parts, visitedShadowRoots) {
    if (!node) {
        return;
    }

    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) {
        return;
    }

    const dataText = readCommentDataMessage(node.__data) || readCommentDataMessage(node.data);
    if (dataText) {
        parts.push(dataText);
    }

    if (node.nodeType === 1 && node.shadowRoot && !visitedShadowRoots.has(node.shadowRoot)) {
        visitedShadowRoots.add(node.shadowRoot);
        collectCommentDataText(node.shadowRoot, parts, visitedShadowRoots);
    }

    node.childNodes?.forEach((child) => collectCommentDataText(child, parts, visitedShadowRoots));
}

function readCommentDataMessage(data) {
    if (typeof data === "string") {
        return normalizeDomText(data);
    }

    if (!data || typeof data !== "object") {
        return "";
    }

    const candidates = [
        data.content?.message,
        data.reply?.content?.message,
        data.comment?.content?.message,
        data.item?.content?.message,
        data.root?.content?.message,
        data.message,
    ];

    return normalizeDomText(candidates.find((value) => typeof value === "string" && value.trim()) || "");
}

function combineCommentTexts(...texts) {
    const normalizedTexts = texts.map(normalizeDomText).filter(Boolean);
    const uniqueTexts = [];

    normalizedTexts.forEach((text) => {
        if (uniqueTexts.some((existingText) => existingText === text || existingText.includes(text))) {
            return;
        }

        const shorterTextIndex = uniqueTexts.findIndex((existingText) => text.includes(existingText));
        if (shorterTextIndex >= 0) {
            uniqueTexts.splice(shorterTextIndex, 1);
        }

        uniqueTexts.push(text);
    });

    return uniqueTexts.join(" ");
}

function readCommentUserId(commentElement) {
    const dataId = readCommentDataUserId(commentElement);
    if (dataId) {
        return dataId;
    }

    const directId = readElementValue(commentElement, ["mid", "uid", "userId"], ["mid", "uid", "user-id", "data-mid", "data-uid", "data-user-id"]);
    if (directId) {
        return directId;
    }

    const userElement = querySelectorDeep(commentElement, "[mid], [uid], [user-id], [data-mid], [data-uid], [data-user-id]");
    const userElementId = readElementValue(userElement, ["mid", "uid", "userId"], ["mid", "uid", "user-id", "data-mid", "data-uid", "data-user-id"]);
    if (userElementId) {
        return userElementId;
    }

    const userLink = querySelectorDeep(commentElement, "a[href*='space.bilibili.com/']");
    const href = userLink?.href || userLink?.getAttribute?.("href") || "";
    const match = href.match(/space\.bilibili\.com\/(\d+)/);
    return match?.[1] || "";
}

function readCommentUserName(commentElement) {
    const dataName = readCommentDataUserName(commentElement);
    if (dataName) {
        return dataName;
    }

    const directName = readElementValue(commentElement, ["userName", "uname"], ["user-name", "uname", "data-user-name", "data-uname"]);
    if (directName) {
        return directName;
    }

    const userElement = querySelectorDeep(commentElement, commentUserSelectors.join(","));
    if (!userElement) {
        return "";
    }

    return normalizeDomText(
        readElementValue(userElement, ["userName", "uname"], ["title", "aria-label", "user-name", "uname", "data-user-name", "data-uname"]) ||
        readTextDeep(userElement)
    );
}

function readCommentDataUserId(commentElement) {
    return readFirstCommentDataValue(commentElement, (data) => readCommentDataCandidate([
        data?.member?.mid,
        data?.member?.mid_str,
        data?.member?.uid,
        data?.user?.mid,
        data?.user?.mid_str,
        data?.user?.uid,
        data?.reply?.member?.mid,
        data?.reply?.member?.mid_str,
        data?.comment?.member?.mid,
        data?.comment?.member?.mid_str,
        data?.item?.member?.mid,
        data?.item?.member?.mid_str,
        data?.mid,
        data?.mid_str,
        data?.uid,
    ]));
}

function readCommentDataUserName(commentElement) {
    return readFirstCommentDataValue(commentElement, (data) => readCommentDataCandidate([
        data?.member?.uname,
        data?.member?.name,
        data?.user?.uname,
        data?.user?.name,
        data?.reply?.member?.uname,
        data?.reply?.member?.name,
        data?.comment?.member?.uname,
        data?.comment?.member?.name,
        data?.item?.member?.uname,
        data?.item?.member?.name,
        data?.userName,
        data?.uname,
        data?.name,
    ]));
}

function readFirstCommentDataValue(node, reader, visitedShadowRoots = new WeakSet()) {
    if (!node || (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11)) {
        return "";
    }

    const dataValue = reader(node.__data) || reader(node.data);
    if (dataValue) {
        return dataValue;
    }

    if (node.nodeType === 1 && node.shadowRoot && !visitedShadowRoots.has(node.shadowRoot)) {
        visitedShadowRoots.add(node.shadowRoot);
        const shadowValue = readFirstCommentDataValue(node.shadowRoot, reader, visitedShadowRoots);
        if (shadowValue) {
            return shadowValue;
        }
    }

    for (const child of node.childNodes || []) {
        const childValue = readFirstCommentDataValue(child, reader, visitedShadowRoots);
        if (childValue) {
            return childValue;
        }
    }

    return "";
}

function readCommentDataCandidate(candidates) {
    const value = candidates.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
    return normalizeDomText(value);
}

function hasCommentContentImage(commentElement, contentElement) {
    if (contentElement && hasCommentImageInRoot(contentElement, { allowSizeFallback: true })) {
        return true;
    }

    return hasCommentImageInRoot(commentElement, { allowSizeFallback: false });
}

function hasCommentImageInRoot(root, { allowSizeFallback }) {
    const imageElements = querySelectorAllDeep(
        root,
        "img, picture, source, a[href*='bfs/new_dyn'], [src*='bfs/new_dyn'], [data-src*='bfs/new_dyn'], [style*='bfs/new_dyn']"
    );

    return imageElements.some((imageElement) => isCommentBodyImageElement(imageElement, allowSizeFallback));
}

function isCommentBodyImageElement(imageElement, allowSizeFallback) {
    const imageUrl = extractImageUrl(imageElement).toLowerCase();
    if (isExcludedCommentImageUrl(imageUrl)) {
        return false;
    }

    if (imageUrl.includes("bfs/new_dyn")) {
        return true;
    }

    if (!allowSizeFallback || !imageUrl) {
        return false;
    }

    const { width, height } = getElementImageSize(imageElement);
    return width >= 72 && height >= 72;
}

function extractImageUrl(element) {
    const values = [
        element?.currentSrc,
        element?.src,
        element?.href,
        element?.getAttribute?.("src"),
        element?.getAttribute?.("data-src"),
        element?.getAttribute?.("data-original"),
        element?.getAttribute?.("data-url"),
        element?.getAttribute?.("href"),
        element?.getAttribute?.("style"),
        element?.style?.backgroundImage,
    ];

    return values.find(Boolean) || "";
}

function isExcludedCommentImageUrl(imageUrl) {
    return excludedCommentImageUrlParts.some((part) => imageUrl.includes(part));
}

function getElementImageSize(element) {
    const rect = element?.getBoundingClientRect?.();
    const width = Number(element?.naturalWidth || element?.width || element?.getAttribute?.("width") || rect?.width || 0);
    const height = Number(element?.naturalHeight || element?.height || element?.getAttribute?.("height") || rect?.height || 0);
    return { width, height };
}

function readElementValue(element, dataKeys, attributeNames) {
    if (!element) {
        return "";
    }

    for (const dataKey of dataKeys) {
        const value = element.dataset?.[dataKey];
        if (value) {
            return normalizeDomText(value);
        }
    }

    for (const attributeName of attributeNames) {
        const value = element.getAttribute?.(attributeName);
        if (value) {
            return normalizeDomText(value);
        }
    }

    return "";
}

function isFilterableCommentElement(element) {
    if (element.closest?.(".bbvt-comment-filter-placeholder")) {
        return false;
    }

    if (element.closest?.(".bbvt-comment-filter-overlay")) {
        return false;
    }

    return Boolean(readCommentText(element) || hasCommentContentImage(element, getCommentContentElement(element)));
}

function querySelectorDeep(root, selector) {
    return querySelectorAllDeep(root, selector)[0] || null;
}

function querySelectorAllDeep(root, selector) {
    const results = [];
    const visitedShadowRoots = new WeakSet();

    collectMatches(root, selector, results, visitedShadowRoots);
    return [...new Set(results)];
}

function observeCommentShadowRoots(callback) {
    if (typeof MutationObserver !== "function" || typeof callback !== "function") {
        return;
    }

    commentChangeCallback = callback;
    observeCommentDocumentChanges();
    attachCommentShadowRootObservers();
}

function attachCommentShadowRootObservers() {
    collectOpenShadowRoots(document).forEach((shadowRoot) => {
        if (commentShadowRootObservers.has(shadowRoot)) {
            return;
        }

        const observer = new MutationObserver((records) => {
            if (shouldIgnoreCommentMutationRecords(records)) {
                return;
            }

            scheduleCommentShadowRootDiscovery();
            scheduleCommentChange();
        });

        observer.observe(shadowRoot, {
            attributes: true,
            attributeFilter: commentObservedAttributeNames,
            characterData: true,
            childList: true,
            subtree: true,
        });
        commentShadowRootObservers.set(shadowRoot, observer);
    });
}

function observeCommentDocumentChanges() {
    if (commentDocumentObserver || typeof document === "undefined" || !document.body) {
        return;
    }

    commentDocumentObserver = new MutationObserver((records) => {
        if (shouldIgnoreCommentMutationRecords(records)) {
            return;
        }

        scheduleCommentShadowRootDiscovery();
        scheduleCommentChange();
    });

    commentDocumentObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function collectOpenShadowRoots(root) {
    const shadowRoots = [];
    collectShadowRoots(root, shadowRoots, new WeakSet());
    return shadowRoots;
}

function collectShadowRoots(root, shadowRoots, visitedShadowRoots) {
    if (!root?.querySelectorAll) {
        return;
    }

    if (root.shadowRoot && !visitedShadowRoots.has(root.shadowRoot)) {
        visitedShadowRoots.add(root.shadowRoot);
        shadowRoots.push(root.shadowRoot);
        collectShadowRoots(root.shadowRoot, shadowRoots, visitedShadowRoots);
    }

    root.querySelectorAll("*").forEach((element) => {
        if (!element.shadowRoot || visitedShadowRoots.has(element.shadowRoot)) {
            return;
        }

        visitedShadowRoots.add(element.shadowRoot);
        shadowRoots.push(element.shadowRoot);
        collectShadowRoots(element.shadowRoot, shadowRoots, visitedShadowRoots);
    });
}

function scheduleCommentChange() {
    if (!commentChangeCallback || commentChangeTimer) {
        return;
    }

    commentChangeTimer = setTimeout(() => {
        commentChangeTimer = null;
        commentChangeCallback?.();
    }, 200);
}

function scheduleCommentShadowRootDiscovery() {
    if (!commentChangeCallback || commentShadowRootDiscoveryTimer) {
        return;
    }

    commentShadowRootDiscoveryTimer = setTimeout(() => {
        commentShadowRootDiscoveryTimer = null;
        observeCommentShadowRoots(commentChangeCallback);
    }, 50);
}

function shouldIgnoreCommentMutationRecords(records) {
    return records.every((record) => {
        if (record.type === "attributes") {
            return isCommentFilterOwnedAttributeMutation(record);
        }

        if (record.type === "characterData") {
            return isCommentFilterOwnedNode(record.target?.parentElement);
        }

        if (record.type === "childList") {
            const nodes = [...record.addedNodes, ...record.removedNodes];
            if (nodes.length === 0) {
                return true;
            }

            return nodes.every(isCommentFilterOwnedNode);
        }

        return true;
    });
}

function isCommentFilterOwnedAttributeMutation(record) {
    if (String(record.attributeName || "").startsWith("data-bbvt")) {
        return true;
    }

    return isCommentFilterOwnedNode(record.target);
}

function isCommentFilterOwnedNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.classList?.contains("bbvt-comment-filter-placeholder")) {
        return true;
    }

    if (node.classList?.contains("bbvt-comment-filter-overlay")) {
        return true;
    }

    if (node.dataset?.bbvtCommentFilterPlaceholder !== undefined) {
        return true;
    }

    if (node.dataset?.bbvtCommentFilterOverlay !== undefined) {
        return true;
    }

    if (
        node.dataset?.bbvtCommentBlocked !== undefined ||
        node.dataset?.bbvtCommentBlockReason !== undefined ||
        node.dataset?.bbvtCommentFilterBypass !== undefined ||
        node.dataset?.bbvtCommentOriginalDisplay !== undefined ||
        node.dataset?.bbvtCommentOriginalVisibility !== undefined
    ) {
        return true;
    }

    return Boolean(node.closest?.(".bbvt-comment-filter-placeholder, .bbvt-comment-filter-overlay"));
}

function collectMatches(root, selector, results, visitedShadowRoots) {
    if (!root?.querySelectorAll) {
        return;
    }

    if (root.matches?.(selector)) {
        results.push(root);
    }

    if (root.shadowRoot && !visitedShadowRoots.has(root.shadowRoot)) {
        visitedShadowRoots.add(root.shadowRoot);
        collectMatches(root.shadowRoot, selector, results, visitedShadowRoots);
    }

    results.push(...root.querySelectorAll(selector));

    root.querySelectorAll("*").forEach((element) => {
        if (!element.shadowRoot || visitedShadowRoots.has(element.shadowRoot)) {
            return;
        }

        visitedShadowRoots.add(element.shadowRoot);
        collectMatches(element.shadowRoot, selector, results, visitedShadowRoots);
    });
}

function readTextDeep(node) {
    const parts = [];
    collectText(node, parts, new WeakSet());
    return parts.join(" ");
}

function collectText(node, parts, visitedShadowRoots) {
    if (!node) {
        return;
    }

    if (node.nodeType === 3) {
        parts.push(node.nodeValue || "");
        return;
    }

    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) {
        return;
    }

    if (node.nodeType === 1) {
        const tagName = node.tagName?.toLowerCase();
        if (["script", "style", "noscript", "svg", "img", "button"].includes(tagName)) {
            return;
        }

        if (node.classList?.contains("bbvt-comment-filter-placeholder")) {
            return;
        }

        if (node.classList?.contains("bbvt-comment-filter-overlay")) {
            return;
        }

        if (node.shadowRoot && !visitedShadowRoots.has(node.shadowRoot)) {
            visitedShadowRoots.add(node.shadowRoot);
            collectText(node.shadowRoot, parts, visitedShadowRoots);
        }
    }

    node.childNodes?.forEach((child) => collectText(child, parts, visitedShadowRoots));
}

function normalizeDomText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}


function av2bv(aid) {
    const XOR_CODE = 23442827791579n;
    const MAX_AID = 1n << 51n;
    const BASE = 58n;
    const data = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
    const bytes = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
    let bvIndex = bytes.length - 1;
    let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE;

    while (tmp > 0) {
        bytes[bvIndex] = data[Number(tmp % BigInt(BASE))];
        tmp = tmp / BigInt(BASE);
        bvIndex -= 1;
    }

    [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
    [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
    return bytes.join("");
}

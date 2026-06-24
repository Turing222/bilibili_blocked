const genericKeywordWords = new Set([
    "官方",
    "合集",
    "完整版",
    "高清",
    "最新",
    "挑战",
    "视频",
    "直播",
    "录播",
    "剪辑",
    "解说",
    "实况",
    "中字",
    "字幕",
    "搬运",
    "投稿",
    "原创",
    "预告",
    "花絮",
]);

export function getKeywordCandidates(text) {
    const source = String(text || "").trim();
    if (!source) {
        return [];
    }

    const candidates = [];
    const pushCandidate = (value) => {
        const candidate = normalizeKeywordCandidate(value);
        if (!candidate || candidates.includes(candidate)) {
            return;
        }
        candidates.push(candidate);
    };

    collectBracketedParts(source).forEach(pushCandidate);
    segmentWords(source).forEach(pushCandidate);
    splitByPunctuation(source).forEach(pushCandidate);

    return candidates.slice(0, 8);
}

function collectBracketedParts(text) {
    const parts = [];
    const patterns = [
        /《([^《》]{2,24})》/g,
        /【([^【】]{2,24})】/g,
        /「([^「」]{2,24})」/g,
        /『([^『』]{2,24})』/g,
        /[（(]([^（）()]{2,24})[）)]/g,
        /\[([^\]]{2,24})\]/g,
    ];

    patterns.forEach((pattern) => {
        for (const match of text.matchAll(pattern)) {
            parts.push(match[1]);
        }
    });

    return parts;
}

function segmentWords(text) {
    if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
        return [];
    }

    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    return Array.from(segmenter.segment(text))
        .filter((item) => item.isWordLike)
        .map((item) => item.segment);
}

function splitByPunctuation(text) {
    return text
        .replace(/[《》【】「」『』（）(){}]/g, " ")
        .replace(/\[/g, " ")
        .replace(/\]/g, " ")
        .split(/[|｜/\\,，.。!！?？:：;；、\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeKeywordCandidate(value) {
    const candidate = String(value || "")
        .replace(/^#|#$/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (
        candidate.length < 2 ||
        candidate.length > 24 ||
        genericKeywordWords.has(candidate) ||
        /^\d+$/.test(candidate) ||
        /^BV[a-z0-9]+$/i.test(candidate) ||
        !/[A-Za-z0-9\u4e00-\u9fff]/.test(candidate)
    ) {
        return "";
    }

    return candidate;
}

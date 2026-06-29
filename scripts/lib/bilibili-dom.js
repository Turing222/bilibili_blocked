export const COMMENT_SELECTOR = [
  "div.reply-item",
  "div.root-reply-container",
  "div.sub-reply-item",
  "bili-comment-renderer",
  "bili-comment-reply-renderer",
  "div.reply-wrap",
  "bili-comment-thread-renderer",
].join(",");

export function installBilibiliDomHelpers() {
  if (window.__bbvtDom?.installed) {
    return;
  }

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

  function queryAllDeep(root, selector, visited = new WeakSet()) {
    const results = [];
    if (!root?.querySelectorAll) {
      return results;
    }

    if (root.matches?.(selector)) {
      results.push(root);
    }

    if (root.shadowRoot && !visited.has(root.shadowRoot)) {
      visited.add(root.shadowRoot);
      results.push(...queryAllDeep(root.shadowRoot, selector, visited));
    }

    results.push(...root.querySelectorAll(selector));
    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot && !visited.has(element.shadowRoot)) {
        visited.add(element.shadowRoot);
        results.push(...queryAllDeep(element.shadowRoot, selector, visited));
      }
    });
    return [...new Set(results)];
  }

  function readDataMessage(node, visited = new WeakSet()) {
    if (!node || (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11)) {
      return "";
    }
    const data = node.__data ?? node.data;
    const message = data?.content?.message ?? data?.reply?.content?.message ?? data?.message;
    if (message) {
      return clean(message);
    }
    if (node.nodeType === 1 && node.shadowRoot && !visited.has(node.shadowRoot)) {
      visited.add(node.shadowRoot);
      const shadowMessage = readDataMessage(node.shadowRoot, visited);
      if (shadowMessage) {
        return shadowMessage;
      }
    }
    for (const child of node.childNodes || []) {
      const childMessage = readDataMessage(child, visited);
      if (childMessage) {
        return childMessage;
      }
    }
    return "";
  }

  function readTextDeep(node, visited = new WeakSet()) {
    if (!node) {
      return "";
    }
    if (node.nodeType === 3) {
      return node.nodeValue || "";
    }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) {
      return "";
    }
    const parts = [];
    if (node.nodeType === 1 && node.shadowRoot && !visited.has(node.shadowRoot)) {
      visited.add(node.shadowRoot);
      parts.push(readTextDeep(node.shadowRoot, visited));
    }
    for (const child of node.childNodes || []) {
      parts.push(readTextDeep(child, visited));
    }
    return clean(parts.join(" "));
  }

  function getCommentText(element) {
    return clean(readDataMessage(element) || readTextDeep(element));
  }

  function getCommentId(element, index) {
    const data = element.__data ?? element.data;
    return String(
      data?.rpid_str ??
        data?.rpid ??
        data?.id ??
        element.getAttribute?.("data-rpid") ??
        element.getAttribute?.("rpid") ??
        `index:${index}`
    );
  }

  function findPlaceholder(targetKeyword) {
    const placeholders = queryAllDeep(document, ".bbvt-comment-filter-overlay");
    return (
      (targetKeyword
        ? placeholders.find((item) => item.textContent.includes(targetKeyword))
        : null) ||
      placeholders[0] ||
      null
    );
  }

  window.__bbvtDom = {
    installed: true,
    clean,
    queryAllDeep,
    readDataMessage,
    readTextDeep,
    getCommentText,
    getCommentId,
    findPlaceholder,
    commentSelector: [
      "div.reply-item",
      "div.root-reply-container",
      "div.sub-reply-item",
      "bili-comment-renderer",
      "bili-comment-reply-renderer",
      "div.reply-wrap",
      "bili-comment-thread-renderer",
    ].join(","),
  };
}

export function collectCommentTimingState(targetKeyword) {
  if (!window.__bbvtDom?.installed) {
    throw new Error("Bilibili DOM helpers are not installed. Call installBilibiliDomHelpers first.");
  }
  const dom = window.__bbvtDom;
  const {
    clean,
    queryAllDeep,
    getCommentText,
    getCommentId,
    findPlaceholder,
    commentSelector,
  } = dom;

  function getPlaceholderNearComment(element) {
    if (element.previousElementSibling?.classList?.contains("bbvt-comment-filter-overlay")) {
      return element.previousElementSibling;
    }
    const parent = element.parentNode;
    if (!parent?.querySelectorAll) {
      return null;
    }
    const placeholders = [...parent.querySelectorAll(".bbvt-comment-filter-overlay")];
    return (
      placeholders.find((placeholder) => placeholder.textContent.includes(targetKeyword)) ||
      placeholders[0] ||
      null
    );
  }

  const comments = queryAllDeep(document, commentSelector)
    .map((element, index) => ({
      element,
      id: getCommentId(element, index),
      text: getCommentText(element),
    }))
    .filter((item) => item.text);

  const placeholders = queryAllDeep(document, ".bbvt-comment-filter-overlay");
  const matchingPlaceholder = findPlaceholder(targetKeyword);
  let target = null;

  if (matchingPlaceholder?.nextElementSibling) {
    const placeholderTargetElement = matchingPlaceholder.nextElementSibling;
    target = comments.find((item) => item.element === placeholderTargetElement) || {
      element: placeholderTargetElement,
      id: getCommentId(placeholderTargetElement, -1),
      text: getCommentText(placeholderTargetElement),
    };
  }

  if (!target && targetKeyword) {
    target =
      comments.find(
        (item) =>
          item.element.dataset.bbvtCommentBlocked === "true" && item.text.includes(targetKeyword)
      ) ||
      comments.find((item) => item.text.includes(targetKeyword)) ||
      null;
  }

  if (!target) {
    target = comments[0] || null;
  }

  const targetElement = target?.element ?? null;
  const placeholder = matchingPlaceholder || (targetElement ? getPlaceholderNearComment(targetElement) : null);
  const floatingButton = document.querySelector("#bbvtFloatingEntry .bbvt-fe-main");

  return {
    url: location.href,
    title: document.title,
    keyword: targetKeyword || null,
    commentCount: comments.length,
    placeholderCount: placeholders.length,
    overlayCount: placeholders.length,
    floatingEntryFound: Boolean(document.querySelector("#bbvtFloatingEntry")),
    floatingButtonText: clean(floatingButton?.textContent),
    storage: window.__bbvtTimingStorage?.GM_blockedParameter ?? null,
    firstComment: comments[0]
      ? {
          id: comments[0].id,
          text: comments[0].text.slice(0, 300),
        }
      : null,
    target: target
      ? {
          id: target.id,
          text: target.text.slice(0, 300),
          display: targetElement.style.display || "",
          computedDisplay: getComputedStyle(targetElement).display,
          visibility: targetElement.style.visibility || "",
          computedVisibility: getComputedStyle(targetElement).visibility,
          blocked: targetElement.dataset.bbvtCommentBlocked === "true",
          blockMode: targetElement.dataset.bbvtCommentBlockMode || "",
          reason: targetElement.dataset.bbvtCommentBlockReason || "",
          originalDisplayStored: Object.prototype.hasOwnProperty.call(
            targetElement.dataset,
            "bbvtCommentOriginalDisplay"
          ),
          placeholderFound: Boolean(placeholder),
          placeholderText: clean(placeholder?.textContent),
        }
      : null,
  };
}

export async function moveAcrossPlaceholderInBrowser(targetKeyword) {
  if (!window.__bbvtDom?.installed) {
    throw new Error("Bilibili DOM helpers are not installed. Call installBilibiliDomHelpers first.");
  }
  const dom = window.__bbvtDom;
  const { findPlaceholder } = dom;

  function readState(placeholder) {
    const target = placeholder?.nextElementSibling ?? null;
    const veil = placeholder?.querySelector?.(".bbvt-comment-filter-overlay-veil") ?? null;
    return {
      found: Boolean(placeholder),
      targetVisibility: target ? getComputedStyle(target).visibility : "",
      overlayOpacity: placeholder ? getComputedStyle(placeholder).opacity : "",
      veilOpacity: veil ? getComputedStyle(veil).opacity : "",
      overlayPeeking: placeholder?.dataset.bbvtCommentFilterPeeking === "true",
      commentPeeking: target?.dataset.bbvtCommentFilterPeeking === "true",
      detailsToggleFound: Boolean(placeholder?.querySelector?.(".bbvt-comment-filter-details-toggle")),
      detailsPanelFound: Boolean(placeholder?.querySelector?.(".bbvt-comment-filter-details-panel")),
      removeButtonFound: Boolean(placeholder?.querySelector?.(".bbvt-comment-filter-reason-remove")),
    };
  }

  let placeholder = findPlaceholder(targetKeyword);
  const moveEvent = () =>
    new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      view: window,
    });

  placeholder?.dispatchEvent(moveEvent());
  let afterBody = readState(placeholder);
  const deadline = Date.now() + 1500;
  while (
    Date.now() < deadline &&
    (afterBody.targetVisibility === "hidden" ||
      afterBody.veilOpacity === "1" ||
      !afterBody.detailsToggleFound)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    placeholder = findPlaceholder(targetKeyword) || placeholder;
    afterBody = readState(placeholder);
  }

  return { afterBody };
}

export function leavePlaceholderInBrowser(targetKeyword) {
  if (!window.__bbvtDom?.installed) {
    throw new Error("Bilibili DOM helpers are not installed. Call installBilibiliDomHelpers first.");
  }
  const dom = window.__bbvtDom;
  const placeholder = dom.findPlaceholder(targetKeyword);
  placeholder?.dispatchEvent(
    new MouseEvent("mouseleave", {
      bubbles: false,
      cancelable: true,
      view: window,
    })
  );
  const target = placeholder?.nextElementSibling ?? null;
  return {
    found: Boolean(placeholder),
    targetVisibility: target ? getComputedStyle(target).visibility : "",
    overlayPeeking: placeholder?.dataset.bbvtCommentFilterPeeking === "true",
    commentPeeking: target?.dataset.bbvtCommentFilterPeeking === "true",
  };
}

export function clickReasonRemoveInBrowser(targetKeyword) {
  if (!window.__bbvtDom?.installed) {
    throw new Error("Bilibili DOM helpers are not installed. Call installBilibiliDomHelpers first.");
  }
  const dom = window.__bbvtDom;
  const placeholder = dom.findPlaceholder(targetKeyword);
  const target = placeholder?.nextElementSibling ?? null;
  const moveEvent = () =>
    new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
  const toggle = placeholder?.querySelector?.(".bbvt-comment-filter-details-toggle") || null;
  toggle?.dispatchEvent(moveEvent());
  const afterToggleMove = {
    targetVisibility: target ? getComputedStyle(target).visibility : "",
    overlayPeeking: placeholder?.dataset.bbvtCommentFilterPeeking === "true",
    commentPeeking: target?.dataset.bbvtCommentFilterPeeking === "true",
  };
  toggle?.click();
  const panel = placeholder?.querySelector?.(".bbvt-comment-filter-details-panel") || null;
  const button = panel?.querySelector?.(".bbvt-comment-filter-reason-remove") || null;
  button?.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      view: window,
    })
  );
  const afterControlMove = {
    targetVisibility: target ? getComputedStyle(target).visibility : "",
    overlayPeeking: placeholder?.dataset.bbvtCommentFilterPeeking === "true",
    commentPeeking: target?.dataset.bbvtCommentFilterPeeking === "true",
  };
  button?.click();
  return {
    found: Boolean(placeholder),
    toggleFound: Boolean(toggle),
    panelFound: Boolean(panel),
    buttonFound: Boolean(button),
    afterToggleMove,
    afterControlMove,
  };
}

export async function checkCommentQuickBlockMarkerInBrowser(targetKeyword) {
  if (!window.__bbvtDom?.installed) {
    throw new Error("Bilibili DOM helpers are not installed. Call installBilibiliDomHelpers first.");
  }
  const dom = window.__bbvtDom;
  const { queryAllDeep, readDataMessage, readTextDeep } = dom;

  const commentSelector = [
    "div.reply-item",
    "div.root-reply-container",
    "div.sub-reply-item",
    "bili-comment-renderer",
    "bili-comment-reply-renderer",
  ].join(",");

  const comments = queryAllDeep(document, commentSelector)
    .map((element) => ({
      element,
      text: readDataMessage(element) || readTextDeep(element),
    }))
    .filter((item) => item.text && item.element.dataset.bbvtCommentBlocked !== "true");

  const target =
    comments.find((item) => item.text.includes(targetKeyword)) || comments[0] || null;
  if (!target) {
    return { targetFound: false };
  }

  function readAnchorState() {
    const trigger = document.getElementById("bbvtCommentQuickBlockTrigger");
    const marker = document.getElementById("bbvtCommentQuickBlockTargetMarker");
    const targetRect = target.element.getBoundingClientRect?.();
    const triggerRect = trigger?.getBoundingClientRect?.();
    const markerRect = marker?.getBoundingClientRect?.();
    return {
      triggerFound: Boolean(trigger && !trigger.hidden),
      markerFound: Boolean(marker),
      markerWidth: markerRect?.width ?? 0,
      markerHeight: markerRect?.height ?? 0,
      targetMarked: target.element.dataset.bbvtCommentQuickBlockTarget === "true",
      markerOffsetTop: markerRect && targetRect ? Math.round(markerRect.top - targetRect.top) : null,
      markerOffsetLeft:
        markerRect && targetRect ? Math.round(markerRect.left - targetRect.left) : null,
      triggerOffsetTop:
        triggerRect && targetRect ? Math.round(triggerRect.top - targetRect.top) : null,
      triggerOffsetRight:
        triggerRect && targetRect ? Math.round(targetRect.right - triggerRect.right) : null,
    };
  }

  function offsetsStable(before, after) {
    const keys = ["markerOffsetTop", "markerOffsetLeft", "triggerOffsetTop", "triggerOffsetRight"];
    return keys.every(
      (key) =>
        Number.isFinite(before?.[key]) &&
        Number.isFinite(after?.[key]) &&
        Math.abs(before[key] - after[key]) <= 2
    );
  }

  target.element.dispatchEvent(
    new MouseEvent("mouseenter", {
      bubbles: false,
      cancelable: true,
      view: window,
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 120));

  const beforeScroll = readAnchorState();
  const startScrollY = window.scrollY;
  const targetRectBeforeScroll = target.element.getBoundingClientRect?.();
  const safeDownDelta = Math.min(40, Math.max(0, Math.floor((targetRectBeforeScroll?.bottom ?? 0) - 12)));
  const safeUpDelta = Math.min(
    40,
    Math.max(0, Math.floor((window.innerHeight || 800) - (targetRectBeforeScroll?.top ?? 0) - 12)),
    Math.max(0, Math.floor(startScrollY))
  );
  const scrollDelta = safeDownDelta >= 12 ? safeDownDelta : -safeUpDelta;
  if (Math.abs(scrollDelta) > 0) {
    window.scrollBy(0, scrollDelta);
  }
  await new Promise((resolve) => setTimeout(resolve, 160));
  const afterScroll = readAnchorState();
  window.scrollTo(window.scrollX, startScrollY);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const afterEnter = {
    ...readAnchorState(),
    beforeScroll,
    afterScroll,
    scrollDelta,
    anchorStableAfterScroll: offsetsStable(beforeScroll, afterScroll),
    targetText: target.text.slice(0, 160),
  };

  target.element.dispatchEvent(
    new MouseEvent("mouseleave", {
      bubbles: false,
      cancelable: true,
      view: window,
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 260));

  return {
    targetFound: true,
    afterEnter,
    afterLeave: {
      markerFound: Boolean(document.getElementById("bbvtCommentQuickBlockTargetMarker")),
      triggerHidden: document.getElementById("bbvtCommentQuickBlockTrigger")?.hidden ?? true,
      targetMarked: target.element.dataset.bbvtCommentQuickBlockTarget === "true",
    },
  };
}

export function createGmRuntimeStub({
  storageKey = "__bbvtTimingStorage",
  writeLogKey = "__bbvtTimingGmWrites",
  injectedAtKey = "__bbvtTimingInjectedAt",
} = {}) {
  return { storageKey, writeLogKey, injectedAtKey };
}

export function injectUserscriptInBrowser({
  source,
  initialSettings,
  storageKey = "__bbvtTimingStorage",
  writeLogKey = "__bbvtTimingGmWrites",
  injectedAtKey = "__bbvtTimingInjectedAt",
  sourceUrl = "bbvt-timing.user.js",
  dispatchLoad = true,
}) {
  window[storageKey] = {
    GM_blockedParameter: JSON.parse(JSON.stringify(initialSettings)),
  };
  window[writeLogKey] = [];
  window.GM_getValue = (key, defaultValue) => {
    if (Object.prototype.hasOwnProperty.call(window[storageKey], key)) {
      return window[storageKey][key];
    }
    return defaultValue;
  };
  window.GM_setValue = (key, value) => {
    window[storageKey][key] = JSON.parse(JSON.stringify(value));
    window[writeLogKey].push({ key, value, ts: Date.now() });
  };
  window.GM_addStyle = (css) => {
    const style = document.createElement("style");
    style.dataset.bbvtTimingStyle = "true";
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  };
  window.GM_registerMenuCommand = () => {};
  window[injectedAtKey] = Date.now();
  (0, eval)(`${source}\n//# sourceURL=${sourceUrl}`);
  if (dispatchLoad) {
    window.dispatchEvent(new Event("load"));
  }
}

const DEFAULTS = {
  'ss:on': false,
  'ss:steps': [],
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULTS), (stored) => {
    const patch = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (stored[key] === undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) chrome.storage.local.set(patch);
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULTS), (stored) => {
    const patch = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (stored[key] === undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) chrome.storage.local.set(patch);
  });
});
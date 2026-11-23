import { setData } from "../decoders/companies.js";
import { clearTab, getChanges, getTabSummary, start } from "./recorder.js";

async function loadData() {
  const get = path => fetch(browser.runtime.getURL(path)).then(r => r.json());
  const [trackers, cnames] = await Promise.all([
    get("vendor/privacybadger/known_trackers.json"),
    get("vendor/privacybadger/cname_domains.json"),
  ]);
  setData({ trackers, cnames });
}

// Register listeners first so no early requests are missed; data fills in a moment later.
start();
loadData();

browser.runtime.onMessage.addListener(async (msg, sender) => {
  // Only our own extension pages may read recorded data.
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL(""))) {
    return undefined;
  }
  switch (msg.type) {
  case "listTabs": {
    const open = await browser.tabs.query({});
    return open
      .filter(t => /^https?:/.test(t.url || ""))
      .map(t => ({ tabId: t.id, title: t.title, url: t.url, ...getTabSummary(t.id) }));
  }
  case "getChanges":
    return getChanges(msg.tabId, msg.sinceVersion);
  case "clearTab":
    clearTab(msg.tabId);
    return true;
  }
  return undefined;
});

// Toolbar button opens the inspector for the current tab (the popup comes later).
browser.browserAction.onClicked.addListener((tab) => {
  browser.tabs.create({ url: browser.runtime.getURL(`inspector/inspector.html?tab=${tab.id}`) });
});

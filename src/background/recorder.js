// Recorder: observes (never blocks) every third-party request and keeps it per tab, in memory.

import { getBaseDomain, identify, isThirdPartyRequest, uncloak } from "../decoders/companies.js";

const MAX_REQUESTS_PER_TAB = 5000;
const MAX_BODY_CHARS = 100000;
const URL_FILTER = { urls: ["http://*/*", "https://*/*"] };

// tabId -> { site, generation, requests: [] }
const tabs = new Map();
// requestId -> latest record, while the request is in flight
const inFlight = new Map();
// Bumped on every change, so the inspector can fetch only what changed.
let version = 0;
let generation = 0;
let nextId = 0;

function touch(record) {
  record.version = ++version;
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname : null;
  } catch {
    return null;
  }
}

function getTab(tabId, site) {
  let tab = tabs.get(tabId);
  if (!tab || tab.site !== site) {
    tab = { site, generation: ++generation, requests: [] };
    tabs.set(tabId, tab);
  }
  return tab;
}

function readBody(requestBody) {
  if (!requestBody) {
    return null;
  }
  if (requestBody.error) {
    return { kind: "error", value: requestBody.error };
  }
  if (requestBody.formData) {
    return { kind: "form", value: Object.entries(requestBody.formData) };
  }
  if (requestBody.raw) {
    const parts = requestBody.raw.filter(p => p.bytes).map(p => new Uint8Array(p.bytes));
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return {
        kind: "text",
        value: text.slice(0, MAX_BODY_CHARS),
        truncated: text.length > MAX_BODY_CHARS,
      };
    } catch {
      return { kind: "binary", value: `${bytes.length} bytes` };
    }
  }
  return null;
}

function parseCookieHeader(header) {
  return header.split(/;\s*/).filter(Boolean).map((pair) => {
    const i = pair.indexOf("=");
    return i < 0 ? [pair, ""] : [pair.slice(0, i), pair.slice(i + 1)];
  });
}

function onBeforeRequest(details) {
  if (details.tabId < 0) {
    return; // not from a tab (e.g. a service worker or the browser itself)
  }

  const host = hostOf(details.url);
  if (!host) {
    return;
  }

  if (details.type === "main_frame") {
    getTab(details.tabId, getBaseDomain(host));
    return;
  }

  // Top-level page: last frame ancestor for iframes, otherwise the document itself.
  const topUrl = details.frameAncestors?.length ?
    details.frameAncestors[details.frameAncestors.length - 1].url :
    details.documentUrl;
  const siteHost = hostOf(topUrl);
  if (!siteHost) {
    return;
  }

  let trackerHost = host;
  if (!isThirdPartyRequest(host, siteHost)) {
    // Looks first-party; record it only if it is a disguised tracker.
    trackerHost = uncloak(host);
    if (!trackerHost) {
      return;
    }
  }

  let params = [];
  try {
    params = [...new URL(details.url).searchParams];
  } catch { /* keep empty */ }

  const record = {
    id: ++nextId,
    requestId: details.requestId,
    time: details.timeStamp,
    method: details.method,
    type: details.type,
    url: details.url,
    host,
    trackerHost,
    cloaked: trackerHost !== host,
    company: identify(trackerHost),
    topUrl,
    frameUrl: details.documentUrl,
    params,
    body: readBody(details.requestBody),
    cookies: [],
    status: null,
  };
  touch(record);

  const tab = getTab(details.tabId, getBaseDomain(siteHost));
  tab.requests.push(record);
  if (tab.requests.length > MAX_REQUESTS_PER_TAB) {
    tab.requests.shift();
  }
  // Redirects reuse the requestId; the newest hop becomes the in-flight record.
  inFlight.set(details.requestId, record);
}

function onSendHeaders(details) {
  const record = inFlight.get(details.requestId);
  if (!record) {
    return;
  }
  const cookie = details.requestHeaders.find(h => h.name.toLowerCase() === "cookie");
  if (cookie) {
    record.cookies = parseCookieHeader(cookie.value);
    touch(record);
  }
}

function onBeforeRedirect(details) {
  const record = inFlight.get(details.requestId);
  if (record) {
    record.status = `${details.statusCode} → ${details.redirectUrl}`;
    touch(record);
  }
}

function onDone(details) {
  const record = inFlight.get(details.requestId);
  if (record) {
    record.status = details.error || String(details.statusCode);
    touch(record);
    inFlight.delete(details.requestId);
  }
}

export function start() {
  browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, URL_FILTER, ["requestBody"]);
  browser.webRequest.onSendHeaders.addListener(onSendHeaders, URL_FILTER, ["requestHeaders"]);
  browser.webRequest.onBeforeRedirect.addListener(onBeforeRedirect, URL_FILTER);
  browser.webRequest.onCompleted.addListener(onDone, URL_FILTER);
  browser.webRequest.onErrorOccurred.addListener(onDone, URL_FILTER);
  browser.tabs.onRemoved.addListener(tabId => tabs.delete(tabId));
}

export function getTabSummary(tabId) {
  const tab = tabs.get(tabId);
  return tab ? { site: tab.site, count: tab.requests.length } : null;
}

// Records changed since `sinceVersion`. A new `generation` means the tab moved to a new site.
export function getChanges(tabId, sinceVersion) {
  const tab = tabs.get(tabId);
  if (!tab) {
    return { generation: 0, version, records: [] };
  }
  return {
    generation: tab.generation,
    version,
    records: tab.requests.filter(r => r.version > sinceVersion),
  };
}

export function clearTab(tabId) {
  const tab = tabs.get(tabId);
  if (tab) {
    tab.requests = [];
    tab.generation = ++generation;
  }
}

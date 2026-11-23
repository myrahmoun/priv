// Identifies which company a request goes to. No browser APIs; data is passed in via setData().

import { getBaseDomain, isThirdParty } from "../vendor/privacybadger/basedomain.js";
import mdfp from "../vendor/privacybadger/multiDomainFirstParties.js";

// Companies we decode. Matched against the request's base domain.
// `pattern` catches country variants such as google.fr or pinterest.co.uk.
const COMPANIES = [
  { name: "Meta", domains: ["facebook.com", "facebook.net", "fbcdn.net", "instagram.com"] },
  {
    name: "Google",
    domains: ["google-analytics.com", "googletagmanager.com", "doubleclick.net",
      "googleadservices.com", "googlesyndication.com", "gstatic.com"],
    pattern: /^google\.[a-z.]+$/,
  },
  { name: "TikTok", domains: ["tiktok.com", "tiktokw.us", "tiktokv.com", "ttwstatic.com", "byteoversea.com"] },
  { name: "Pinterest", domains: ["pinimg.com"], pattern: /^pinterest\.[a-z.]+$/ },
];

const domainToCompany = new Map();
for (const c of COMPANIES) {
  for (const d of c.domains) {
    domainToCompany.set(d, c.name);
  }
}

let knownTrackers = new Set();
let cnameDomains = {};

// trackers: list of known tracker domains; cnames: { disguisedHost: realTrackerHost }
export function setData({ trackers, cnames }) {
  knownTrackers = new Set(trackers);
  cnameDomains = cnames;
}

// Returns the real tracker host if `host` is a disguised (CNAME-cloaked) subdomain.
export function uncloak(host) {
  return Object.hasOwn(cnameDomains, host) ? cnameDomains[host] : null;
}

export function isThirdPartyRequest(requestHost, siteHost) {
  return isThirdParty(requestHost, siteHost) &&
    !mdfp.isMultiDomainFirstParty(getBaseDomain(requestHost), getBaseDomain(siteHost));
}

function isKnownTracker(host) {
  // Seed entries can be full hostnames or base domains; check host and each parent.
  for (let h = host; h.includes("."); h = h.slice(h.indexOf(".") + 1)) {
    if (knownTrackers.has(h)) {
      return true;
    }
  }
  return false;
}

// Returns "Meta" | "Google" | "TikTok" | "Pinterest" | "Known tracker" | "Other".
export function identify(host) {
  const base = getBaseDomain(host);
  const named = domainToCompany.get(base) ||
    COMPANIES.find(c => c.pattern && c.pattern.test(base))?.name;
  if (named) {
    return named;
  }
  return isKnownTracker(host) ? "Known tracker" : "Other";
}

export { getBaseDomain };

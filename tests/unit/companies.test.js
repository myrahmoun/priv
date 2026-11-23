import { test } from "node:test";
import assert from "node:assert/strict";
import { identify, isThirdPartyRequest } from "../../src/decoders/companies.js";

test("identifies the four companies by domain", () => {
  assert.equal(identify("www.facebook.com"), "Meta");
  assert.equal(identify("connect.facebook.net"), "Meta");
  assert.equal(identify("region1.google-analytics.com"), "Google");
  assert.equal(identify("www.google.fr"), "Google");
  assert.equal(identify("www.google.co.uk"), "Google");
  assert.equal(identify("analytics.tiktok.com"), "TikTok");
  assert.equal(identify("ct.pinterest.com"), "Pinterest");
  assert.equal(identify("s.pinimg.com"), "Pinterest");
});

test("does not match lookalike domains", () => {
  assert.equal(identify("notfacebook.com"), "Other");
  assert.equal(identify("google.example.com"), "Other");
  assert.equal(identify("cdn.shopify.com"), "Other");
});

test("third-party check", () => {
  assert.equal(isThirdPartyRequest("www.facebook.com", "shop.example"), true);
  assert.equal(isThirdPartyRequest("cdn.shop.example", "www.shop.example"), false);
  assert.equal(isThirdPartyRequest("shop.co.uk", "other.co.uk"), true);
  // Same owner (Privacy Badger's multi-domain first parties) is not third party.
  assert.equal(isThirdPartyRequest("www.youtube.com", "www.google.com"), false);
});

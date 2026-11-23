// End-to-end: real Firefox + the extension + a fake store served locally.
// Firefox resolves the test hostnames (including www.facebook.com) to this machine,
// so nothing reaches the real internet.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webExt from "web-ext";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import webExtConfig from "../../web-ext-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXT_ID = "tracker-lens@example.org";
const EXT_UUID = "11111111-2222-3333-4444-555555555555";
const HOSTS = ["shop.test", "other.test", "tracker.test", "www.facebook.com"];
const GIF = Buffer.from("R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAIBAAA=", "base64");

let server, port, driver, artifactsDir;

const STORE_PAGE = () => `<!doctype html><title>loading</title>
<img src="/logo.gif">
<img id="setter" src="http://tracker.test:${port}/set-cookie">
<script>
  document.getElementById("setter").onload = () => {
    const pixel = (url) => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = url; });
    navigator.sendBeacon("http://tracker.test:${port}/beacon",
      JSON.stringify({ event: "add_to_cart", item: "Pink Tee" }));
    Promise.all([
      pixel("http://www.facebook.com:${port}/tr?id=123&ev=AddToCart&cd[content_name]=Pink%20Tee"),
      pixel("http://tracker.test:${port}/pixel"),
    ]).then(() => { document.title = "done"; });
  };
</script>`;

function startServer() {
  server = http.createServer((req, res) => {
    if (req.url === "/product") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(STORE_PAGE());
    }
    const headers = { "Content-Type": "image/gif", "Cache-Control": "no-store" };
    if (req.url === "/set-cookie") {
      headers["Set-Cookie"] = "uid=abc12345xyz; Path=/";
    }
    res.writeHead(200, headers);
    res.end(GIF);
  });
  return new Promise(r => server.listen(0, () => {
    port = server.address().port;
    r();
  }));
}

async function buildExtension() {
  artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-lens-"));
  const { extensionPath } = await webExt.cmd.build(
    { sourceDir: path.join(ROOT, webExtConfig.sourceDir), artifactsDir, overwriteDest: true },
    { shouldExitProgram: false });
  return extensionPath;
}

// Asks the background script (from the inspector) for everything recorded on the tab showing `host`.
async function getRecords(host) {
  return driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    (async () => {
      const tabs = await browser.runtime.sendMessage({ type: "listTabs" });
      const tab = tabs.find(t => new URL(t.url).hostname === ${JSON.stringify(host)});
      if (!tab) return done([]);
      const res = await browser.runtime.sendMessage({ type: "getChanges", tabId: tab.tabId, sinceVersion: 0 });
      done(res.records);
    })().catch(e => done({ error: String(e) }));
  `);
}

// WebDriver can't navigate to moz-extension:// pages, so open the tab from Firefox's own (chrome) context.
async function openExtensionPage(pagePath) {
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(`
    gBrowser.selectedTab = gBrowser.addTab(arguments[0], {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });`, `moz-extension://${EXT_UUID}/${pagePath}`);
  await driver.setContext(firefox.Context.CONTENT);
  const handles = await driver.getAllWindowHandles();
  await driver.switchTo().window(handles[handles.length - 1]);
}

async function waitFor(fn, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) {
      return value;
    }
    if (Date.now() > end) {
      throw new Error("timed out");
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

before(async () => {
  await startServer();
  const options = new firefox.Options()
    .addArguments("-headless")
    .setPreference("network.dns.localDomains", HOSTS.join(","))
    .setPreference("network.trr.mode", 5) // no DNS-over-HTTPS, so localDomains applies
    .setPreference("network.stricttransportsecurity.preloadlist", false) // allow http://www.facebook.com
    .setPreference("dom.security.https_first", false)
    .setPreference("dom.security.https_first_schemeless", false)
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [EXT_ID]: EXT_UUID }));
  // --allow-system-access lets openExtensionPage() use Firefox's chrome context.
  const service = new firefox.ServiceBuilder().addArguments("--allow-system-access");
  driver = await new Builder().forBrowser("firefox")
    .setFirefoxOptions(options).setFirefoxService(service).build();
  await driver.installAddon(await buildExtension(), true);
});

after(async () => {
  await driver?.quit();
  server?.close();
  if (artifactsDir) {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
});

test("records third-party requests with params, body and cookies", async () => {
  const storeTab = await driver.getWindowHandle();
  await driver.get(`http://shop.test:${port}/product`);
  await waitFor(async () => (await driver.getTitle()) === "done");

  await openExtensionPage("inspector/inspector.html");

  const records = await waitFor(async () => {
    const rs = await getRecords("shop.test");
    assert.ok(!rs.error, rs.error);
    return rs.length >= 4 && rs.every(r => r.status) ? rs : null;
  });

  // First-party requests are not recorded.
  assert.ok(!records.some(r => r.host === "shop.test"));

  const meta = records.find(r => r.company === "Meta");
  assert.ok(meta, "Meta request recorded");
  assert.deepEqual(meta.params, [["id", "123"], ["ev", "AddToCart"], ["cd[content_name]", "Pink Tee"]]);
  assert.equal(meta.status, "200");

  const beacon = records.find(r => r.url.endsWith("/beacon"));
  assert.equal(beacon.method, "POST");
  assert.equal(beacon.type, "beacon");
  assert.deepEqual(JSON.parse(beacon.body.value), { event: "add_to_cart", item: "Pink Tee" });

  const pixel = records.find(r => r.url.endsWith("/pixel"));
  assert.equal(pixel.company, "Other");
  assert.deepEqual(pixel.cookies, [["uid", "abc12345xyz"]]);

  // The inspector shows them too.
  const summary = await waitFor(async () => {
    const text = await driver.findElement({ id: "summary" }).getText();
    return text.includes("Meta: 1") ? text : null;
  });
  assert.match(summary, /Other: 3/);

  await driver.switchTo().window(storeTab);
});

test("starts fresh when the tab moves to a different site", async () => {
  await driver.get(`http://other.test:${port}/product`);
  await waitFor(async () => (await driver.getTitle()) === "done");

  const handles = await driver.getAllWindowHandles();
  await driver.switchTo().window(handles[1]);
  const records = await waitFor(async () => {
    const rs = await getRecords("other.test");
    return rs.length >= 4 ? rs : null;
  });
  assert.ok(records.every(r => r.topUrl.includes("other.test")), "no records left over from shop.test");
});

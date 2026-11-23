// Inspector: live view of everything the recorder captured for one tab.
// All page-derived data is inserted with textContent, never as HTML.

const COMPANIES = ["Meta", "Google", "TikTok", "Pinterest", "Known tracker", "Other"];
const POLL_MS = 1000;

const $ = id => document.getElementById(id);
const state = {
  tabId: Number(new URLSearchParams(location.search).get("tab")) || null,
  generation: null,
  sinceVersion: 0,
  records: new Map(), // id -> record
  expanded: new Set(),
  shown: new Set(["Meta", "Google", "TikTok", "Pinterest", "Known tracker"]),
};

const send = msg => browser.runtime.sendMessage(msg);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(c => c !== null && c !== undefined));
  return node;
}

// ---- data ----

async function refreshTabs() {
  const tabs = await send({ type: "listTabs" });
  const select = $("tab");
  select.replaceChildren(...tabs.map(t => el("option", {
    value: t.tabId,
    textContent: `${t.site || new URL(t.url).hostname} (${t.count || 0}): ${t.title}`,
  })));
  if (!tabs.some(t => t.tabId === state.tabId)) {
    state.tabId = tabs[0]?.tabId ?? null;
  }
  select.value = state.tabId;
}

async function poll() {
  if (state.tabId === null || $("pause").checked) {
    return;
  }
  const res = await send({ type: "getChanges", tabId: state.tabId, sinceVersion: state.sinceVersion });
  if (res.generation !== state.generation) {
    state.generation = res.generation;
    state.records.clear();
    state.expanded.clear();
  }
  state.sinceVersion = res.version;
  if (res.records.length) {
    for (const r of res.records) {
      r.searchText = JSON.stringify(r).toLowerCase();
      state.records.set(r.id, r);
    }
    render();
  }
}

function resetView() {
  state.generation = null;
  state.sinceVersion = 0;
  state.records.clear();
  state.expanded.clear();
  render();
  poll();
}

function visibleRecords() {
  const q = $("search").value.trim().toLowerCase();
  return [...state.records.values()].filter(r =>
    state.shown.has(r.company) && (!q || r.searchText.includes(q)));
}

// ---- rendering ----

function kvTable(pairs) {
  return el("table", {}, ...pairs.map(([k, v]) =>
    el("tr", {}, el("td", { textContent: k }), el("td", { textContent: v }))));
}

function section(title, content) {
  return [el("h4", { textContent: title }), content];
}

function bodyView(body) {
  if (body.kind === "form") {
    return kvTable(body.value.map(([k, vs]) => [k, vs.join(", ")]));
  }
  if (body.kind !== "text") {
    return el("pre", { textContent: body.value });
  }
  const text = body.value + (body.truncated ? "\n… (truncated)" : "");
  try {
    return el("pre", { textContent: JSON.stringify(JSON.parse(body.value), null, 2) });
  } catch { /* not JSON */ }
  if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body.value.trim())) {
    return kvTable([...new URLSearchParams(body.value.trim())]);
  }
  return el("pre", { textContent: text });
}

function detailsView(r) {
  const info = [
    ["URL", r.url],
    ["Page", r.topUrl],
    ["Frame", r.frameUrl !== r.topUrl ? r.frameUrl : null],
    ["Disguised as", r.cloaked ? `${r.host} (really ${r.trackerHost})` : null],
    ["Status", r.status],
  ].filter(([, v]) => v);
  return el("div", { className: "details" },
    ...section("Request", kvTable(info)),
    ...(r.params.length ? section(`URL parameters (${r.params.length})`, kvTable(r.params)) : []),
    ...(r.body ? section("Body", bodyView(r.body)) : []),
    ...(r.cookies.length ? section(`Cookies sent (${r.cookies.length})`, kvTable(r.cookies)) : []));
}

function rowView(r) {
  const u = new URL(r.url);
  const extras = [
    r.params.length && `${r.params.length} params`,
    r.body && "body",
    r.cookies.length && `${r.cookies.length} cookies`,
  ].filter(Boolean).join(" · ");
  const row = el("div", { className: "row" },
    el("span", { className: "muted", textContent: new Date(r.time).toLocaleTimeString() }),
    el("span", { className: `badge c-${r.company.replace(" ", "-")}`, textContent: r.company }),
    el("span", { textContent: r.method }),
    el("span", { className: "muted", textContent: r.type }),
    el("span", { title: r.url, textContent: u.hostname + u.pathname }),
    el("span", { className: "muted", textContent: extras }));
  row.addEventListener("click", () => {
    state.expanded.has(r.id) ? state.expanded.delete(r.id) : state.expanded.add(r.id);
    render();
  });
  return state.expanded.has(r.id) ? [row, detailsView(r)] : [row];
}

function render() {
  const records = visibleRecords();
  const counts = {};
  for (const r of state.records.values()) {
    counts[r.company] = (counts[r.company] || 0) + 1;
  }
  $("summary").textContent = `Showing ${records.length} of ${state.records.size} third-party requests. ` +
    COMPANIES.filter(c => counts[c]).map(c => `${c}: ${counts[c]}`).join(" · ");
  $("list").replaceChildren(...records.flatMap(rowView));
}

// ---- controls ----

$("filters").append(...COMPANIES.map((c) => {
  const box = el("input", { type: "checkbox", checked: state.shown.has(c) });
  box.addEventListener("change", () => {
    box.checked ? state.shown.add(c) : state.shown.delete(c);
    render();
  });
  return el("label", {}, box, ` ${c}`);
}));

$("tab").addEventListener("change", (e) => {
  state.tabId = Number(e.target.value);
  resetView();
});
$("search").addEventListener("input", render);
$("clear").addEventListener("click", async () => {
  await send({ type: "clearTab", tabId: state.tabId });
  resetView();
});
$("export").addEventListener("click", () => {
  const data = visibleRecords().map(({ searchText, ...r }) => r); // eslint-disable-line no-unused-vars
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const site = $("tab").selectedOptions[0]?.textContent.split(" ")[0] || "requests";
  el("a", { href: URL.createObjectURL(blob), download: `tracker-lens-${site}-${Date.now()}.json` }).click();
});

await refreshTabs();
await poll();
setInterval(poll, POLL_MS);
setInterval(refreshTabs, 5000);

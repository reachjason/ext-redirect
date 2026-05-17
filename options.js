const DEFAULT_REDIRECT = "https://cesto.co";

const DEFAULT_RULES = [
  { pattern: "*://*.reddit.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://twitter.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://*.twitter.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://x.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://*.x.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://*.youtube.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://*.facebook.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://*.instagram.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://*.tiktok.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://news.ycombinator.com/*", redirectTo: DEFAULT_REDIRECT },
  { pattern: "*://*.linkedin.com/*", redirectTo: DEFAULT_REDIRECT }
];

const DEFAULTS = {
  message: "Get back to work.",
  focus: "",
  delaySeconds: 10,
  rules: DEFAULT_RULES
};

const $ = (id) => document.getElementById(id);
const tbody = document.querySelector("#rules tbody");

function addRow(pattern = "", redirectTo = "", action = "redirect") {
  const tr = document.createElement("tr");

  const tdPattern = document.createElement("td");
  const inPattern = document.createElement("input");
  inPattern.type = "text";
  inPattern.placeholder = "*://*.reddit.com/*";
  inPattern.value = pattern;
  inPattern.className = "pattern";
  tdPattern.appendChild(inPattern);

  const tdAction = document.createElement("td");
  const selAction = document.createElement("select");
  selAction.className = "action";
  for (const [val, label] of [
    ["redirect", "Redirect"],
    ["grayscale", "Grayscale"]
  ]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === action) opt.selected = true;
    selAction.appendChild(opt);
  }
  tdAction.appendChild(selAction);

  const tdRedirect = document.createElement("td");
  const inRedirect = document.createElement("input");
  inRedirect.type = "text";
  inRedirect.placeholder = "(blank = built-in page)";
  inRedirect.value = redirectTo;
  inRedirect.className = "redirect";
  tdRedirect.appendChild(inRedirect);

  function syncRedirectDisabled() {
    const isGrayscale = selAction.value === "grayscale";
    inRedirect.disabled = isGrayscale;
    inRedirect.placeholder = isGrayscale
      ? "(not used for grayscale)"
      : "(blank = built-in page)";
  }
  selAction.addEventListener("change", syncRedirectDisabled);
  syncRedirectDisabled();

  const tdDel = document.createElement("td");
  tdDel.className = "del";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "danger";
  del.textContent = "Delete";
  del.addEventListener("click", () => tr.remove());
  tdDel.appendChild(del);

  tr.appendChild(tdPattern);
  tr.appendChild(tdAction);
  tr.appendChild(tdRedirect);
  tr.appendChild(tdDel);
  tbody.appendChild(tr);
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $("message").value = s.message;
  $("focus").value = s.focus;
  $("delaySeconds").value = s.delaySeconds;
  tbody.innerHTML = "";
  if (!s.rules.length) {
    addRow("", "", "redirect");
  } else {
    for (const r of s.rules)
      addRow(r.pattern || "", r.redirectTo || "", r.action || "redirect");
  }
}

async function save() {
  const rules = [];
  for (const tr of tbody.querySelectorAll("tr")) {
    const pattern = tr.querySelector(".pattern").value.trim();
    const redirectTo = tr.querySelector(".redirect").value.trim();
    const action = tr.querySelector(".action").value;
    if (!pattern) continue;
    rules.push({ pattern, action, redirectTo });
  }

  const settings = {
    message: $("message").value || DEFAULTS.message,
    focus: $("focus").value,
    delaySeconds: Math.max(0, Number($("delaySeconds").value) || 0),
    rules
  };

  await chrome.storage.sync.set(settings);
  const status = $("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 2000);
}

function formatRelative(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatHosts(hosts) {
  return Object.entries(hosts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h, c]) => `${h} (${c})`)
    .join(", ");
}

async function loadStats() {
  const { stats = {} } = await chrome.storage.local.get("stats");
  const tbody = document.querySelector("#stats tbody");
  tbody.innerHTML = "";
  const entries = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.style.color = "#6b7280";
    td.textContent = "No blocks recorded yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const [pattern, e] of entries) {
    const tr = document.createElement("tr");
    const tdP = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = pattern;
    tdP.appendChild(code);
    const tdC = document.createElement("td");
    tdC.textContent = String(e.count);
    const tdH = document.createElement("td");
    tdH.textContent = formatHosts(e.hosts || {});
    const tdL = document.createElement("td");
    tdL.textContent = formatRelative(e.lastAt);
    tr.append(tdP, tdC, tdH, tdL);
    tbody.appendChild(tr);
  }
}

$("resetStats").addEventListener("click", async () => {
  await chrome.storage.local.set({ stats: {} });
  loadStats();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.stats) loadStats();
});

$("add").addEventListener("click", () => addRow());
$("save").addEventListener("click", save);

load();
loadStats();

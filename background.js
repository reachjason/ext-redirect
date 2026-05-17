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
  flashAfterMinutes: 15,
  reflashEveryMinutes: 15,
  rules: DEFAULT_RULES
};

let settings = { ...DEFAULTS };
const graceUntil = new Map(); // tabId -> timestamp ms

function patternToRegex(pattern) {
  // Chrome match pattern: <scheme>://<host>/<path>
  // scheme: * | http | https | file | ftp
  // host:   * | *.domain | exact
  // path:   any, with * wildcards
  const m = /^([a-z*]+):\/\/([^/]+)(\/.*)$/i.exec(pattern);
  if (!m) return null;
  const [, scheme, host, path] = m;

  const schemeRe = scheme === "*" ? "https?" : escapeRe(scheme);

  let hostRe;
  if (host === "*") {
    hostRe = "[^/]+";
  } else if (host.startsWith("*.")) {
    const rest = escapeRe(host.slice(2));
    hostRe = `(?:[^/]+\\.)?${rest}`;
  } else {
    hostRe = escapeRe(host);
  }

  const pathRe = escapeRe(path).replace(/\\\*/g, ".*");

  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`, "i");
}

function escapeRe(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function compileRules(rules) {
  return rules
    .map((r) => ({ ...r, regex: patternToRegex(r.pattern) }))
    .filter((r) => r.regex);
}

let compiled = [];

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  settings = { ...DEFAULTS, ...stored };
  compiled = compileRules(settings.rules || []);
}

chrome.runtime.onInstalled.addListener(loadSettings);
chrome.runtime.onStartup.addListener(loadSettings);
loadSettings();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  loadSettings();
});

function findMatch(url) {
  for (const r of compiled) {
    if (r.regex.test(url)) return r;
  }
  return null;
}

const GRAYSCALE_CSS =
  "html{filter:grayscale(1) !important;-webkit-filter:grayscale(1) !important;}";

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (!/^https?:/i.test(url)) return;

  const expires = graceUntil.get(details.tabId);
  if (expires && expires > Date.now()) return;
  if (expires) graceUntil.delete(details.tabId);

  const rule = findMatch(url);
  if (!rule) return;
  if ((rule.action || "redirect") !== "redirect") return;

  let target;
  if (rule.redirectTo && rule.redirectTo.trim()) {
    target = rule.redirectTo.trim();
  } else {
    target = chrome.runtime.getURL(
      `blocked.html?from=${encodeURIComponent(url)}`
    );
  }

  recordBlock(rule.pattern, url);
  chrome.tabs.update(details.tabId, { url: target });
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (!/^https?:/i.test(url)) return;

  const rule = findMatch(url);
  if (!rule) return;
  if (rule.action !== "grayscale") return;

  chrome.scripting
    .insertCSS({
      target: { tabId: details.tabId },
      css: GRAYSCALE_CSS
    })
    .catch(() => {});

  recordBlock(rule.pattern, url);
});

async function recordBlock(pattern, url) {
  try {
    const host = new URL(url).hostname;
    const { stats = {} } = await chrome.storage.local.get("stats");
    const entry = stats[pattern] || { count: 0, hosts: {}, lastAt: 0 };
    entry.count += 1;
    entry.hosts[host] = (entry.hosts[host] || 0) + 1;
    entry.lastAt = Date.now();
    stats[pattern] = entry;
    await chrome.storage.local.set({ stats });
  } catch (e) {
    // ignore
  }
}

// ---- Time-on-site flash reminder ----

let active = null; // { tabId, since, pattern }
const tabAccumMs = new Map(); // tabId -> ms accumulated on matched URLs
const tabLastFlashAtMs = new Map(); // tabId -> cumulative ms at last flash

function finalizeActive() {
  if (!active) return;
  const delta = Date.now() - active.since;
  tabAccumMs.set(active.tabId, (tabAccumMs.get(active.tabId) || 0) + delta);
  active = null;
}

async function reevaluateActive() {
  finalizeActive();
  let win;
  try {
    win = await chrome.windows.getLastFocused({ populate: false });
  } catch {
    return;
  }
  if (!win || !win.focused) return;
  const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
  const tab = tabs[0];
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return;
  const rule = findMatch(tab.url);
  if (!rule) {
    tabAccumMs.delete(tab.id);
    tabLastFlashAtMs.delete(tab.id);
    return;
  }
  active = { tabId: tab.id, since: Date.now(), pattern: rule.pattern };
}

async function checkThreshold() {
  const thresholdMs = (settings.flashAfterMinutes || 0) * 60 * 1000;
  if (thresholdMs <= 0 || !active) return;

  const totalMs =
    (tabAccumMs.get(active.tabId) || 0) + (Date.now() - active.since);
  const lastAt = tabLastFlashAtMs.get(active.tabId) || 0;
  const reflashMs = (settings.reflashEveryMinutes || 0) * 60 * 1000;

  let shouldFlash = false;
  if (lastAt === 0 && totalMs >= thresholdMs) shouldFlash = true;
  else if (lastAt > 0 && reflashMs > 0 && totalMs - lastAt >= reflashMs)
    shouldFlash = true;

  if (shouldFlash) {
    tabLastFlashAtMs.set(active.tabId, totalMs);
    flashTab(active.tabId, settings.message || "Get back to work.");
  }
}

function flashTab(tabId, message) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      func: flashOverlay,
      args: [message]
    })
    .catch(() => {});
}

// Runs in the page context.
function flashOverlay(message) {
  const id = "__gbtw_flash__";
  if (document.getElementById(id)) return;
  const div = document.createElement("div");
  div.id = id;
  div.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "background:rgba(15,17,21,0.93)",
    "color:#fff",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "text-align:center",
    "padding:2rem",
    'font:700 clamp(2rem,6vw,4rem)/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    "opacity:0",
    "transition:opacity 0.4s ease",
    "pointer-events:none"
  ].join(";");
  div.textContent = message;
  (document.body || document.documentElement).appendChild(div);
  requestAnimationFrame(() => (div.style.opacity = "1"));
  setTimeout(() => {
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 600);
  }, 3500);
}

chrome.alarms.create("flash-check", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "flash-check") checkThreshold();
});

chrome.tabs.onActivated.addListener(() => reevaluateActive());
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url || change.status === "complete") reevaluateActive();
});
chrome.windows.onFocusChanged.addListener(() => reevaluateActive());

chrome.tabs.onRemoved.addListener((tabId) => {
  graceUntil.delete(tabId);
  tabAccumMs.delete(tabId);
  tabLastFlashAtMs.delete(tabId);
  if (active && active.tabId === tabId) active = null;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "grant-grace" && sender.tab) {
    const seconds = Math.max(30, Number(msg.seconds) || 60);
    graceUntil.set(sender.tab.id, Date.now() + seconds * 1000);
    sendResponse({ ok: true });
  }
  if (msg && msg.type === "get-settings") {
    sendResponse({ settings });
  }
  return true;
});

chrome.action.onClicked.addListener(() => {
  const fallback = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  try {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) fallback();
    });
  } catch (e) {
    fallback();
  }
});

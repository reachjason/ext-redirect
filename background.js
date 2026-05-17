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

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (!/^https?:/i.test(url)) return;

  const expires = graceUntil.get(details.tabId);
  if (expires && expires > Date.now()) return;
  if (expires) graceUntil.delete(details.tabId);

  const rule = findMatch(url);
  if (!rule) return;

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

chrome.tabs.onRemoved.addListener((tabId) => graceUntil.delete(tabId));

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
  chrome.runtime.openOptionsPage();
});

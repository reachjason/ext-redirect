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
  reminderMessage: "Sit up straight. Unclench your jaw. Drink some water.",
  reminderEveryHours: 0,
  allowWindows: [],
  focusUrl: "",
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
  syncReminderAlarm();
}

function syncReminderAlarm() {
  const hours = Number(settings.reminderEveryHours) || 0;
  if (hours > 0) {
    const period = Math.max(0.5, hours * 60); // minutes; Chrome floor ~0.5
    chrome.alarms.create("periodic-reminder", { periodInMinutes: period });
  } else {
    chrome.alarms.clear("periodic-reminder");
  }
}

async function flashAllWindows(message) {
  let wins;
  try {
    wins = await chrome.windows.getAll({ populate: true });
  } catch {
    return;
  }
  for (const w of wins) {
    const tab = (w.tabs || []).find((t) => t.active);
    if (!tab || !tab.id || !tab.url || !/^https?:/i.test(tab.url)) continue;
    flashTab(tab.id, message);
  }
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
    if (r.enabled === false) continue;
    if (r.regex.test(url)) return r;
  }
  return null;
}

function parseHM(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((str || "").trim());
  if (!m) return null;
  const h = +m[1];
  const mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

// Returns "normal", "grayscale", or null based on the current local time.
// "normal" (most permissive) wins over "grayscale" when windows overlap.
function activeAllowMode() {
  const wins = settings.allowWindows || [];
  if (!wins.length) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const w of wins) {
    const s = parseHM(w.start);
    const e = parseHM(w.end);
    if (s == null || e == null || s === e) continue;
    const inWin = s < e ? mins >= s && mins < e : mins >= s || mins < e;
    if (!inWin) continue;
    if (w.mode === "normal") return "normal";
    best = "grayscale";
  }
  return best;
}

const GRAYSCALE_CSS =
  "html{filter:grayscale(1) !important;-webkit-filter:grayscale(1) !important;}";

function scheduleGrayscale(delaySeconds) {
  const STYLE_ID = "__gbtw_grayscale__";
  if (document.getElementById(STYLE_ID)) return;
  const apply = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "html{filter:grayscale(1) !important;-webkit-filter:grayscale(1) !important;}";
    (document.head || document.documentElement).appendChild(style);
  };
  if (delaySeconds > 0) setTimeout(apply, delaySeconds * 1000);
  else apply();
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;

  // Hardcore focus mode: any non-focus tab is forced to the focus URL.
  const f = await getFocus();
  if (f.active && details.tabId !== f.tabId && url !== f.url) {
    chrome.tabs.update(details.tabId, { url: f.url }).catch(() => {});
    return;
  }

  if (!/^https?:/i.test(url)) return;

  const expires = graceUntil.get(details.tabId);
  if (expires && expires > Date.now()) return;
  if (expires) graceUntil.delete(details.tabId);

  const rule = findMatch(url);
  if (!rule) return;
  if ((rule.action || "redirect") !== "redirect") return;

  // Allow window active: skip the redirect. onCommitted handles grayscale.
  if (activeAllowMode() !== null) return;

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

  const allow = activeAllowMode();

  // Normal allow window: fully accessible, no filter at all.
  if (allow === "normal") return;

  const inGrace = (graceUntil.get(details.tabId) || 0) > Date.now();

  if (rule.action === "grayscale") {
    chrome.scripting
      .executeScript({
        target: { tabId: details.tabId },
        func: scheduleGrayscale,
        args: [Math.max(0, Number(settings.delaySeconds) || 0)]
      })
      .catch(() => {});
    recordBlock(rule.pattern, url);
  } else if (allow === "grayscale" || inGrace) {
    // Either a grayscale allow window is active, or the user clicked
    // "Continue anyway" — let them through but render the site grayscale.
    // insertCSS applies before paint so there's no flash of color first.
    chrome.scripting
      .insertCSS({
        target: { tabId: details.tabId },
        css: GRAYSCALE_CSS
      })
      .catch(() => {});
  }
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
//
// Tick-based: every TICK_SECONDS, if the focused tab is on a matched URL,
// add TICK_SECONDS to that tab's accumulator (stored in chrome.storage.session
// so it survives service-worker sleeps). When the accumulator crosses the
// threshold, flash the page.

const TICK_SECONDS = 30;

async function tick() {
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

  const sess = await chrome.storage.session.get({ accum: {}, lastFlash: {} });
  const accum = sess.accum;
  const lastFlash = sess.lastFlash;
  const key = String(tab.id);

  if (!rule) {
    if (accum[key] || lastFlash[key]) {
      delete accum[key];
      delete lastFlash[key];
      await chrome.storage.session.set({ accum, lastFlash });
    }
    return;
  }

  accum[key] = (accum[key] || 0) + TICK_SECONDS;
  const totalSec = accum[key];
  const thresholdSec = (settings.flashAfterMinutes || 0) * 60;
  const reflashSec = (settings.reflashEveryMinutes || 0) * 60;
  const lastFlashSec = lastFlash[key] || 0;

  let shouldFlash = false;
  if (thresholdSec > 0) {
    if (lastFlashSec === 0 && totalSec >= thresholdSec) shouldFlash = true;
    else if (
      lastFlashSec > 0 &&
      reflashSec > 0 &&
      totalSec - lastFlashSec >= reflashSec
    )
      shouldFlash = true;
  }

  if (shouldFlash) {
    lastFlash[key] = totalSec;
    flashTab(tab.id, settings.message || "Get back to work.");
  }

  await chrome.storage.session.set({ accum, lastFlash });
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

chrome.alarms.create("flash-check", { periodInMinutes: TICK_SECONDS / 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "flash-check") tick();
  if (alarm.name === "periodic-reminder") {
    flashAllWindows(
      settings.reminderMessage || "Take a break. Posture. Water."
    );
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  graceUntil.delete(tabId);
  try {
    const sess = await chrome.storage.session.get({ accum: {}, lastFlash: {} });
    const key = String(tabId);
    if (sess.accum[key] || sess.lastFlash[key]) {
      delete sess.accum[key];
      delete sess.lastFlash[key];
      await chrome.storage.session.set(sess);
    }
  } catch {}

  // If the focus tab is closed while focus mode is locked, reopen it.
  const f = await getFocus();
  if (f.active && tabId === f.tabId) {
    const tab = await chrome.tabs.create({ url: f.url, active: true });
    await chrome.storage.session.set({ focus: { ...f, tabId: tab.id } });
  }
});

// ---- Hardcore focus mode ----

const FOCUS_OFF = { active: false, endsAt: 0, tabId: -1, url: "" };

async function getFocus() {
  const { focus } = await chrome.storage.session.get({ focus: FOCUS_OFF });
  if (focus.active && focus.endsAt && Date.now() >= focus.endsAt) {
    await chrome.storage.session.set({ focus: FOCUS_OFF });
    return { ...FOCUS_OFF };
  }
  return focus;
}

function focusTarget(override) {
  const u = (override ?? settings.focusUrl ?? "").trim();
  return u || chrome.runtime.getURL("focus.html");
}

async function startFocus(minutes, overrideUrl) {
  const mins = Math.max(1, Math.min(600, Math.round(Number(minutes) || 0)));
  const url = focusTarget(overrideUrl);
  const tab = await chrome.tabs.create({ url, active: true });
  const endsAt = Date.now() + mins * 60 * 1000;
  await chrome.storage.session.set({
    focus: { active: true, endsAt, tabId: tab.id, url }
  });
  chrome.alarms.create("focus-end", { when: endsAt });
  try {
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
  return await getFocus();
}

async function stopFocus() {
  await chrome.storage.session.set({ focus: FOCUS_OFF });
  chrome.alarms.clear("focus-end");
}

// Snap the user back to the focus tab (recreating it if it was closed).
async function enforceFocus() {
  const f = await getFocus();
  if (!f.active) return;
  let focusTab = null;
  try {
    focusTab = await chrome.tabs.get(f.tabId);
  } catch {}
  if (!focusTab) {
    const tab = await chrome.tabs.create({ url: f.url, active: true });
    await chrome.storage.session.set({ focus: { ...f, tabId: tab.id } });
    return;
  }
  try {
    await chrome.tabs.update(f.tabId, { active: true });
    await chrome.windows.update(focusTab.windowId, { focused: true });
  } catch {}
}

chrome.tabs.onActivated.addListener(async (info) => {
  const f = await getFocus();
  if (f.active && info.tabId !== f.tabId) enforceFocus();
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const f = await getFocus();
  if (!f.active || tab.id === f.tabId) return;
  if (tab.id != null) {
    chrome.tabs.update(tab.id, { url: f.url }).catch(() => {});
  }
  enforceFocus();
});

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  const f = await getFocus();
  if (f.active) enforceFocus();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "focus-end") return;
  const f = await getFocus(); // getFocus auto-clears if expired
  if (!f.active) chrome.alarms.clear("focus-end");
});

// Re-arm the end alarm if the service worker restarted mid-session.
(async () => {
  const f = await getFocus();
  if (f.active) chrome.alarms.create("focus-end", { when: f.endsAt });
})();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "grant-grace" && sender.tab) {
    const seconds = Math.max(30, Number(msg.seconds) || 60);
    graceUntil.set(sender.tab.id, Date.now() + seconds * 1000);
    sendResponse({ ok: true });
    return false;
  }
  if (msg && msg.type === "get-settings") {
    sendResponse({ settings });
    return false;
  }
  if (msg && msg.type === "get-focus") {
    getFocus().then((f) =>
      sendResponse({
        active: f.active,
        endsAt: f.endsAt,
        remainingMs: f.active ? Math.max(0, f.endsAt - Date.now()) : 0
      })
    );
    return true;
  }
  if (msg && msg.type === "start-focus") {
    startFocus(msg.minutes, msg.url).then((f) =>
      sendResponse({
        ok: true,
        endsAt: f.endsAt,
        remainingMs: Math.max(0, f.endsAt - Date.now())
      })
    );
    return true;
  }
  if (msg && msg.type === "stop-focus") {
    stopFocus().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

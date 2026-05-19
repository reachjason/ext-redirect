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
  allowDelaySeconds: 5,
  flashAfterMinutes: 15,
  reflashEveryMinutes: 15,
  reminderMessage: "Sit up straight. Unclench your jaw. Drink some water.",
  reminderEveryHours: 0,
  allowWindows: [],
  focusUrl: "",
  rules: DEFAULT_RULES
};

const $ = (id) => document.getElementById(id);
const tbody = document.querySelector("#rules tbody");
const winBody = document.querySelector("#windows tbody");

// A Delete button that requires a second click within 4s to confirm.
function makeDeleteButton(onConfirm) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "danger";
  btn.textContent = "Delete";
  let armed = false;
  let timer = null;
  btn.addEventListener("click", () => {
    if (armed) {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    armed = true;
    btn.textContent = "Confirm?";
    btn.classList.add("armed");
    timer = setTimeout(() => {
      armed = false;
      btn.textContent = "Delete";
      btn.classList.remove("armed");
    }, 4000);
  });
  return btn;
}

// Adds a two-click confirm to an existing button: first click arms it
// (swaps to armedText for 4s), second click runs onConfirm.
function armConfirm(btn, baseText, armedText, onConfirm) {
  let armed = false;
  let timer = null;
  btn.addEventListener("click", () => {
    if (armed) {
      clearTimeout(timer);
      armed = false;
      btn.textContent = baseText;
      btn.classList.remove("armed");
      onConfirm();
      return;
    }
    armed = true;
    btn.textContent = armedText;
    btn.classList.add("armed");
    timer = setTimeout(() => {
      armed = false;
      btn.textContent = baseText;
      btn.classList.remove("armed");
    }, 4000);
  });
}

function addRow(
  pattern = "",
  redirectTo = "",
  action = "redirect",
  enabled = true
) {
  const tr = document.createElement("tr");

  const tdEnabled = document.createElement("td");
  tdEnabled.className = "on";
  const chkEnabled = document.createElement("input");
  chkEnabled.type = "checkbox";
  chkEnabled.className = "enabled";
  chkEnabled.checked = enabled !== false;
  chkEnabled.title = "Enable/disable this rule without deleting it";
  tdEnabled.appendChild(chkEnabled);

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
  tdDel.appendChild(makeDeleteButton(() => tr.remove()));

  tr.appendChild(tdEnabled);
  tr.appendChild(tdPattern);
  tr.appendChild(tdAction);
  tr.appendChild(tdRedirect);
  tr.appendChild(tdDel);
  tbody.appendChild(tr);
}

function addWindowRow(start = "12:00", end = "13:00", mode = "normal") {
  const tr = document.createElement("tr");

  const tdStart = document.createElement("td");
  const inStart = document.createElement("input");
  inStart.type = "time";
  inStart.className = "winStart";
  inStart.value = start;
  tdStart.appendChild(inStart);

  const tdEnd = document.createElement("td");
  const inEnd = document.createElement("input");
  inEnd.type = "time";
  inEnd.className = "winEnd";
  inEnd.value = end;
  tdEnd.appendChild(inEnd);

  const tdMode = document.createElement("td");
  const selMode = document.createElement("select");
  selMode.className = "winMode";
  for (const [val, label] of [
    ["normal", "Normal (full access)"],
    ["grayscale", "Grayscale"]
  ]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === mode) opt.selected = true;
    selMode.appendChild(opt);
  }
  tdMode.appendChild(selMode);

  const tdDel = document.createElement("td");
  tdDel.className = "del";
  tdDel.appendChild(makeDeleteButton(() => tr.remove()));

  tr.append(tdStart, tdEnd, tdMode, tdDel);
  winBody.appendChild(tr);
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $("message").value = s.message;
  $("focus").value = s.focus;
  $("delaySeconds").value = s.delaySeconds;
  $("allowDelaySeconds").value = s.allowDelaySeconds;
  $("flashAfterMinutes").value = s.flashAfterMinutes;
  $("reflashEveryMinutes").value = s.reflashEveryMinutes;
  $("reminderMessage").value = s.reminderMessage || "";
  $("reminderEveryHours").value = s.reminderEveryHours;
  tbody.innerHTML = "";
  if (!s.rules.length) {
    addRow("", "", "redirect", true);
  } else {
    for (const r of s.rules)
      addRow(
        r.pattern || "",
        r.redirectTo || "",
        r.action || "redirect",
        r.enabled !== false
      );
  }
  winBody.innerHTML = "";
  for (const w of s.allowWindows || [])
    addWindowRow(w.start || "", w.end || "", w.mode || "normal");
}

async function save() {
  const rules = [];
  for (const tr of tbody.querySelectorAll("tr")) {
    const pattern = tr.querySelector(".pattern").value.trim();
    const redirectTo = tr.querySelector(".redirect").value.trim();
    const action = tr.querySelector(".action").value;
    const enabled = tr.querySelector(".enabled").checked;
    if (!pattern) continue;
    rules.push({ pattern, action, redirectTo, enabled });
  }

  const allowWindows = [];
  for (const tr of winBody.querySelectorAll("tr")) {
    const start = tr.querySelector(".winStart").value;
    const end = tr.querySelector(".winEnd").value;
    const mode = tr.querySelector(".winMode").value;
    if (!start || !end) continue;
    allowWindows.push({ start, end, mode });
  }

  const settings = {
    message: $("message").value || DEFAULTS.message,
    focus: $("focus").value,
    delaySeconds: Math.max(0, Number($("delaySeconds").value) || 0),
    allowDelaySeconds: Math.max(0, Number($("allowDelaySeconds").value) || 0),
    flashAfterMinutes: Math.max(0, Number($("flashAfterMinutes").value) || 0),
    reflashEveryMinutes: Math.max(
      0,
      Number($("reflashEveryMinutes").value) || 0
    ),
    reminderMessage: $("reminderMessage").value || DEFAULTS.reminderMessage,
    reminderEveryHours: Math.max(
      0,
      Number($("reminderEveryHours").value) || 0
    ),
    allowWindows,
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

armConfirm($("resetStats"), "Reset stats", "Confirm reset?", async () => {
  await chrome.storage.local.set({ stats: {} });
  loadStats();
});

const noteSort = { key: "host", dir: 1 };

function sortNotes(notes) {
  const { key, dir } = noteSort;
  return notes.slice().sort((a, b) => {
    let av, bv;
    if (key === "ts") {
      av = a.ts || 0;
      bv = b.ts || 0;
    } else {
      av = String(a[key] || "").toLowerCase();
      bv = String(b[key] || "").toLowerCase();
    }
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return (b.ts || 0) - (a.ts || 0);
  });
}

function updateNoteCarets() {
  document.querySelectorAll("#notes th.sortable").forEach((th) => {
    const c = th.querySelector(".caret");
    if (!c) return;
    if (th.dataset.sort === noteSort.key) {
      c.textContent = noteSort.dir === 1 ? "▲" : "▼";
      th.classList.add("sorted");
    } else {
      c.textContent = "⇅";
      th.classList.remove("sorted");
    }
  });
}

document.querySelectorAll("#notes th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (noteSort.key === key) {
      noteSort.dir *= -1;
    } else {
      noteSort.key = key;
      noteSort.dir = 1;
    }
    updateNoteCarets();
    loadNotes();
  });
});

async function loadNotes() {
  const { notes = [] } = await chrome.storage.local.get("notes");
  const tbody = document.querySelector("#notes tbody");
  tbody.innerHTML = "";
  if (!notes.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.style.color = "#6b7280";
    td.textContent = "Nothing batched yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const item of sortNotes(notes)) {
    const tr = document.createElement("tr");
    const tdW = document.createElement("td");
    tdW.textContent = formatRelative(item.ts);
    const tdS = document.createElement("td");
    tdS.textContent = item.host || "—";
    const tdN = document.createElement("td");
    tdN.textContent = item.note;
    const tdD = document.createElement("td");
    tdD.appendChild(
      makeDeleteButton(async () => {
        const { notes: cur = [] } = await chrome.storage.local.get("notes");
        await chrome.storage.local.set({
          notes: cur.filter((n) => n.id !== item.id)
        });
        loadNotes();
      })
    );
    tr.append(tdW, tdS, tdN, tdD);
    tbody.appendChild(tr);
  }
}

armConfirm($("clearNotes"), "Clear all", "Confirm clear all?", async () => {
  await chrome.storage.local.set({ notes: [] });
  loadNotes();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.stats) loadStats();
  if (changes.notes) loadNotes();
});

$("add").addEventListener("click", () => addRow());
$("addWindow").addEventListener("click", () => addWindowRow());
$("save").addEventListener("click", save);

load();
loadStats();
updateNoteCarets();
loadNotes();

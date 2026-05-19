const $ = (id) => document.getElementById(id);
const idle = $("idle");
const active = $("active");
let tick = null;

function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function showIdle() {
  if (tick) {
    clearInterval(tick);
    tick = null;
  }
  active.hidden = true;
  idle.hidden = false;
  resetConfirm();
}

function showActive(remainingMs) {
  idle.hidden = true;
  active.hidden = false;
  resetConfirm();
  $("timer").textContent = fmt(remainingMs);
  if (tick) clearInterval(tick);
  tick = setInterval(refresh, 1000);
}

function refresh() {
  chrome.runtime.sendMessage({ type: "get-focus" }, (f) => {
    if (!f || !f.active) {
      showIdle();
      return;
    }
    if (active.hidden) showActive(f.remainingMs);
    else $("timer").textContent = fmt(f.remainingMs);
  });
}

function resetConfirm() {
  $("confirmWrap").hidden = true;
  $("stop").hidden = false;
  const btn = $("confirm");
  btn.disabled = true;
}

chrome.runtime.sendMessage({ type: "get-settings" }, (resp) => {
  const s = (resp && resp.settings) || {};
  if (typeof s.focusUrl === "string") $("focusUrl").value = s.focusUrl;
});

$("start").addEventListener("click", () => {
  const minutes = Number($("minutes").value) || 25;
  const url = $("focusUrl").value.trim();
  chrome.storage.sync.set({ focusUrl: url });
  chrome.runtime.sendMessage({ type: "start-focus", minutes, url }, (r) => {
    if (r && r.ok) showActive(r.remainingMs);
  });
});

$("settings").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$("stop").addEventListener("click", () => {
  $("stop").hidden = true;
  $("confirmWrap").hidden = false;
  const btn = $("confirm");
  const countEl = $("count");
  let remaining = 5;
  countEl.textContent = String(remaining);
  btn.disabled = true;
  const t = setInterval(() => {
    remaining -= 1;
    countEl.textContent = String(remaining);
    if (remaining <= 0) {
      clearInterval(t);
      btn.disabled = false;
      btn.textContent = "Confirm stop";
    }
  }, 1000);
});

$("cancel").addEventListener("click", resetConfirm);

$("confirm").addEventListener("click", () => {
  if ($("confirm").disabled) return;
  chrome.runtime.sendMessage({ type: "stop-focus" }, () => showIdle());
});

refresh();

const params = new URLSearchParams(location.search);
const from = params.get("from") || "";
const to = params.get("to") || "";
document.getElementById("from").textContent = from;

let fromHost = "";
try {
  fromHost = new URL(from).hostname;
} catch {}

const noteInput = document.getElementById("noteInput");
const saveNoteBtn = document.getElementById("saveNote");
const noteStatus = document.getElementById("noteStatus");
if (fromHost) {
  noteInput.placeholder = `Why ${fromHost}? Save it for later (e.g. Follow Alex)`;
}

function saveNote() {
  const note = noteInput.value.trim();
  if (!note) {
    noteInput.focus();
    return;
  }
  saveNoteBtn.disabled = true;
  chrome.runtime.sendMessage(
    { type: "save-note", host: fromHost, note },
    (resp) => {
      saveNoteBtn.disabled = false;
      if (resp && resp.ok) {
        noteInput.value = "";
        const n = resp.count || 0;
        noteStatus.textContent = `Saved ✓ — get back to work. ${n} batched so far.`;
        noteStatus.hidden = false;
      }
    }
  );
}

saveNoteBtn.addEventListener("click", saveNote);
noteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveNote();
  }
});

const continueBtn = document.getElementById("continue");
const goBtn = document.getElementById("goRedirect");

let goLabel = "Go to focus page";
if (to) {
  try {
    goLabel = `Go to ${new URL(to).hostname}`;
  } catch {}
  goBtn.hidden = false;
  goBtn.textContent = `${goLabel} (…)`;
}

chrome.runtime.sendMessage({ type: "get-settings" }, (resp) => {
  const s = (resp && resp.settings) || {};
  if (s.message) document.getElementById("message").textContent = s.message;
  if (s.focus) document.getElementById("focus").textContent = s.focus;
  setWaitPrompt(s.allowWindows);
  const delay = Math.max(0, Number(s.delaySeconds) || 10);
  startCountdown(delay);
});

// Shows "Can this wait until <next allow-window start>?" based on the
// soonest upcoming allow window. Hidden if no valid windows are set.
function setWaitPrompt(windows) {
  const el = document.getElementById("wait");
  if (!Array.isArray(windows) || !windows.length) return;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const w of windows) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String((w && w.start) || "").trim());
    if (!m) continue;
    const h = +m[1];
    const mm = +m[2];
    if (h > 23 || mm > 59) continue;
    const start = h * 60 + mm;
    let delta = (start - nowMins + 1440) % 1440;
    if (delta === 0) delta = 1440;
    if (!best || delta < best.delta) {
      best = {
        delta,
        label: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
        mode: w.mode,
      };
    }
  }
  if (!best) return;
  const hrs = Math.floor(best.delta / 60);
  const mins = best.delta % 60;
  const rel = hrs ? `${hrs}h ${mins}m` : `${mins}m`;
  let txt = `Can this wait until ${best.label}? (in ${rel}`;
  txt += best.mode === "grayscale" ? " — and only in grayscale)" : ")";
  el.textContent = txt;
  el.hidden = false;
}

function startCountdown(seconds) {
  const count = document.getElementById("count");
  let remaining = seconds;
  count.textContent = String(remaining);
  if (to) goBtn.textContent = `${goLabel} (${remaining}s)`;

  if (remaining <= 0) {
    enableButtons();
    return;
  }

  const t = setInterval(() => {
    remaining -= 1;
    count.textContent = String(remaining);
    if (to) goBtn.textContent = `${goLabel} (${remaining}s)`;
    if (remaining <= 0) {
      clearInterval(t);
      enableButtons();
    }
  }, 1000);
}

function enableButtons() {
  continueBtn.disabled = false;
  continueBtn.textContent = "Continue anyway";
  continueBtn.addEventListener("click", () => {
    if (!from) return;
    chrome.runtime.sendMessage({ type: "grant-grace", seconds: 60 }, () => {
      location.replace(from);
    });
  });

  if (to) {
    goBtn.disabled = false;
    goBtn.textContent = goLabel;
    goBtn.addEventListener("click", () => location.replace(to));
  }
}

chrome.runtime.sendMessage({ type: "get-settings" }, (resp) => {
  const s = (resp && resp.settings) || {};
  if (s.message) document.getElementById("message").textContent = s.message;
  if (s.focus) document.getElementById("focus").textContent = s.focus;
});

const timerEl = document.getElementById("timer");

function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function refresh() {
  chrome.runtime.sendMessage({ type: "get-focus" }, (f) => {
    if (!f || !f.active) {
      timerEl.textContent = "00:00";
      document.querySelector(".lock").textContent =
        "Focus mode has ended. You can close this tab.";
      return;
    }
    timerEl.textContent = fmt(f.remainingMs);
  });
}

refresh();
setInterval(refresh, 1000);

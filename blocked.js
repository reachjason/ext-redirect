const params = new URLSearchParams(location.search);
const from = params.get("from") || "";
const to = params.get("to") || "";
document.getElementById("from").textContent = from;

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
  const delay = Math.max(0, Number(s.delaySeconds) || 10);
  startCountdown(delay);
});

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

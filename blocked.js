const params = new URLSearchParams(location.search);
const from = params.get("from") || "";
document.getElementById("from").textContent = from;

chrome.runtime.sendMessage({ type: "get-settings" }, (resp) => {
  const s = (resp && resp.settings) || {};
  if (s.message) document.getElementById("message").textContent = s.message;
  if (s.focus) document.getElementById("focus").textContent = s.focus;
  const delay = Math.max(0, Number(s.delaySeconds) || 10);
  startCountdown(delay);
});

function startCountdown(seconds) {
  const btn = document.getElementById("continue");
  const count = document.getElementById("count");
  let remaining = seconds;
  count.textContent = String(remaining);

  if (remaining === 0) {
    enable(btn);
    return;
  }

  const t = setInterval(() => {
    remaining -= 1;
    count.textContent = String(remaining);
    if (remaining <= 0) {
      clearInterval(t);
      enable(btn);
    }
  }, 1000);
}

function enable(btn) {
  btn.disabled = false;
  btn.textContent = "Continue anyway";
  btn.addEventListener("click", () => {
    if (!from) return;
    chrome.runtime.sendMessage({ type: "grant-grace", seconds: 60 }, () => {
      location.replace(from);
    });
  });
}

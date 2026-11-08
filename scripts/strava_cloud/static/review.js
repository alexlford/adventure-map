"use strict";
// Keep an already-open owner view from continuing to show expired contents.
// The server independently rejects expired objects on every read.
(() => {
  const expiry = document.getElementById("expiry");
  const content = document.getElementById("review-content");
  if (!expiry || !content) return;
  const deadline = Number(expiry.dataset.expiresAt) * 1000;
  let timer;
  const check = () => {
    clearTimeout(timer);
    if (!Number.isFinite(deadline) || Date.now() >= deadline) {
      content.replaceChildren(document.createTextNode("This temporary review has expired. Run a new private scan."));
      expiry.textContent = "Expired";
      document.title = "Expired · Private Strava review";
      return;
    }
    timer = setTimeout(check, Math.min(deadline - Date.now(), 30000));
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("pageshow", check);
  check();
})();

// Content script: draggable, RTL caption overlay.

(function () {
  if (window.__LMT_OVERLAY_INSTALLED__) return;
  window.__LMT_OVERLAY_INSTALLED__ = true;

  const MAX_FINALS = 3;
  let finals = [];
  let root, finalsEl, interimEl;

  function ensureOverlay() {
    if (root) return;
    root = document.createElement("div");
    root.id = "lmt-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="lmt-head">
        <span>תמלול חי</span>
        <span class="lmt-close" title="הסתר">×</span>
      </div>
      <div class="lmt-finals"></div>
      <div class="lmt-interim"></div>
    `;
    document.documentElement.appendChild(root);
    finalsEl = root.querySelector(".lmt-finals");
    interimEl = root.querySelector(".lmt-interim");
    root.querySelector(".lmt-close").addEventListener("click", () => {
      root.hidden = true;
    });
    makeDraggable(root, root.querySelector(".lmt-head"));
  }

  function render() {
    if (!finalsEl) return;
    finalsEl.innerHTML = "";
    for (const t of finals) {
      const div = document.createElement("div");
      div.className = "lmt-line";
      div.textContent = t;
      finalsEl.appendChild(div);
    }
  }

  function makeDraggable(el, handle) {
    let dx = 0, dy = 0, sx = 0, sy = 0, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const rect = el.getBoundingClientRect();
      dx = rect.left; dy = rect.top;
      el.style.left = dx + "px";
      el.style.top = dy + "px";
      el.style.bottom = "auto";
      el.style.transform = "none";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = (dx + (e.clientX - sx)) + "px";
      el.style.top  = (dy + (e.clientY - sy)) + "px";
    });
    window.addEventListener("mouseup", () => { dragging = false; });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.source !== "live-transcriber") return;
    ensureOverlay();
    if (msg.type === "SHOW") {
      root.hidden = false;
    } else if (msg.type === "HIDE") {
      root.hidden = true;
    } else if (msg.type === "INTERIM") {
      interimEl.textContent = msg.text || "";
    } else if (msg.type === "FINAL") {
      const text = (msg.text || "").trim();
      if (text) {
        finals.push(text);
        if (finals.length > MAX_FINALS) finals = finals.slice(-MAX_FINALS);
        render();
      }
      interimEl.textContent = "";
    } else if (msg.type === "CLEAR") {
      finals = [];
      render();
      interimEl.textContent = "";
    }
  });
})();

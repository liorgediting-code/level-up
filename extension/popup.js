const $ = (id) => document.getElementById(id);
const dot = $("dot");
const statusText = $("status-text");
const startBtn = $("start");
const stopBtn = $("stop");
const toggleBtn = $("toggle");
const titleInput = $("title");
const langSelect = $("lang");
const meta = $("meta");
const err = $("err");

let elapsedTimer = null;
let startedAt = 0;

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

function renderMeta(sessionId) {
  if (!startedAt) { meta.textContent = ""; return; }
  meta.textContent =
    "Session: " + (sessionId || "(local)") +
    "\nElapsed: " + fmtElapsed(Date.now() - startedAt);
}

function setStatus({ recording, sessionId, startedAt: s, error }) {
  startedAt = s || 0;
  dot.className = "dot";
  if (error) {
    dot.classList.add("error");
    statusText.textContent = "שגיאה";
    err.textContent = error;
  } else if (recording) {
    dot.classList.add("recording");
    statusText.textContent = "מקליט";
    err.textContent = "";
  } else {
    statusText.textContent = "לא פעיל";
    err.textContent = "";
  }
  startBtn.disabled = !!recording;
  stopBtn.disabled = !recording;

  if (recording) {
    if (!elapsedTimer) elapsedTimer = setInterval(() => renderMeta(sessionId), 1000);
    renderMeta(sessionId);
  } else {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    meta.textContent = "";
  }
}

async function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ target: "background", ...msg }, (resp) => {
      resolve(resp);
    });
  });
}

startBtn.addEventListener("click", async () => {
  err.textContent = "";
  startBtn.disabled = true;
  const resp = await send({
    type: "START",
    title: titleInput.value.trim(),
    language: langSelect.value,
  });
  if (!resp || !resp.ok) {
    err.textContent = (resp && resp.error) || "Failed to start";
    startBtn.disabled = false;
    return;
  }
  setStatus({ recording: true, sessionId: resp.sessionId, startedAt: resp.startedAt });
});

stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  const resp = await send({ type: "STOP" });
  if (!resp || !resp.ok) err.textContent = (resp && resp.error) || "Failed to stop";
  setStatus({ recording: false });
});

toggleBtn.addEventListener("click", async () => {
  await send({ type: "TOGGLE_OVERLAY" });
});

document.getElementById("mic-permission").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
});

// Listen for status broadcasts from background.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.source !== "live-transcriber" || msg.type !== "STATUS") return;
  setStatus({
    recording: msg.recording,
    sessionId: msg.sessionId,
    startedAt: msg.startedAt,
    error: msg.error,
  });
});

// Initial sync.
(async () => {
  const resp = await send({ type: "GET_STATUS" });
  if (resp && resp.ok) {
    setStatus({ recording: resp.recording, sessionId: resp.sessionId, startedAt: resp.startedAt });
  }
})();

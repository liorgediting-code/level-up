// Service worker: orchestrates capture, owns the Deepgram WebSocket, and
// posts transcripts to the webapp.

import {
  DEEPGRAM_API_KEY,
  WEBAPP_BASE_URL,
  WEBAPP_AUTH_TOKEN,
} from "./config.js";

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

const state = {
  recording: false,
  tabId: null,
  sessionId: null,        // server-side session id (from webapp)
  sessionTitle: null,
  language: "he",
  startedAt: 0,
  overlayVisible: true,

  ws: null,
  keepAliveTimer: null,

  // Pending finals waiting to be POSTed to the webapp.
  chunkQueue: [],
  flushTimer: null,
  lastFlushAt: 0,

  // Retry queue for failed POSTs (FIFO).
  retryQueue: [],
  retryTimer: null,
  retryAttempt: 0,
};

const BATCH_INTERVAL_MS = 2000;
const BATCH_MAX_CHUNKS = 5;

// ────────────────────────────────────────────────────────────────────────────
// Offscreen document management
// ────────────────────────────────────────────────────────────────────────────
async function ensureOffscreen() {
  // hasDocument may be undefined on older Chromes; guard.
  if (chrome.offscreen.hasDocument) {
    const has = await chrome.offscreen.hasDocument();
    if (has) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Capture meeting tab audio and convert to 16kHz PCM for transcription.",
    });
  } catch (e) {
    // Race: another caller may have created it already.
    if (!String(e.message || e).includes("Only a single offscreen")) throw e;
  }
}

async function closeOffscreen() {
  try {
    if (chrome.offscreen.hasDocument) {
      const has = await chrome.offscreen.hasDocument();
      if (!has) return;
    }
    await chrome.offscreen.closeDocument();
  } catch (e) {
    console.warn("[bg] closeOffscreen", e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Deepgram WebSocket
// ────────────────────────────────────────────────────────────────────────────
function openDeepgram(language) {
  // Deepgram streaming Hebrew is only available via nova-3 + language=multi.
  //   - whisper streaming returns 405 on most accounts.
  //   - nova-2/nova-3 + language=he returns 400 (not supported).
  // For non-Hebrew languages, nova-3 + the ISO code works.
  const requested = language || "he";
  let lang = requested;
  const model = "nova-3";
  if (requested === "he") lang = "multi";

  const params = new URLSearchParams({
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    model,
    language: lang,
    punctuate: "true",
    smart_format: "true",
    endpointing: "false",
    interim_results: "true",
  });

  const url = "wss://api.deepgram.com/v1/listen?" + params.toString();

  // Chrome extensions can't set arbitrary headers on a WebSocket. Deepgram
  // accepts the API key via Sec-WebSocket-Protocol as ['token', KEY].
  const ws = new WebSocket(url, ["token", DEEPGRAM_API_KEY]);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    console.log("[bg] Deepgram open", url);
    state.dgFramesSent = 0;
    state.dgResultsRecv = 0;
    state.keepAliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "KeepAlive" }));
        console.log("[bg] dg stats — pcm frames sent:", state.dgFramesSent, "results recv:", state.dgResultsRecv);
      }
    }, 8000);
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "Metadata") { console.log("[bg] dg metadata", msg); return; }
    if (msg.type === "Error" || msg.error) {
      console.error("[bg] dg error msg", msg);
      broadcastStatus("error", "deepgram: " + (msg.description || msg.reason || msg.error || "unknown"));
      return;
    }
    if (msg.type !== "Results") return;
    state.dgResultsRecv = (state.dgResultsRecv || 0) + 1;
    const alt = msg.channel && msg.channel.alternatives && msg.channel.alternatives[0];
    if (!alt) return;
    const text = (alt.transcript || "").trim();
    if (!text) return;
    const isFinal = !!msg.is_final;
    const startMs = Math.round((msg.start || 0) * 1000);
    const endMs = Math.round(((msg.start || 0) + (msg.duration || 0)) * 1000);

    // Push to overlay
    sendToOverlay({ type: isFinal ? "FINAL" : "INTERIM", text });

    if (isFinal) {
      enqueueChunk({ text, is_final: true, start_ms: startMs, end_ms: endMs });
    }
  };

  ws.onerror = (e) => {
    console.error("[bg] Deepgram error", e);
    broadcastStatus("error", "deepgram error");
  };

  ws.onclose = (ev) => {
    console.log("[bg] Deepgram closed", ev.code, ev.reason, "wasClean=", ev.wasClean);
    if (ev.code !== 1000 && state.recording) {
      broadcastStatus("error", "deepgram closed " + ev.code + " " + (ev.reason || ""));
    }
    if (state.keepAliveTimer) { clearInterval(state.keepAliveTimer); state.keepAliveTimer = null; }
    state.ws = null;
  };

  return ws;
}

function closeDeepgram() {
  const ws = state.ws;
  state.ws = null;
  if (state.keepAliveTimer) { clearInterval(state.keepAliveTimer); state.keepAliveTimer = null; }
  if (!ws) return;
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "CloseStream" }));
    }
  } catch {}
  try { ws.close(); } catch {}
}

// ────────────────────────────────────────────────────────────────────────────
// Webapp API
// ────────────────────────────────────────────────────────────────────────────
async function webappPost(path, body) {
  const res = await fetch(WEBAPP_BASE_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + WEBAPP_AUTH_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("webapp " + res.status + ": " + t.slice(0, 200));
  }
  return res.json().catch(() => ({}));
}

async function createSession({ title, language }) {
  const r = await webappPost("/api/sessions", {
    title: title || null,
    language: language || "he",
    started_at: new Date().toISOString(),
  });
  // Accept either {session_id} or {id} from the webapp.
  return r.session_id || r.id || r.sessionId || null;
}

async function endSession(sessionId) {
  if (!sessionId) return;
  try {
    await webappPost(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
      ended_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[bg] endSession failed", e);
  }
}

// Chunk batching + retry
function enqueueChunk(chunk) {
  state.chunkQueue.push(chunk);
  const now = Date.now();
  if (state.chunkQueue.length >= BATCH_MAX_CHUNKS) {
    flushChunks();
  } else if (!state.flushTimer) {
    const wait = Math.max(0, BATCH_INTERVAL_MS - (now - state.lastFlushAt));
    state.flushTimer = setTimeout(flushChunks, wait);
  }
}

async function flushChunks() {
  if (state.flushTimer) { clearTimeout(state.flushTimer); state.flushTimer = null; }
  if (!state.sessionId) return;
  if (state.chunkQueue.length === 0) return;
  const batch = state.chunkQueue.splice(0, state.chunkQueue.length);
  state.lastFlushAt = Date.now();
  try {
    await webappPost(`/api/sessions/${encodeURIComponent(state.sessionId)}/chunks`, batch);
  } catch (e) {
    console.warn("[bg] chunk post failed, queuing for retry", e);
    state.retryQueue.push(batch);
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (state.retryTimer) return;
  const delay = Math.min(30000, 1000 * Math.pow(2, state.retryAttempt));
  state.retryAttempt++;
  state.retryTimer = setTimeout(async () => {
    state.retryTimer = null;
    while (state.retryQueue.length) {
      const batch = state.retryQueue[0];
      try {
        await webappPost(`/api/sessions/${encodeURIComponent(state.sessionId)}/chunks`, batch);
        state.retryQueue.shift();
        state.retryAttempt = 0;
      } catch (e) {
        console.warn("[bg] retry failed", e);
        scheduleRetry();
        return;
      }
    }
  }, delay);
}

// ────────────────────────────────────────────────────────────────────────────
// Audio capture orchestration
// ────────────────────────────────────────────────────────────────────────────
function getStreamIdForTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!streamId) return reject(new Error("no streamId"));
      resolve(streamId);
    });
  });
}

async function startSession({ title, language }) {
  if (state.recording) throw new Error("already recording");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("no active tab");
  state.tabId = tab.id;
  state.sessionTitle = title || null;
  state.language = language || "he";

  // 1. Webapp session
  try {
    state.sessionId = await createSession({ title, language });
  } catch (e) {
    console.warn("[bg] createSession failed; continuing without webapp session", e);
    state.sessionId = null;
  }

  // 2. Deepgram streaming WS.
  // Hebrew live-streaming on Deepgram is unreliable (the only option is
  // language=multi which biases to English). Since the post-stop pre-recorded
  // path produces accurate Hebrew, we skip live streaming for Hebrew to avoid
  // showing wrong English captions on the overlay.
  if (state.language === "he") {
    state.ws = null;
    console.log("[bg] live streaming disabled for Hebrew — full Hebrew transcript will appear in the webapp after Stop");
  } else {
    state.ws = openDeepgram(state.language);
  }

  // 3. Offscreen capture (also starts MediaRecorder for full-fidelity upload)
  await ensureOffscreen();
  const streamId = await getStreamIdForTab(state.tabId);
  const resp = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "start",
    streamId,
    upload: state.sessionId
      ? {
          sessionId: state.sessionId,
          webappBaseUrl: WEBAPP_BASE_URL,
          authToken: WEBAPP_AUTH_TOKEN,
        }
      : null,
  });
  if (!resp || !resp.ok) {
    throw new Error("offscreen start failed: " + (resp && resp.error));
  }

  state.recording = true;
  state.startedAt = Date.now();
  broadcastStatus("recording");
  // Only show the overlay when live streaming is active. For Hebrew there
  // are no live captions, so don't pop up an empty box.
  if (state.ws) {
    sendToOverlay({ type: "SHOW", visible: state.overlayVisible });
  }
}

async function stopSession() {
  if (!state.recording) return;
  state.recording = false;

  // Stop capture first.
  try {
    await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
  } catch (e) { console.warn("[bg] offscreen stop", e); }
  await closeOffscreen();

  // Flush remaining chunks.
  await flushChunks();

  // Close Deepgram.
  closeDeepgram();

  // Mark session ended in webapp.
  const sid = state.sessionId;
  state.sessionId = null;
  await endSession(sid);

  sendToOverlay({ type: "HIDE" });
  broadcastStatus("idle");
}

// ────────────────────────────────────────────────────────────────────────────
// Port from offscreen (binary PCM frames)
// ────────────────────────────────────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "pcm") return;
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "pcm") return;
    const ws = state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      // Offscreen sends base64 (chrome.runtime ports JSON-serialize).
      const bin = atob(msg.b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      ws.send(u8.buffer);
      state.dgFramesSent = (state.dgFramesSent || 0) + 1;
    } catch (e) {
      console.warn("[bg] ws.send failed", e);
    }
  });
  port.onDisconnect.addListener(() => {
    // Offscreen torn down; nothing to do — stopSession handles cleanup.
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Messaging with popup + content scripts
// ────────────────────────────────────────────────────────────────────────────
async function sendToOverlay(payload) {
  let tabId = state.tabId;
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab && tab.id;
  }
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { source: "live-transcriber", ...payload });
  } catch {
    // Content script may not be injected on this URL (e.g. chrome://, non-meeting tab).
  }
}

function broadcastStatus(status, error) {
  chrome.runtime.sendMessage({
    source: "live-transcriber",
    type: "STATUS",
    status,
    error: error || null,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    recording: state.recording,
    overlayVisible: state.overlayVisible,
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "background") return;
  (async () => {
    try {
      if (msg.type === "START") {
        await startSession({ title: msg.title, language: msg.language });
        sendResponse({ ok: true, sessionId: state.sessionId, startedAt: state.startedAt });
      } else if (msg.type === "STOP") {
        await stopSession();
        sendResponse({ ok: true });
      } else if (msg.type === "GET_STATUS") {
        sendResponse({
          ok: true,
          recording: state.recording,
          sessionId: state.sessionId,
          startedAt: state.startedAt,
          overlayVisible: state.overlayVisible,
        });
      } else if (msg.type === "TOGGLE_OVERLAY") {
        state.overlayVisible = !state.overlayVisible;
        sendToOverlay({ type: state.overlayVisible ? "SHOW" : "HIDE", visible: state.overlayVisible });
        sendResponse({ ok: true, overlayVisible: state.overlayVisible });
      } else {
        sendResponse({ ok: false, error: "unknown" });
      }
    } catch (e) {
      console.error("[bg] message error", e);
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      broadcastStatus("error", String(e && e.message ? e.message : e));
    }
  })();
  return true;
});

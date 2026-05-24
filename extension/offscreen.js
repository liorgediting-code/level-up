// Offscreen document: captures BOTH tab audio (other participants) and the
// microphone (user). Each stream feeds its own AudioWorkletNode and PCM
// buffer; on stop, two WAV files are uploaded so the webapp can transcribe
// each separately and label chunks by speaker.
//
// A mixed-mono stream is also forwarded to the service worker for the
// (best-effort) live Deepgram streaming subtitles.

let audioCtx = null;
let tabStream = null;
let micStream = null;
let tabSourceNode = null;
let micSourceNode = null;

let tabWorklet = null;
let micWorklet = null;
let liveWorklet = null;
let tabSilent = null;
let micSilent = null;
let liveSilent = null;

let port = null;

let tabChunks = [];      // Array<Uint8Array> 16k mono Int16 PCM from tab
let tabBytes = 0;
let micChunks = [];
let micBytes = 0;
let uploadCtx = null;    // { sessionId, webappBaseUrl, authToken }

function buildWavBlob(parts, totalBytes, sampleRate) {
  const data = new Uint8Array(totalBytes);
  let off = 0;
  for (const p of parts) { data.set(p, off); off += p.length; }

  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  const numChannels = 1, bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;

  writeStr(0, "RIFF");
  dv.setUint32(4, 36 + data.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  dv.setUint32(40, data.length, true);

  return new Blob([header, data], { type: "audio/wav" });
}

function makeWorklet() {
  return new AudioWorkletNode(audioCtx, "pcm-downsampler", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { targetRate: 16000 },
  });
}

async function startCapture(streamId) {
  if (audioCtx) {
    console.warn("[offscreen] already running");
    return { ok: true };
  }

  // 1. Tab audio.
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
    video: false,
  });

  // 2. Microphone (optional). Requires prior permission via permission.html.
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    console.log("[offscreen] mic captured");
  } catch (e) {
    console.warn("[offscreen] mic capture failed — recording tab only", e);
    micStream = null;
  }

  audioCtx = new AudioContext();
  await audioCtx.audioWorklet.addModule(chrome.runtime.getURL("pcm-worklet.js"));

  tabSourceNode = audioCtx.createMediaStreamSource(tabStream);
  if (micStream) micSourceNode = audioCtx.createMediaStreamSource(micStream);

  // Reset PCM buffers.
  tabChunks = []; tabBytes = 0;
  micChunks = []; micBytes = 0;

  // Worklet A — TAB only. Buffer for the tab WAV upload.
  tabWorklet = makeWorklet();
  tabWorklet.port.onmessage = (ev) => {
    const u8 = new Uint8Array(ev.data);
    const c = new Uint8Array(u8.length); c.set(u8);
    tabChunks.push(c); tabBytes += c.length;
  };
  tabSourceNode.connect(tabWorklet);

  // Worklet B — MIC only. Buffer for the mic WAV upload.
  if (micSourceNode) {
    micWorklet = makeWorklet();
    micWorklet.port.onmessage = (ev) => {
      const u8 = new Uint8Array(ev.data);
      const c = new Uint8Array(u8.length); c.set(u8);
      micChunks.push(c); micBytes += c.length;
    };
    micSourceNode.connect(micWorklet);
  }

  // Worklet C — MIXED (tab + mic) for live streaming subtitles.
  port = chrome.runtime.connect({ name: "pcm" });
  liveWorklet = makeWorklet();
  liveWorklet.port.onmessage = (ev) => {
    if (!port) return;
    const u8 = new Uint8Array(ev.data);
    try {
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < u8.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
      }
      port.postMessage({ type: "pcm", b64: btoa(bin) });
    } catch (e) {
      console.warn("[offscreen] port postMessage failed", e);
    }
  };
  port.onDisconnect.addListener(() => { port = null; });
  tabSourceNode.connect(liveWorklet);
  if (micSourceNode) micSourceNode.connect(liveWorklet);

  // Audio graph plumbing:
  //   tab → audioCtx.destination          (you still hear the meeting)
  //   each worklet → silentGain(0) → destination
  //     (worklets only run when their output is pulled — we use silent gains)
  tabSourceNode.connect(audioCtx.destination);

  tabSilent = audioCtx.createGain(); tabSilent.gain.value = 0;
  tabWorklet.connect(tabSilent); tabSilent.connect(audioCtx.destination);

  if (micWorklet) {
    micSilent = audioCtx.createGain(); micSilent.gain.value = 0;
    micWorklet.connect(micSilent); micSilent.connect(audioCtx.destination);
  }

  liveSilent = audioCtx.createGain(); liveSilent.gain.value = 0;
  liveWorklet.connect(liveSilent); liveSilent.connect(audioCtx.destination);

  return { ok: true, mic: !!micStream };
}

async function uploadBlobs(blobs, ctx) {
  if (!ctx || !ctx.sessionId || !ctx.webappBaseUrl) return { ok: false, reason: "missing ctx" };
  const form = new FormData();
  if (blobs.tab) form.append("file_tab", blobs.tab, `${ctx.sessionId}.tab.wav`);
  if (blobs.mic) form.append("file_mic", blobs.mic, `${ctx.sessionId}.mic.wav`);
  form.append("mime", "audio/wav");
  const url = `${ctx.webappBaseUrl}/api/sessions/${encodeURIComponent(ctx.sessionId)}/audio`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + ctx.authToken },
      body: form,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.warn("[offscreen] upload failed", res.status, text);
      return { ok: false, status: res.status, body: text };
    }
    console.log("[offscreen] upload ok", res.status, text.slice(0, 200));
    return { ok: true };
  } catch (e) {
    console.warn("[offscreen] upload error", e);
    return { ok: false, error: String(e) };
  }
}

async function stopCapture() {
  // 1. Tear down audio graph.
  try { tabWorklet && tabWorklet.disconnect(); } catch {}
  try { micWorklet && micWorklet.disconnect(); } catch {}
  try { liveWorklet && liveWorklet.disconnect(); } catch {}
  try { tabSilent && tabSilent.disconnect(); } catch {}
  try { micSilent && micSilent.disconnect(); } catch {}
  try { liveSilent && liveSilent.disconnect(); } catch {}
  try { tabSourceNode && tabSourceNode.disconnect(); } catch {}
  try { micSourceNode && micSourceNode.disconnect(); } catch {}
  try { audioCtx && (await audioCtx.close()); } catch {}
  try { tabStream && tabStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { micStream && micStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { port && port.disconnect(); } catch {}

  audioCtx = null;
  tabSourceNode = null; micSourceNode = null;
  tabWorklet = null; micWorklet = null; liveWorklet = null;
  tabSilent = null; micSilent = null; liveSilent = null;
  tabStream = null; micStream = null;
  port = null;

  console.log("[offscreen] stop — tab bytes:", tabBytes, "mic bytes:", micBytes);

  // 2. Build WAVs and upload.
  const blobs = {};
  if (tabBytes > 0) blobs.tab = buildWavBlob(tabChunks, tabBytes, 16000);
  if (micBytes > 0) blobs.mic = buildWavBlob(micChunks, micBytes, 16000);

  let uploadResult = { ok: false, reason: "no-pcm" };
  if ((blobs.tab || blobs.mic) && uploadCtx) {
    uploadResult = await uploadBlobs(blobs, uploadCtx);
  }

  tabChunks = []; tabBytes = 0;
  micChunks = []; micBytes = 0;
  uploadCtx = null;

  return {
    ok: true,
    uploaded: uploadResult.ok,
    uploadResult,
    tabSize: blobs.tab ? blobs.tab.size : 0,
    micSize: blobs.mic ? blobs.mic.size : 0,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  (async () => {
    try {
      if (msg.type === "start") {
        uploadCtx = msg.upload || null;
        const r = await startCapture(msg.streamId);
        sendResponse(r);
      } else if (msg.type === "stop") {
        const r = await stopCapture();
        sendResponse(r);
      } else if (msg.type === "set-session") {
        if (uploadCtx) uploadCtx.sessionId = msg.sessionId;
        else uploadCtx = { sessionId: msg.sessionId };
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "unknown" });
      }
    } catch (e) {
      console.error("[offscreen] error", e);
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true;
});

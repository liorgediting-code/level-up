// Offscreen document: owns the AudioContext + AudioWorklet because service
// workers can't use Web Audio. Receives a tab capture streamId from the
// service worker, opens the stream via getUserMedia, runs it through the PCM
// worklet, and forwards 16-bit PCM chunks back to the service worker via a
// long-lived Port.

let audioCtx = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;
let gainNode = null;
let port = null;

async function startCapture(streamId) {
  if (audioCtx) {
    console.warn("[offscreen] already running");
    return { ok: true };
  }

  // Open the tab stream. tabCapture in MV3 background returns a streamId;
  // offscreen consumes it via getUserMedia.
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  audioCtx = new AudioContext();
  await audioCtx.audioWorklet.addModule(chrome.runtime.getURL("pcm-worklet.js"));

  sourceNode = audioCtx.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioCtx, "pcm-downsampler", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { targetRate: 16000 },
  });

  // Open a port to the service worker for binary PCM frames.
  port = chrome.runtime.connect({ name: "pcm" });

  workletNode.port.onmessage = (ev) => {
    // ev.data is an ArrayBuffer of Int16 PCM at 16 kHz.
    if (!port) return;
    try {
      port.postMessage({ type: "pcm", buf: ev.data });
    } catch (e) {
      console.warn("[offscreen] port postMessage failed", e);
    }
  };

  // Pipe audio: source -> worklet -> destination so the user still hears the
  // meeting (tabCapture mutes the original tab playback).
  gainNode = audioCtx.createGain();
  gainNode.gain.value = 1.0;
  sourceNode.connect(workletNode);
  workletNode.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Also route source directly to destination as a safety net — the worklet's
  // output is the resampled signal which would sound bad at the speakers.
  // So instead: connect source -> destination for playback, source -> worklet
  // for transcription only. (Disconnect the worklet->destination chain.)
  workletNode.disconnect();
  gainNode.disconnect();
  sourceNode.connect(audioCtx.destination);
  sourceNode.connect(workletNode); // already connected; re-connect is fine

  port.onDisconnect.addListener(() => {
    port = null;
  });

  return { ok: true };
}

async function stopCapture() {
  try { workletNode && workletNode.disconnect(); } catch {}
  try { sourceNode && sourceNode.disconnect(); } catch {}
  try { gainNode && gainNode.disconnect(); } catch {}
  try { audioCtx && (await audioCtx.close()); } catch {}
  try { mediaStream && mediaStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { port && port.disconnect(); } catch {}
  audioCtx = null;
  sourceNode = null;
  workletNode = null;
  gainNode = null;
  mediaStream = null;
  port = null;
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  (async () => {
    try {
      if (msg.type === "start") {
        const r = await startCapture(msg.streamId);
        sendResponse(r);
      } else if (msg.type === "stop") {
        const r = await stopCapture();
        sendResponse(r);
      } else {
        sendResponse({ ok: false, error: "unknown" });
      }
    } catch (e) {
      console.error("[offscreen] error", e);
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // async response
});

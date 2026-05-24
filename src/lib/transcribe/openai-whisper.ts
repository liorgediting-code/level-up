// OpenAI server-side transcription. Defaults to `gpt-4o-transcribe`.
//
// Strategy to keep quality high:
//   1. Split the WAV into ~30-second chunks before sending. Whisper-family
//      models can fall into a "hallucination loop" (same phrase repeated
//      forever) when audio quality degrades; chunking confines a loop to
//      one chunk so the rest of the recording survives.
//   2. Collapse consecutive identical sentences (the loop output).
//   3. Skip chunks that are basically silent — Whisper hallucinates on
//      silence.

import fs from "node:fs/promises";
import path from "node:path";

export type Sentence = {
  text: string;
  start_ms: number;
  end_ms: number;
};

const DEFAULT_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";

const HEBREW_PROMPT = [
  "ההקלטה היא שיחת מכירה או אימון מכירות בעברית ישראלית.",
  "תמלל בדייקנות בעברית, עם פיסוק, רווחים נכונים, וללא לולאות חזרה.",
  "אם אין דיבור באודיו או יש רק שקט/רעש — החזר טקסט ריק במקום להמציא.",
  "מונחים נפוצים: לקוח, סגירה, הצעת מחיר, התנגדויות, פולואפ, ליד, משפך, קמפיין, ROI.",
].join(" ");

const CHUNK_MS = 30_000;
const SPEECH_RATIO_FLOOR = 0.04; // Skip chunks with <4% windows above noise floor.

export function hasOpenAI(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  durationMs: number;
};

function parseWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44 || buf.slice(0, 4).toString() !== "RIFF" || buf.slice(8, 12).toString() !== "WAVE") {
    return null;
  }
  // Walk chunks to find fmt and data.
  let i = 12;
  let sampleRate = 0, channels = 0, bitsPerSample = 0;
  let dataOffset = -1, dataSize = 0;
  while (i + 8 <= buf.length) {
    const id = buf.slice(i, i + 4).toString();
    const size = buf.readUInt32LE(i + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(i + 8 + 2);
      sampleRate = buf.readUInt32LE(i + 8 + 4);
      bitsPerSample = buf.readUInt16LE(i + 8 + 14);
    } else if (id === "data") {
      dataOffset = i + 8;
      dataSize = size;
      break;
    }
    i += 8 + size + (size % 2);
  }
  if (dataOffset < 0 || sampleRate === 0) return null;
  const bytesPerSample = (bitsPerSample / 8) * channels;
  const durationMs = bytesPerSample > 0 ? Math.round((dataSize / bytesPerSample / sampleRate) * 1000) : 0;
  return { sampleRate, channels, bitsPerSample, dataOffset, dataSize, durationMs };
}

function buildWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

function chunkWav(buf: Buffer, info: WavInfo, chunkMs: number): { wav: Buffer; offsetMs: number; durationMs: number }[] {
  const bytesPerSample = (info.bitsPerSample / 8) * info.channels;
  const bytesPerChunk = Math.floor((info.sampleRate * chunkMs) / 1000) * bytesPerSample;
  const data = buf.slice(info.dataOffset, info.dataOffset + info.dataSize);
  const out: { wav: Buffer; offsetMs: number; durationMs: number }[] = [];
  for (let off = 0; off < data.length; off += bytesPerChunk) {
    const slice = data.slice(off, Math.min(off + bytesPerChunk, data.length));
    if (slice.length === 0) break;
    const wav = buildWav(slice, info.sampleRate, info.channels, info.bitsPerSample);
    const durationMs = Math.round((slice.length / bytesPerSample / info.sampleRate) * 1000);
    const offsetMs = Math.round((off / bytesPerSample / info.sampleRate) * 1000);
    out.push({ wav, offsetMs, durationMs });
  }
  return out;
}

function speechRatio(pcm: Buffer): number {
  // 16-bit signed little-endian, mono assumed.
  const samples = pcm.length / 2;
  if (samples === 0) return 0;
  const sampleRate = 16000;
  const windowSamples = Math.floor((sampleRate * 200) / 1000); // 200 ms
  const threshold = 400; // RMS over 16-bit range
  let speech = 0, total = 0;
  for (let i = 0; i + windowSamples <= samples; i += windowSamples) {
    let sumSq = 0;
    for (let j = 0; j < windowSamples; j++) {
      const s = pcm.readInt16LE((i + j) * 2);
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / windowSamples);
    if (rms > threshold) speech++;
    total++;
  }
  return total ? speech / total : 0;
}

function splitIntoSentences(text: string, totalMs: number): { text: string; startMs: number; endMs: number }[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.match(/[^.?!\n]+[.?!]?/g) ?? [clean];
  const filtered = parts.map((p) => p.trim()).filter(Boolean);
  if (filtered.length === 0) return [];
  const totalChars = filtered.reduce((s, p) => s + p.length, 0) || 1;
  const out: { text: string; startMs: number; endMs: number }[] = [];
  let cursor = 0;
  for (const p of filtered) {
    const portion = Math.max(1, Math.round((p.length / totalChars) * totalMs));
    out.push({ text: p, startMs: cursor, endMs: cursor + portion });
    cursor += portion;
  }
  return out;
}

function normalizeForCompare(s: string) {
  return s.replace(/[\s,.!?״"׳']/g, "").toLowerCase();
}

function collapseLoops(sentences: Sentence[]): Sentence[] {
  // Drop consecutive identical or near-identical sentences. Keep the first
  // occurrence and extend its end_ms to absorb the run.
  const out: Sentence[] = [];
  for (const s of sentences) {
    const last = out[out.length - 1];
    if (last && normalizeForCompare(last.text) === normalizeForCompare(s.text)) {
      last.end_ms = s.end_ms;
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

async function callOpenAI(wav: Buffer, audioMime: string, language: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: audioMime }), "chunk.wav");
  form.append("model", DEFAULT_MODEL);
  if (language && language !== "multi") form.append("language", language);
  form.append("response_format", "json");
  form.append("temperature", "0");
  if (language === "he") form.append("prompt", HEBREW_PROMPT);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI ${DEFAULT_MODEL} ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text || "").trim();
}

export async function transcribeWithWhisper(
  audioPath: string,
  audioMime: string,
  language: string = "he"
): Promise<{ sentences: Sentence[]; raw: unknown }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

  const audio = await fs.readFile(audioPath);
  const info = parseWav(audio);
  if (!info) {
    // Fallback: send entire file as one blob. Lose chunking benefits.
    const text = await callOpenAI(audio, audioMime, language);
    const sentences = splitIntoSentences(text, text.length * 60).map((s) => ({ text: s.text, start_ms: s.startMs, end_ms: s.endMs }));
    return { sentences: collapseLoops(sentences), raw: { text } };
  }

  const chunks = chunkWav(audio, info, CHUNK_MS);
  const all: Sentence[] = [];
  let chunkIdx = 0;
  let skippedSilent = 0;
  for (const c of chunks) {
    chunkIdx++;
    const pcm = c.wav.slice(44);
    const ratio = speechRatio(pcm);
    if (ratio < SPEECH_RATIO_FLOOR) {
      skippedSilent++;
      console.log(`[openai] chunk ${chunkIdx}/${chunks.length} skipped (silent, ratio=${ratio.toFixed(3)})`);
      continue;
    }
    try {
      const text = await callOpenAI(c.wav, audioMime, language);
      if (!text) continue;
      const sents = splitIntoSentences(text, c.durationMs);
      for (const s of sents) {
        all.push({
          text: s.text,
          start_ms: c.offsetMs + s.startMs,
          end_ms: c.offsetMs + s.endMs,
        });
      }
    } catch (e) {
      console.warn(`[openai] chunk ${chunkIdx} failed:`, e);
    }
  }

  const deduped = collapseLoops(all);
  console.log(
    `[openai] model=${DEFAULT_MODEL} chunks=${chunks.length} skipped_silent=${skippedSilent} raw_sentences=${all.length} after_dedupe=${deduped.length} durationMs=${info.durationMs} bytes=${audio.byteLength}`
  );

  return { sentences: deduped, raw: null };
}

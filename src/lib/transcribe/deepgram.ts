// Server-side Deepgram pre-recorded transcription. Used to re-transcribe the
// uploaded audio with whisper-large + language=he so the saved transcript is
// actually Hebrew (Deepgram's streaming endpoint doesn't support he reliably).

import fs from "node:fs/promises";

const ENDPOINT = "https://api.deepgram.com/v1/listen";

export type DeepgramSentence = {
  text: string;
  start_ms: number;
  end_ms: number;
};

export async function transcribeFileToSentences(
  audioPath: string,
  audioMime: string,
  language: string = "he"
): Promise<{ sentences: DeepgramSentence[]; raw: unknown }> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY not configured");

  const audio = await fs.readFile(audioPath);

  // Strip codec hint from MIME — Deepgram only wants the base type.
  const contentType = (audioMime || "audio/webm").split(";")[0].trim() || "audio/webm";

  async function call(model: string) {
    const params = new URLSearchParams({
      model,
      language,
      punctuate: "true",
      smart_format: "true",
      paragraphs: "true",
      utterances: "true",
      diarize: "false",
    });
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": contentType,
      },
      body: new Uint8Array(audio),
    });
    return res;
  }

  // Model order: for Hebrew, Nova-* accepts the request but returns empty,
  // so try Whisper first; for other languages Nova is better.
  const tryOrder = language.startsWith("he")
    ? ["whisper-large", "whisper-medium", "nova-3", "nova-2"]
    : ["nova-3", "nova-2", "whisper-large", "whisper-medium"];

  let json: DeepgramResponse | null = null;
  let chosenModel = "";
  let lastErr = "";
  for (const model of tryOrder) {
    const r = await call(model);
    console.log(`[deepgram] tried model=${model} status=${r.status} bytes=${audio.byteLength} mime=${contentType}`);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      lastErr = `Deepgram ${r.status} on ${model}: ${t.slice(0, 300)}`;
      continue;
    }
    const data = (await r.json()) as DeepgramResponse;
    const t = (data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "").trim();
    if (t.length === 0) {
      console.log(`[deepgram] model=${model} returned empty transcript — trying next`);
      lastErr = `Deepgram ${model}: empty transcript`;
      continue;
    }
    json = data;
    chosenModel = model;
    console.log(`[deepgram] using model=${model} (transcript length ${t.length})`);
    break;
  }
  if (!json) throw new Error(lastErr || "Deepgram: all models returned empty");

  const alt = json.results?.channels?.[0]?.alternatives?.[0];
  const fullTranscript = (alt?.transcript || "").trim();

  // Try structured segmentation first.
  let sentences: DeepgramSentence[] = [];
  if (json.results?.utterances?.length) {
    for (const u of json.results.utterances) {
      const t = (u.transcript || "").trim();
      if (!t) continue;
      sentences.push({
        text: t,
        start_ms: Math.round((u.start ?? 0) * 1000),
        end_ms: Math.round((u.end ?? 0) * 1000),
      });
    }
  }
  if (sentences.length === 0) {
    const para = alt?.paragraphs?.paragraphs ?? [];
    for (const p of para) {
      for (const s of p.sentences ?? []) {
        const t = (s.text || "").trim();
        if (!t) continue;
        sentences.push({
          text: t,
          start_ms: Math.round((s.start ?? 0) * 1000),
          end_ms: Math.round((s.end ?? 0) * 1000),
        });
      }
    }
  }
  if (sentences.length === 0 && alt?.words?.length) {
    // Group words into ~12s windows by start time.
    const WINDOW_MS = 12_000;
    let bucketStart = -1;
    let bucketEnd = 0;
    let bucketWords: string[] = [];
    const flush = () => {
      if (!bucketWords.length) return;
      sentences.push({
        text: bucketWords.join(" ").replace(/\s+/g, " ").trim(),
        start_ms: Math.max(0, bucketStart),
        end_ms: bucketEnd,
      });
      bucketWords = [];
    };
    for (const w of alt.words) {
      const startMs = Math.round((w.start ?? 0) * 1000);
      const endMs = Math.round((w.end ?? 0) * 1000);
      if (bucketStart === -1) bucketStart = startMs;
      if (startMs - bucketStart >= WINDOW_MS) {
        flush();
        bucketStart = startMs;
      }
      bucketWords.push(w.punctuated_word || w.word || "");
      bucketEnd = endMs;
    }
    flush();
  }

  // Sanity: if structured chunks lost text vs raw transcript, prefer raw.
  const structuredText = sentences.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (fullTranscript && structuredText.length < fullTranscript.length * 0.85) {
    sentences = [{ text: fullTranscript, start_ms: 0, end_ms: 0 }];
  }

  // Last resort: whole transcript as one chunk.
  if (sentences.length === 0 && fullTranscript) {
    sentences = [{ text: fullTranscript, start_ms: 0, end_ms: 0 }];
  }

  console.log(
    "[deepgram] sentences:", sentences.length,
    "raw chars:", fullTranscript.length,
    "structured chars:", structuredText.length
  );

  return { sentences, raw: json };
}

// Minimal typing of the Deepgram response (only fields we use).
type DeepgramResponse = {
  results?: {
    utterances?: { transcript?: string; start?: number; end?: number }[];
    channels?: {
      alternatives?: {
        transcript?: string;
        words?: { word?: string; punctuated_word?: string; start?: number; end?: number }[];
        paragraphs?: {
          paragraphs?: {
            sentences?: { text?: string; start?: number; end?: number }[];
          }[];
        };
      }[];
    }[];
  };
};

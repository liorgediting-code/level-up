// Provider dispatcher. For Hebrew we strongly prefer OpenAI Whisper (Deepgram
// Hebrew is unreliable). Other languages → Deepgram (Nova-3 is great for EN).

import { transcribeFileToSentences as deepgram } from "./deepgram";
import { transcribeWithWhisper, hasOpenAI } from "./openai-whisper";

export type Sentence = { text: string; start_ms: number; end_ms: number };

export async function transcribe(
  audioPath: string,
  audioMime: string,
  language: string = "he"
): Promise<{ sentences: Sentence[]; provider: string }> {
  const isHebrew = language.startsWith("he");

  if (isHebrew && hasOpenAI()) {
    const r = await transcribeWithWhisper(audioPath, audioMime, "he");
    return { sentences: r.sentences, provider: "openai-whisper" };
  }

  // Fallback / non-Hebrew → Deepgram.
  const r = await deepgram(audioPath, audioMime, language);
  return { sentences: r.sentences, provider: "deepgram" };
}

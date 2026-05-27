import { z } from "zod";

export type SummaryKind = "meeting" | "sales_call";

// ---------- Meeting schema ----------

export const MeetingSummarySchema = z.object({
  date: z.string(),
  participants: z.array(z.string()),
  durationMinutes: z.number(),
  format: z.string(),
  executiveSummary: z.string(),
  topics: z.array(z.object({ title: z.string(), body: z.string() })),
  tasks: z.array(z.object({ description: z.string(), owner: z.string() })),
  openQuestions: z.array(
    z.object({ question: z.string(), context: z.string(), owner: z.string() })
  ),
  keyInsights: z.array(z.string()),
});
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

// ---------- Sales call schemas ----------

const SalesBase = {
  outcomeReason: z.string(),
  summary: z.string(),
};

export const SalesPendingSchema = z.object({
  outcome: z.literal("pending"),
  ...SalesBase,
  prospectProfile: z.string(),
  painPoints: z.array(z.string()),
  objectionsRaised: z.array(z.string()),
  whatWorked: z.array(z.string()),
  whatCouldBeBetter: z.array(z.string()),
  nextStepPlaybook: z.array(z.string()),
  recommendedFollowUpMessage: z.string(),
});

export const SalesLostSchema = z.object({
  outcome: z.literal("lost"),
  ...SalesBase,
  rootCauseAnalysis: z.string(),
  objectionsNotHandled: z.array(z.string()),
  coachingPoints: z.array(z.string()),
  winBackAngle: z.string(),
});

export const SalesClosedSchema = z.object({
  outcome: z.literal("closed"),
  ...SalesBase,
  whatWorked: z.array(z.string()),
  keyMomentsToReplicate: z.array(z.string()),
  onboardingHandoffNotes: z.array(z.string()),
});

export const SalesCallSummarySchema = z.discriminatedUnion("outcome", [
  SalesPendingSchema,
  SalesLostSchema,
  SalesClosedSchema,
]);
export type SalesCallSummary = z.infer<typeof SalesCallSummarySchema>;

// ---------- Renderers ----------

export function renderMeetingMarkdown(s: MeetingSummary, title: string | null): string {
  const lines: string[] = [];
  lines.push(`סיכום פגישה – ${title?.trim() || "פגישה"}`);
  lines.push("");
  lines.push(`תאריך: ${s.date}`);
  lines.push(`משתתפים: ${s.participants.join(", ")}`);
  lines.push(`משך הפגישה: ~${s.durationMinutes} דקות`);
  lines.push(`פורמט: ${s.format}`);
  lines.push("");
  lines.push("תקציר מנהלים");
  lines.push(s.executiveSummary);

  if (s.topics.length > 0) {
    lines.push("");
    lines.push("נושאים שנדונו");
    s.topics.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title}`);
      lines.push(t.body);
      lines.push("");
    });
  }

  if (s.tasks.length > 0) {
    lines.push("משימות לביצוע");
    for (const t of s.tasks) lines.push(`- ${t.description} — ${t.owner}`);
    lines.push("");
  }

  if (s.openQuestions.length > 0) {
    lines.push("שאלות פתוחות");
    for (const q of s.openQuestions) {
      lines.push(`- ${q.question} (${q.context}) — אחראי: ${q.owner}`);
    }
    lines.push("");
  }

  if (s.keyInsights.length > 0) {
    lines.push("תובנות מרכזיות מהפגישה");
    for (const k of s.keyInsights) lines.push(`- ${k}`);
  }

  return lines.join("\n").trimEnd();
}

const SALES_STATUS_HE: Record<SalesCallSummary["outcome"], string> = {
  pending: "ממתין",
  lost: "לא נסגר",
  closed: "נסגר",
};

export function renderSalesCallMarkdown(s: SalesCallSummary): string {
  const lines: string[] = [];
  lines.push("ניתוח שיחת מכירה");
  lines.push("");
  lines.push(`סטטוס: ${SALES_STATUS_HE[s.outcome]}`);
  lines.push(s.outcomeReason);
  lines.push("");
  lines.push("סיכום");
  lines.push(s.summary);
  lines.push("");

  if (s.outcome === "pending") {
    lines.push("פרופיל הליד");
    lines.push(s.prospectProfile);
    lines.push("");
    if (s.painPoints.length) {
      lines.push("נקודות כאב");
      for (const p of s.painPoints) lines.push(`- ${p}`);
      lines.push("");
    }
    if (s.objectionsRaised.length) {
      lines.push("התנגדויות שעלו");
      for (const o of s.objectionsRaised) lines.push(`- ${o}`);
      lines.push("");
    }
    if (s.whatWorked.length) {
      lines.push("מה עבד");
      for (const w of s.whatWorked) lines.push(`- ${w}`);
      lines.push("");
    }
    if (s.whatCouldBeBetter.length) {
      lines.push("מה ניתן לשפר");
      for (const w of s.whatCouldBeBetter) lines.push(`- ${w}`);
      lines.push("");
    }
    if (s.nextStepPlaybook.length) {
      lines.push("צעדים להמשך");
      for (const n of s.nextStepPlaybook) lines.push(`- ${n}`);
      lines.push("");
    }
    lines.push("הודעת המשך מומלצת");
    lines.push(s.recommendedFollowUpMessage);
  } else if (s.outcome === "lost") {
    lines.push("ניתוח שורש");
    lines.push(s.rootCauseAnalysis);
    lines.push("");
    if (s.objectionsNotHandled.length) {
      lines.push("התנגדויות שלא טופלו");
      for (const o of s.objectionsNotHandled) lines.push(`- ${o}`);
      lines.push("");
    }
    if (s.coachingPoints.length) {
      lines.push("נקודות לאימון");
      for (const c of s.coachingPoints) lines.push(`- ${c}`);
      lines.push("");
    }
    lines.push("זווית לחזרה");
    lines.push(s.winBackAngle);
  } else {
    if (s.whatWorked.length) {
      lines.push("מה עבד");
      for (const w of s.whatWorked) lines.push(`- ${w}`);
      lines.push("");
    }
    if (s.keyMomentsToReplicate.length) {
      lines.push("רגעי מפתח לשחזור");
      for (const k of s.keyMomentsToReplicate) lines.push(`- ${k}`);
      lines.push("");
    }
    if (s.onboardingHandoffNotes.length) {
      lines.push("הערות העברה ל-onboarding");
      for (const o of s.onboardingHandoffNotes) lines.push(`- ${o}`);
    }
  }

  return lines.join("\n").trimEnd();
}

// ---------- Anthropic call ----------

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";
const MAX_TRANSCRIPT_CHARS = 80_000;
const MIN_TRANSCRIPT_CHARS = 500;
const MIN_DURATION_MS = 15 * 60 * 1000;

export const SUMMARY_MIN_DURATION_MS = MIN_DURATION_MS;
export const MODEL_ID = MODEL;

const inFlight = new Map<string, true>();

export function acquireSummaryLock(sessionId: string): boolean {
  if (inFlight.has(sessionId)) return false;
  inFlight.set(sessionId, true);
  return true;
}
export function releaseSummaryLock(sessionId: string): void {
  inFlight.delete(sessionId);
}

export type ChunkInput = { text: string; startMs: number; endMs: number; speaker: string };

export function lastChunkEndMs(chunks: ChunkInput[]): number {
  if (chunks.length === 0) return 0;
  return chunks.reduce((m, c) => (c.endMs > m ? c.endMs : m), 0);
}

function speakerLabel(kind: SummaryKind, speaker: string): string {
  if (kind === "meeting") return speaker === "user" ? "מאמן" : "לקוח";
  return speaker === "user" ? "איש מכירות" : "לקוח";
}

export function buildTranscriptText(
  kind: SummaryKind,
  chunks: ChunkInput[]
): { text: string; truncated: boolean } {
  const lines = chunks.map((c) => `${speakerLabel(kind, c.speaker)}: ${c.text.trim()}`);
  let text = lines.join("\n");
  let truncated = false;
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text = text.slice(text.length - MAX_TRANSCRIPT_CHARS);
    text += "\n[התמלול נחתך לצורך עיבוד]";
    truncated = true;
  }
  return { text, truncated };
}

const MEETING_SYSTEM = `אתה מסכם פגישת עבודה עם לקוח בעברית. הסיכום נשלח ישירות ללקוח — שמור על טון מקצועי, עובדתי וניטרלי. השתמש בשמות המשתתפים כפי שנאמרו. הסק את התאריך והפורמט מההקשר אם לא צוינו במפורש. החזר JSON בלבד התואם לסכמה — ללא טקסט נוסף, ללא markdown fences.

סכמה:
{
  "date": string,
  "participants": string[],
  "durationMinutes": number,
  "format": string,
  "executiveSummary": string,
  "topics": [{ "title": string, "body": string }],
  "tasks": [{ "description": string, "owner": string }],
  "openQuestions": [{ "question": string, "context": string, "owner": string }],
  "keyInsights": string[]
}`;

const SALES_SYSTEM = `אתה מאמן מכירות בכיר המנתח תמלול שיחת מכירה בעברית. תחילה קבע את התוצאה: "pending" (טרם נסגר), "lost" (לא נסגר), או "closed" (נסגר). לאחר מכן הפק ניתוח אימוני מותאם לתוצאה. היה ישיר וספציפי — צטט רגעים מהתמלול. כל שדות הטקסט בעברית בלבד. החזר JSON בלבד התואם לסכמה — ללא טקסט נוסף, ללא markdown fences.

סכמה משותפת: { "outcome": "pending"|"lost"|"closed", "outcomeReason": string, "summary": string, ...שדות לפי outcome }

אם outcome = "pending": הוסף "prospectProfile" (string), "painPoints" (string[]), "objectionsRaised" (string[]), "whatWorked" (string[]), "whatCouldBeBetter" (string[]), "nextStepPlaybook" (string[]), "recommendedFollowUpMessage" (string).

אם outcome = "lost": הוסף "rootCauseAnalysis" (string), "objectionsNotHandled" (string[]), "coachingPoints" (string[]), "winBackAngle" (string).

אם outcome = "closed": הוסף "whatWorked" (string[]), "keyMomentsToReplicate" (string[]), "onboardingHandoffNotes" (string[]).`;

function systemFor(kind: SummaryKind): string {
  return kind === "meeting" ? MEETING_SYSTEM : SALES_SYSTEM;
}

function userPromptFor(
  kind: SummaryKind,
  transcript: string,
  ctx: { clientName: string | null; startedAt: Date; durationMs: number }
): string {
  const header = [
    ctx.clientName ? `שם לקוח: ${ctx.clientName}` : null,
    `תאריך התחלה: ${ctx.startedAt.toISOString()}`,
    `משך משוער: ${Math.round(ctx.durationMs / 60000)} דקות`,
  ]
    .filter(Boolean)
    .join("\n");
  const intro =
    kind === "meeting"
      ? "להלן תמלול הפגישה. הפק את הסיכום על פי הסכמה."
      : "להלן תמלול שיחת המכירה. נתח אותו על פי הסכמה.";
  return `${header}\n\n${intro}\n\n--- תמלול ---\n${transcript}`;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(body);
}

export type SummarizeResult =
  | { kind: "meeting"; json: MeetingSummary; markdown: string }
  | { kind: "sales_call"; json: SalesCallSummary; markdown: string };

export class SummarizeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function summarizeRecording(opts: {
  kind: SummaryKind;
  chunks: ChunkInput[];
  clientName: string | null;
  startedAt: Date;
  title: string | null;
}): Promise<SummarizeResult> {
  const { kind, chunks, clientName, startedAt, title } = opts;

  const lastMs = lastChunkEndMs(chunks);
  if (lastMs < MIN_DURATION_MS) {
    throw new SummarizeError(422, "התמלול קצר מ-15 דקות");
  }

  const { text: transcript } = buildTranscriptText(kind, chunks);
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    throw new SummarizeError(422, "התמלול קצר מדי לייצור סיכום");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new SummarizeError(500, "ANTHROPIC_API_KEY not set");
  const anthropic = new Anthropic({ apiKey });

  const system = systemFor(kind);
  const user = userPromptFor(kind, transcript, {
    clientName,
    startedAt,
    durationMs: lastMs,
  });

  async function callOnce(extraStrictness: boolean): Promise<unknown> {
    const sysText = extraStrictness
      ? `${system}\n\nחובה: JSON תקין בלבד. ללא טקסט מקדים, ללא הסברים, ללא markdown fences.`
      : system;
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [
        { type: "text", text: sysText, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: user }],
    });
    const block = resp.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new SummarizeError(500, "תשובה ריקה מהמודל");
    }
    return extractJson(block.text);
  }

  async function callAndValidate<T>(schema: {
    safeParse: (v: unknown) =>
      | { success: true; data: T }
      | { success: false };
  }): Promise<T> {
    let parsed: unknown;
    try {
      parsed = await callOnce(false);
    } catch {
      parsed = await callOnce(true);
    }
    const r1 = schema.safeParse(parsed);
    if (r1.success) return r1.data;
    const retry = await callOnce(true);
    const r2 = schema.safeParse(retry);
    if (r2.success) return r2.data;
    throw new SummarizeError(500, "שגיאה בייצור סיכום");
  }

  if (kind === "meeting") {
    const data = await callAndValidate(MeetingSummarySchema);
    return { kind: "meeting", json: data, markdown: renderMeetingMarkdown(data, title) };
  } else {
    const data = await callAndValidate(SalesCallSummarySchema);
    return { kind: "sales_call", json: data, markdown: renderSalesCallMarkdown(data) };
  }
}

# Recording AI Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-button "Generate summary" flow (meeting / sales call) on the recording detail page, gated by ≥ 15 min of transcript, producing Hebrew RTL summaries via Claude Opus 4.7.

**Architecture:** Extend `TranscriptSession` with summary metadata fields. New module `src/lib/ai/summarize-recording.ts` owns prompts, Zod schemas, renderers, and the Anthropic call. New route `POST /api/recordings/[id]/summarize` validates, locks, calls the lib, persists. The existing "ניתוח AI" section on `recording-client.tsx` is replaced with the new UI.

**Tech Stack:** Next.js 15 App Router (Node runtime), Prisma + Postgres, `@anthropic-ai/sdk` (Claude Opus 4.7), Zod for validation. No test suite exists in this project — verification per task is `pnpm typecheck` + manual smoke on `pnpm dev`.

**Spec:** [docs/superpowers/specs/2026-05-25-recording-ai-summaries-design.md](../specs/2026-05-25-recording-ai-summaries-design.md)

---

## File map

- **Modify** `prisma/schema.prisma` — add 4 fields to `TranscriptSession`.
- **Create** `src/lib/ai/summarize-recording.ts` — prompts, Zod schemas, renderers, Anthropic call, in-memory per-session lock.
- **Create** `src/app/api/recordings/[id]/summarize/route.ts` — POST handler.
- **Modify** `src/app/sales/recordings/[id]/page.tsx` — select & pass new summary fields.
- **Modify** `src/app/sales/recordings/[id]/recording-client.tsx` — replace the "ניתוח AI" section's button cluster with the two-button row + regenerate link; render the summary from new fields.

---

## Task 1: Add Prisma fields to `TranscriptSession`

**Files:**
- Modify: `prisma/schema.prisma` (the `model TranscriptSession` block, around line 353)

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, inside `model TranscriptSession`, add these four fields directly after the existing `transcribeError String?` line:

```prisma
  summaryKind         String?
  summaryJson         Json?
  summaryGeneratedAt  DateTime?
  summaryModel        String?
```

- [ ] **Step 2: Push schema and regenerate client**

Run:
```bash
pnpm db:push && pnpm db:generate
```

Expected: Prisma reports the four new columns added to `TranscriptSession`; client regenerated with no errors.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: passes (no new code yet — just confirms the generated client still compiles).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add summaryKind/summaryJson/summaryGeneratedAt/summaryModel to TranscriptSession"
```

---

## Task 2: Create the summarizer library — schemas and renderers

**Files:**
- Create: `src/lib/ai/summarize-recording.ts`

This task creates the file with the Zod schemas and pure renderers. The Anthropic call comes in Task 3 so this can be reviewed in isolation.

- [ ] **Step 1: Create the file with schemas, types, and renderers**

Create `src/lib/ai/summarize-recording.ts` with:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/summarize-recording.ts
git commit -m "feat(ai): summary schemas and renderers for meeting/sales-call"
```

---

## Task 3: Add Anthropic call, transcript prep, and per-session lock

**Files:**
- Modify: `src/lib/ai/summarize-recording.ts`

- [ ] **Step 1: Append the runtime helpers and main entry point**

Append to `src/lib/ai/summarize-recording.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";
const MAX_TRANSCRIPT_CHARS = 80_000;
const MIN_TRANSCRIPT_CHARS = 500;
const MIN_DURATION_MS = 15 * 60 * 1000;

export const SUMMARY_MIN_DURATION_MS = MIN_DURATION_MS;

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

  const client = new Anthropic();
  const system = systemFor(kind);
  const user = userPromptFor(kind, transcript, {
    clientName,
    startedAt,
    durationMs: lastMs,
  });

  async function callOnce(extraStrictness: boolean): Promise<unknown> {
    const sysBlocks = [
      {
        type: "text" as const,
        text: extraStrictness
          ? `${system}\n\nחובה: JSON תקין בלבד. ללא טקסט מקדים, ללא הסברים, ללא markdown fences.`
          : system,
        cache_control: { type: "ephemeral" as const },
      },
    ];
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: sysBlocks,
      messages: [{ role: "user", content: user }],
    });
    const block = resp.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new SummarizeError(500, "תשובה ריקה מהמודל");
    }
    return extractJson(block.text);
  }

  let parsedJson: unknown;
  try {
    parsedJson = await callOnce(false);
  } catch {
    parsedJson = await callOnce(true);
  }

  if (kind === "meeting") {
    const result = MeetingSummarySchema.safeParse(parsedJson);
    if (!result.success) {
      const retry = await callOnce(true);
      const result2 = MeetingSummarySchema.safeParse(retry);
      if (!result2.success) throw new SummarizeError(500, "שגיאה בייצור סיכום");
      return {
        kind: "meeting",
        json: result2.data,
        markdown: renderMeetingMarkdown(result2.data, title),
      };
    }
    return {
      kind: "meeting",
      json: result.data,
      markdown: renderMeetingMarkdown(result.data, title),
    };
  } else {
    const result = SalesCallSummarySchema.safeParse(parsedJson);
    if (!result.success) {
      const retry = await callOnce(true);
      const result2 = SalesCallSummarySchema.safeParse(retry);
      if (!result2.success) throw new SummarizeError(500, "שגיאה בייצור סיכום");
      return {
        kind: "sales_call",
        json: result2.data,
        markdown: renderSalesCallMarkdown(result2.data),
      };
    }
    return {
      kind: "sales_call",
      json: result.data,
      markdown: renderSalesCallMarkdown(result.data),
    };
  }
}

export const MODEL_ID = MODEL;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/summarize-recording.ts
git commit -m "feat(ai): summarizeRecording Anthropic call with lock and retry"
```

---

## Task 4: Create the `POST /api/recordings/[id]/summarize` route

**Files:**
- Create: `src/app/api/recordings/[id]/summarize/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  summarizeRecording,
  acquireSummaryLock,
  releaseSummaryLock,
  SummarizeError,
  MODEL_ID,
} from "@/lib/ai/summarize-recording";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ kind: z.enum(["meeting", "sales_call"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "kind חייב להיות meeting או sales_call" }, { status: 400 });
  }
  const { kind } = parsed.data;

  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    include: {
      client: { select: { name: true } },
      chunks: {
        where: { isFinal: true },
        orderBy: [{ startMs: "asc" }, { createdAt: "asc" }],
        select: { text: true, startMs: true, endMs: true, speaker: true },
      },
    },
  });
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  if (!acquireSummaryLock(id)) {
    return NextResponse.json({ error: "כבר רץ סיכום" }, { status: 409 });
  }

  try {
    const result = await summarizeRecording({
      kind,
      chunks: session.chunks,
      clientName: session.client?.name ?? null,
      startedAt: session.startedAt,
      title: session.title,
    });

    const updated = await prisma.transcriptSession.update({
      where: { id },
      data: {
        summary: result.markdown,
        summaryJson: result.json as object,
        summaryKind: result.kind,
        summaryGeneratedAt: new Date(),
        summaryModel: MODEL_ID,
      },
      select: {
        summary: true,
        summaryJson: true,
        summaryKind: true,
        summaryGeneratedAt: true,
      },
    });

    return NextResponse.json({
      summary: updated.summary,
      summaryJson: updated.summaryJson,
      summaryKind: updated.summaryKind,
      summaryGeneratedAt: updated.summaryGeneratedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof SummarizeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[summarize] failed", err);
    return NextResponse.json({ error: "שגיאה בייצור סיכום" }, { status: 500 });
  } finally {
    releaseSummaryLock(id);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/recordings/[id]/summarize/route.ts
git commit -m "feat(api): POST /api/recordings/[id]/summarize"
```

---

## Task 5: Pass new summary fields from the page to the client

**Files:**
- Modify: `src/app/sales/recordings/[id]/page.tsx`

- [ ] **Step 1: Add `endMs` to chunks select and pass new props**

In `src/app/sales/recordings/[id]/page.tsx`, update the `chunks` select inside the `prisma.transcriptSession.findUnique` call to also include `endMs`:

```ts
chunks: {
  where: { isFinal: true },
  orderBy: [{ startMs: "asc" }, { createdAt: "asc" }],
  select: { id: true, text: true, startMs: true, endMs: true, speaker: true },
},
```

Then update the `<RecordingClient ... />` props block. Replace the existing `chunks={...}` line and add the new summary props (place them right after the existing `summary={session.summary}` line):

```tsx
summary={session.summary}
summaryKind={session.summaryKind}
summaryGeneratedAt={session.summaryGeneratedAt?.toISOString() ?? null}
```

And change the chunks mapping to include `endMs`:

```tsx
chunks={session.chunks.map((c) => ({
  id: c.id,
  text: c.text,
  startMs: c.startMs,
  endMs: c.endMs,
  speaker: c.speaker,
}))}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: fails — `RecordingClient` doesn't accept `summaryKind`/`summaryGeneratedAt` yet, and its `Chunk` type lacks `endMs`. That is expected and will be fixed in Task 6.

- [ ] **Step 3: Do NOT commit yet** — leave staged. Task 6 makes the client compile and they should land together so `main` stays green.

---

## Task 6: Replace the "ניתוח AI" section with the meeting/sales-call UX

**Files:**
- Modify: `src/app/sales/recordings/[id]/recording-client.tsx`

- [ ] **Step 1: Extend the `Chunk` type and `Props` interface**

Find the `Chunk` type (currently `{ id; text; startMs; speaker }`) and add `endMs: number`. Find the `Props` interface (around line 25 where `summary: string | null;` is declared) and add right after it:

```ts
  summaryKind: string | null;
  summaryGeneratedAt: string | null;
```

- [ ] **Step 2: Add summary-generation state and handler**

Near the existing `useState` calls at the top of the component (where `analyzing` / `analyzeNote` are defined, around line 47), add:

```ts
  const [genKind, setGenKind] = useState<null | "meeting" | "sales_call">(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [showChoices, setShowChoices] = useState<boolean>(!props.summary);

  const lastEndMs = props.chunks.reduce((m, c) => (c.endMs > m ? c.endMs : m), 0);
  const eligible = lastEndMs >= 15 * 60 * 1000;

  async function generate(kind: "meeting" | "sales_call") {
    setGenKind(kind);
    setGenError(null);
    try {
      const res = await fetch(`/api/recordings/${props.id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setGenError(data.error || "שגיאה בייצור סיכום");
        if (res.status === 409) {
          setTimeout(() => setGenError(null), 3000);
        }
        return;
      }
      setShowChoices(false);
      router.refresh();
    } catch {
      setGenError("שגיאה ברשת");
    } finally {
      setGenKind(null);
    }
  }
```

(`router` is already in scope from the existing `analyze`/`retranscribe` handlers — confirm before adding. If not in scope, add `const router = useRouter();` and `import { useRouter } from "next/navigation";` at the top.)

- [ ] **Step 3: Replace the existing "ניתוח AI" section's button row + body**

Replace the entire `<section>` block whose `<h2>` is `ניתוח AI` (currently lines ~213-237) with:

```tsx
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">סיכום AI</h2>
          <button onClick={copyTranscript} className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs">
            העתק תמלול
          </button>
        </div>

        {eligible && (showChoices || !props.summary) && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted">צור סיכום:</span>
            <button
              onClick={() => generate("meeting")}
              disabled={genKind !== null}
              className="rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {genKind === "meeting" ? "מייצר…" : "פגישה"}
            </button>
            <button
              onClick={() => generate("sales_call")}
              disabled={genKind !== null}
              className="rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {genKind === "sales_call" ? "מייצר…" : "שיחת מכירה"}
            </button>
          </div>
        )}

        {genError && <div className="text-xs text-red-500">{genError}</div>}

        {props.summary ? (
          <>
            <div className="whitespace-pre-wrap rounded-md bg-bg p-3 text-sm">{props.summary}</div>
            <div className="flex items-center gap-3 text-[11px] text-muted">
              {props.summaryKind && (
                <span>סוג: {props.summaryKind === "meeting" ? "פגישה" : "שיחת מכירה"}</span>
              )}
              {props.summaryGeneratedAt && (
                <span>נוצר: {new Date(props.summaryGeneratedAt).toLocaleString("he-IL")}</span>
              )}
              {!showChoices && (
                <button
                  onClick={() => setShowChoices(true)}
                  className="text-accent-ink hover:underline"
                >
                  צור מחדש
                </button>
              )}
            </div>
          </>
        ) : (
          eligible ? null : (
            <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted">
              סיכום AI יהיה זמין כאשר התמלול יגיע ל-15 דקות לפחות.
            </div>
          )
        )}
      </section>
```

- [ ] **Step 4: Remove the now-unused `analyze`, `analyzing`, `analyzeNote` state and handler**

Remove the existing `analyze` function (around line 62) and its associated `useState` lines for `analyzing` and `analyzeNote`. Confirm nothing else in the file still references them — if any reference remains, leave them and revisit.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: passes (Task 5's changes now compile alongside this task's).

- [ ] **Step 6: Manual smoke test**

Run: `pnpm dev`. Open a recording with a transcript ≥ 15 minutes. Confirm:
1. Two buttons "פגישה" and "שיחת מכירה" appear under "סיכום AI".
2. Click "פגישה" → spinner on that button → after generation, Hebrew summary appears with structure (`סיכום פגישה`, `תקציר מנהלים`, etc.).
3. "צור מחדש" link appears; clicking it re-shows the two-button row.
4. Click "שיחת מכירה" → output begins with `ניתוח שיחת מכירה` and `סטטוס: …`.
5. Open a recording with < 15 min of chunks → buttons do NOT appear; placeholder text shows.
6. Hit the endpoint twice rapidly with curl on the same id → second returns 409 with body `{ "error": "כבר רץ סיכום" }`.

- [ ] **Step 7: Commit**

```bash
git add src/app/sales/recordings/[id]/page.tsx src/app/sales/recordings/[id]/recording-client.tsx
git commit -m "feat(sales): meeting/sales-call AI summary UI on recording page"
```

---

## Verification (final)

After all tasks:

- [ ] `pnpm typecheck` — passes.
- [ ] `pnpm dev` — manual smoke per Task 6 Step 6 still passes end-to-end.
- [ ] `git log --oneline -7` — shows the six feature commits in order.

## Out of scope (do not implement)

- Sending the summary anywhere (email / WhatsApp).
- Streaming output.
- Persisting last-chosen kind as a user preference.
- Editing the generated summary in-place.
- Multi-language output.

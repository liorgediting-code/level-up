# Recording AI Summaries — Meeting vs Sales Call

**Date:** 2026-05-25
**Surface:** `/sales/recordings/[id]`
**Model:** `claude-opus-4-7`

## Goal

On any recording with ≥ 15 minutes of transcript, let the user generate one of two AI summaries in Hebrew:

1. **פגישה (meeting)** — client-facing meeting summary suitable for forwarding to the client, in the rich format the user already uses (executive summary → topics → tasks per owner → open questions → key insights).
2. **שיחת מכירה (sales call)** — sales-coaching analysis that first detects the call's outcome (`pending` / `lost` / `closed`) and tailors the output accordingly (next-step playbook / post-mortem / replication tips).

All output is Hebrew, RTL. Display only — no sending.

## Trigger

Gated by transcript length, not wall-clock. A session is eligible when the last `TranscriptChunk.endMs >= 15 * 60 * 1000`. The check is enforced both client-side (to show/hide the buttons) and server-side (to reject direct API calls).

## UI

On `/sales/recordings/[id]`, above the existing summary area:

- If session is eligible AND no summary yet:
  ```
  צור סיכום:  [ פגישה ]  [ שיחת מכירה ]
  ```
  Inline two-button row. Click → immediately POST and await generation. While running, both buttons disabled and a spinner replaces the clicked one. No modal, no confirmation.

- If a summary already exists:
  Render it. Below it, a small text link `צור מחדש` re-exposes the two-button row.

- If session is ineligible (< 15 min):
  Nothing rendered (no disabled buttons, no explainer — silent).

- If an in-flight generation is already running for this session (server returns 409):
  Show inline error "כבר רץ סיכום" and re-enable buttons after 3s.

## Data model

Extend `TranscriptSession` in `prisma/schema.prisma`:

```prisma
summary             String?    // existing — holds rendered Hebrew markdown
summaryKind         String?    // 'meeting' | 'sales_call'
summaryJson         Json?      // structured AI output (see schemas below)
summaryGeneratedAt  DateTime?
summaryModel        String?    // 'claude-opus-4-7'
```

Migration: additive only, no data loss. Apply via `pnpm db:push && pnpm db:generate`.

## Generation pipeline

New route: `POST /api/recordings/[id]/summarize`

```ts
runtime = 'nodejs'
maxDuration = 120

Body = { kind: 'meeting' | 'sales_call' }
```

Steps:

1. Load session + chunks (ordered by `startMs`).
2. Validate eligibility: last chunk `endMs >= 15*60*1000`. If not → 422 `{ error: 'התמלול קצר מ-15 דקות' }`.
3. Concatenate chunks into one transcript string: `"{speaker}: {text}\n"` per chunk, where `speaker` maps `user` → "מאמן" and `other` → "לקוח" for meeting, or `user` → "איש מכירות" / `other` → "לקוח" for sales_call. (Speaker labeling is for the model only — final output uses real names when known.)
4. If total chunk text < 500 chars → 422 `{ error: 'התמלול קצר מדי לייצור סיכום' }`.
5. If total > 80,000 chars, truncate to last 80,000 chars and append `[התמלול נחתך לצורך עיבוד]`.
6. Acquire in-memory per-session lock (module-level `Map<sessionId, true>`). If already held → 409 `{ error: 'כבר רץ סיכום' }`.
7. Call Claude Opus 4.7 with system prompt (kind-specific, `cache_control: ephemeral`) + user prompt (transcript + optional `client.name`).
8. Validate response with Zod against the kind-specific schema. On parse failure, retry once with stricter "JSON only — no prose, no markdown fences" instruction. On second failure → 500 `{ error: 'שגיאה בייצור סיכום' }`.
9. Render JSON → Hebrew markdown via kind-specific renderer.
10. Persist `{ summaryKind, summaryJson, summary, summaryGeneratedAt: now(), summaryModel: 'claude-opus-4-7' }`.
11. Release lock (also released in `finally`).
12. Return `{ summary, summaryJson, summaryKind, summaryGeneratedAt }`.

## Meeting schema

```ts
{
  date: string,                    // "25 במאי 2026 (יום ראשון)"
  participants: string[],
  durationMinutes: number,
  format: string,                  // "זום" | "פגישה פיזית" | "טלפון"
  executiveSummary: string,        // 2-4 sentences
  topics: Array<{ title: string, body: string }>,
  tasks: Array<{ description: string, owner: string }>,
  openQuestions: Array<{ question: string, context: string, owner: string }>,
  keyInsights: string[]
}
```

Renderer produces Hebrew markdown matching this structure (modeled on the user's example):

```
סיכום פגישה – {title or 'פגישה'}

תאריך: {date}
משתתפים: {participants joined by ', '}
משך הפגישה: ~{durationMinutes} דקות
פורמט: {format}

תקציר מנהלים
{executiveSummary}

נושאים שנדונו
1. {topics[0].title}
{topics[0].body}
...

משימות לביצוע
- {tasks[0].description} — {tasks[0].owner}
...

שאלות פתוחות
- {q.question} ({q.context}) — אחראי: {q.owner}
...

תובנות מרכזיות מהפגישה
- {keyInsights[0]}
...
```

**Empty-section omission:** any of `topics`, `tasks`, `openQuestions`, `keyInsights` whose array is empty is omitted entirely (header + body). `executiveSummary` is always rendered.

**System prompt (meeting):**
> אתה מסכם פגישת עבודה עם לקוח בעברית. הסיכום נשלח ישירות ללקוח — שמור על טון מקצועי, עובדתי וניטרלי. השתמש בשמות המשתתפים כפי שנאמרו. הסק את התאריך והפורמט מההקשר אם לא צוינו במפורש. החזר JSON בלבד התואם לסכמה.

## Sales call schema

Outcome is detected by the model in the same call:

```ts
{
  outcome: 'pending' | 'lost' | 'closed',
  outcomeReason: string,           // 1 sentence justifying the detection
  summary: string,                 // shared across outcomes
  // outcome-specific fields below — unused fields omitted from JSON entirely
}
```

**Per outcome:**

`pending`:
```ts
{
  prospectProfile: string,
  painPoints: string[],
  objectionsRaised: string[],
  whatWorked: string[],
  whatCouldBeBetter: string[],
  nextStepPlaybook: string[],         // concrete actions to advance the deal
  recommendedFollowUpMessage: string  // draft Hebrew message to send the prospect
}
```

`lost`:
```ts
{
  rootCauseAnalysis: string,
  objectionsNotHandled: string[],
  coachingPoints: string[],
  winBackAngle: string                // is there a salvage path? if no, say so
}
```

`closed`:
```ts
{
  whatWorked: string[],
  keyMomentsToReplicate: string[],
  onboardingHandoffNotes: string[]
}
```

**Renderer** produces Hebrew markdown with a consistent header block:

```
ניתוח שיחת מכירה

סטטוס: {ממתין | לא נסגר | נסגר}
{outcomeReason}

סיכום
{summary}
```

Then outcome-specific sections with Hebrew headers (e.g., `נקודות כאב`, `התנגדויות שעלו`, `מה עבד`, `מה ניתן לשפר`, `צעדים להמשך`, `הודעת המשך מומלצת`).

**System prompt (sales_call):**
> אתה מאמן מכירות בכיר המנתח תמלול שיחת מכירה בעברית. תחילה קבע את התוצאה (pending / lost / closed) על סמך מה שנאמר. לאחר מכן הפק ניתוח אימוני מותאם לתוצאה. היה ישיר וספציפי — צטט רגעים מהתמלול. כל שדות הטקסט בעברית בלבד. החזר JSON בלבד התואם לסכמה.

## Edge cases

- **No `endedAt`** — harmless; eligibility uses last chunk `endMs`.
- **Client not linked** — meeting summary still works; participants inferred from transcript.
- **Switching kind on regenerate** — allowed. Overwrites all summary fields.
- **Concurrent generation** — in-memory `Map<sessionId, true>` lock; 409 on conflict. Lock is per-process, which is fine for the single-process Next.js dev/prod runtime.
- **AI returns non-JSON / schema mismatch** — Zod validate → one retry with stricter instruction → 500 on second failure.
- **Transcript > 80k chars** — truncate to last 80k (most recent context wins) and append marker.
- **Transcript < 500 chars but duration ≥ 15min** — 422; don't waste an API call.
- **RTL rendering** — reuse the existing renderer used for the current `summary` field on the recording page. If the page renders `summary` as `whitespace-pre-wrap`, the Hebrew text with blank-line section breaks renders correctly without a markdown library.

## Files touched

- `prisma/schema.prisma` — add 4 fields to `TranscriptSession`
- `src/lib/ai/summarize-recording.ts` — new: prompts, Zod schemas, renderers, Anthropic call, in-memory lock
- `src/app/api/recordings/[id]/summarize/route.ts` — new POST route
- `src/app/sales/recordings/[id]/page.tsx` — pass new summary fields to client
- `src/app/sales/recordings/[id]/recording-client.tsx` — two-button row, regenerate link, summary rendering, fetch + refresh

## Out of scope

- Sending the summary anywhere (email/WhatsApp).
- Streaming output (synchronous, like `analyze-funnel.ts`).
- Persisting last-chosen kind as a user preference.
- Editing the generated summary in-place (copy/paste is fine for v1).
- Multi-language output (Hebrew only).

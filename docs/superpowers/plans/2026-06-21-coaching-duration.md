# Coaching Duration Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each client record agreed coaching months and have the app automatically show a "הסתיים" badge when that window (from `createdAt`) has elapsed — derived at read time, no archiving.

**Architecture:** Add one nullable `coachingMonths` field to `Client`. A pure helper (`coachingStatus`) derives end date / months-left / finished from `createdAt + coachingMonths`. The portfolio page edits the field via the existing PATCH route and shows a summary + badge; the clients list shows a finished badge. Nothing is written to the DB automatically.

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL), Zod, TypeScript, Tailwind, Hebrew RTL.

**Note on testing:** This repo has no test framework. Verification is `pnpm typecheck` plus, for the pure helper, a throwaway `node -e` sanity check. Do NOT add jest/vitest.

---

### Task 1: Add `coachingMonths` to the schema

**Files:**
- Modify: `prisma/schema.prisma` (the `Client` model, around line 16)

- [ ] **Step 1: Add the field**

In `model Client`, add `coachingMonths` next to the other optional numeric fields (after `salesMeetingsTarget Int?` on line 16):

```prisma
  salesMeetingsTarget Int?
  coachingMonths      Int?     // מספר חודשי הליווי שנסגרו עם הלקוח
  liorRevenueSharePct Float?   // אחוז חלקו של ליאור מההכנסה
```

- [ ] **Step 2: Push and regenerate**

Run: `pnpm db:push && pnpm db:generate`
Expected: schema applied, Prisma Client regenerated, no errors. The field is nullable so existing rows are unaffected.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(clients): add coachingMonths field to Client"
```

---

### Task 2: Create the `coachingStatus` helper

**Files:**
- Create: `src/lib/clients/coaching.ts`

- [ ] **Step 1: Write the helper**

```ts
export type CoachingStatus = {
  endsAt: Date;
  monthsLeft: number; // whole months remaining, clamped at 0
  finished: boolean;
};

/**
 * Derives coaching-window status from the client's start date (createdAt)
 * and the agreed number of coaching months. Returns null when no duration
 * is set. Pure — `now` is injectable for testing.
 */
export function coachingStatus(
  createdAt: Date,
  coachingMonths: number | null | undefined,
  now: Date = new Date(),
): CoachingStatus | null {
  if (coachingMonths == null || coachingMonths <= 0) return null;

  const endsAt = new Date(createdAt);
  // Add months, clamping day overflow (e.g. Jan 31 + 1mo -> Feb 28/29).
  const targetMonth = endsAt.getMonth() + coachingMonths;
  const day = endsAt.getDate();
  endsAt.setDate(1);
  endsAt.setMonth(targetMonth);
  const lastDay = new Date(endsAt.getFullYear(), endsAt.getMonth() + 1, 0).getDate();
  endsAt.setDate(Math.min(day, lastDay));

  const finished = now.getTime() >= endsAt.getTime();

  // Whole months remaining (ceil so a partial final month still shows as 1).
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375;
  const monthsLeft = finished
    ? 0
    : Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / msPerMonth));

  return { endsAt, monthsLeft, finished };
}
```

- [ ] **Step 2: Sanity-check the math with a throwaway node script**

Run:
```bash
node --input-type=module -e '
import { coachingStatus } from "./src/lib/clients/coaching.ts";
' 2>/dev/null || npx tsx -e '
import { coachingStatus } from "./src/lib/clients/coaching.ts";
const start = new Date("2026-01-31T00:00:00Z");
// 3 months from Jan 31 should clamp to Apr 30.
const a = coachingStatus(start, 3, new Date("2026-02-15T00:00:00Z"));
console.log("ends", a.endsAt.toISOString().slice(0,10), "left", a.monthsLeft, "finished", a.finished);
// after end -> finished, 0 left
const b = coachingStatus(start, 3, new Date("2026-06-01T00:00:00Z"));
console.log("finished", b.finished, "left", b.monthsLeft);
// null cases
console.log("null0", coachingStatus(start, 0), "nullNull", coachingStatus(start, null));
'
```
Expected output:
```
ends 2026-04-30 left 3 finished false
finished true left 0
null0 null nullNull null
```
If `tsx` is unavailable, transpile mentally / trust typecheck — the assertions above describe the required behavior. Do NOT add a test framework.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/clients/coaching.ts
git commit -m "feat(clients): add coachingStatus derived helper"
```

---

### Task 3: Accept `coachingMonths` in the client PATCH route

**Files:**
- Modify: `src/app/api/clients/[id]/route.ts:8-16` (the Zod `Body`)

- [ ] **Step 1: Extend the Zod body**

Add the field to `Body` (after `salesMeetingsTarget` on line 12):

```ts
const Body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
  coachingMonths: z.number().int().min(0).nullable().optional(),
  liorRevenueSharePct: z.number().min(0).max(100).nullable().optional(),
  liorExpenseSharePct: z.number().min(0).max(100).nullable().optional(),
  endedAt: z.union([z.string(), z.null()]).optional(),
});
```

No other change: `coachingMonths` flows through the existing `...rest` spread (line 24) into `prisma.client.update`. `0` and `null` both clear/zero it.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/[id]/route.ts
git commit -m "feat(clients): accept coachingMonths in PATCH route"
```

---

### Task 4: Pass `createdAt` + `coachingMonths` into the portfolio client

**Files:**
- Modify: `src/app/clients/[id]/page.tsx:14-22` (the `findUnique`) and `:91-106` (the `<ClientPortfolio>` props)

- [ ] **Step 1: Ensure the fields are selected**

The current `findUnique` uses `include` (returns all scalar columns), so `createdAt` and `coachingMonths` are already present on `client`. No query change needed. Confirm by reading lines 14-22.

- [ ] **Step 2: Pass the two new props to `<ClientPortfolio>`**

In the `<ClientPortfolio ... />` JSX (starts line 91), add after `clientId={client.id}`:

```tsx
        clientId={client.id}
        createdAt={client.createdAt.toISOString()}
        coachingMonths={client.coachingMonths}
```

- [ ] **Step 3: Typecheck (expected to fail until Task 5)**

Run: `pnpm typecheck`
Expected: FAIL — `ClientPortfolio` does not yet accept `createdAt` / `coachingMonths`. This is fixed in Task 5. (If you are batching Task 4+5, run typecheck after Task 5 instead.)

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/[id]/page.tsx
git commit -m "feat(clients): pass createdAt and coachingMonths to portfolio"
```

---

### Task 5: Edit field + summary/badge in the portfolio client

**Files:**
- Modify: `src/app/clients/[id]/portfolio-client.tsx`

Read the file first to match the existing prop type, the revenue/expense-share input pattern, and the PATCH+`router.refresh()` save pattern. Mirror that pattern exactly — same input styling, same save handler shape.

- [ ] **Step 1: Add the two props to the component's props type**

Find the props type/destructure for the component (where `clientId`, `liorRevenueSharePct`, `liorExpenseSharePct` are declared) and add:

```tsx
  createdAt: string;
  coachingMonths: number | null;
```

Destructure them alongside the existing props.

- [ ] **Step 2: Add a "חודשי ליווי" numeric input next to the share inputs**

Following the exact pattern of the existing `liorRevenueSharePct` input (local state + onChange + a save that PATCHes and calls `router.refresh()`), add:

```tsx
<label className="flex flex-col gap-1 text-sm">
  <span className="text-muted">חודשי ליווי</span>
  <input
    type="number"
    min={0}
    inputMode="numeric"
    className="<same className the sibling inputs use>"
    value={coachingMonthsInput}
    onChange={(e) => setCoachingMonthsInput(e.target.value)}
    onBlur={saveCoachingMonths}
  />
</label>
```

Where `coachingMonthsInput` is `useState(coachingMonths?.toString() ?? "")` and:

```tsx
async function saveCoachingMonths() {
  const raw = coachingMonthsInput.trim();
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isInteger(value) || value < 0)) return;
  const res = await fetch(`/api/clients/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coachingMonths: value }),
  });
  if (!res.ok) {
    alert("שמירת חודשי הליווי נכשלה");
    return;
  }
  router.refresh();
}
```

(If the existing share inputs save via a shared handler / save button rather than onBlur, follow THAT pattern instead — match the file, don't introduce a new save style.)

- [ ] **Step 3: Add the read-only summary line + state badge**

Import the helper at the top:

```tsx
import { coachingStatus } from "@/lib/clients/coaching";
```

Compute and render near the coaching input:

```tsx
{(() => {
  const cs = coachingMonths != null ? coachingStatus(new Date(createdAt), coachingMonths) : null;
  if (!cs) return null;
  const fmt = (d: Date) =>
    d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span>
        תחילת ליווי: {fmt(new Date(createdAt))} · {coachingMonths} חודשים · מסתיים {fmt(cs.endsAt)}
      </span>
      {cs.finished ? (
        <span className="rounded px-1.5 py-0.5 text-bad ring-1 ring-bad/40">הסתיים</span>
      ) : (
        <span className="rounded px-1.5 py-0.5 text-good ring-1 ring-good/40">נותרו {cs.monthsLeft} חודשים</span>
      )}
    </div>
  );
})()}
```

Use whatever the file's existing badge/color classes are (`text-bad` / `text-good` are used elsewhere in this codebase, e.g. `portfolio-client.tsx:394`). Match the surrounding style.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/[id]/portfolio-client.tsx
git commit -m "feat(clients): coaching months input + status badge on portfolio"
```

---

### Task 6: "הסתיים" badge in the clients list

**Files:**
- Modify: `src/app/clients/page.tsx`

Read the file first. The query is around lines 20-30; the name cell is rendered around line 70-90.

- [ ] **Step 1: Ensure `createdAt` and `coachingMonths` are available per row**

The list `findMany` likely selects specific fields. If it uses `select`, add `createdAt: true` and `coachingMonths: true`. If it returns full rows (no `select`), they are already present — confirm by reading the query.

- [ ] **Step 2: Import the helper**

```tsx
import { coachingStatus } from "@/lib/clients/coaching";
```

- [ ] **Step 3: Render the badge next to the client name**

Where the client name is rendered in the row (near line 70-90), add beside it:

```tsx
{coachingStatus(c.createdAt, c.coachingMonths)?.finished && (
  <span className="rounded px-1.5 py-0.5 text-xs text-bad ring-1 ring-bad/40">הסתיים</span>
)}
```

`c.createdAt` is a `Date` here (server component, raw Prisma row) — pass it directly. If the row has been mapped to ISO strings, wrap with `new Date(c.createdAt)`. Confirm which by reading the surrounding code.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/page.tsx
git commit -m "feat(clients): show finished badge in clients list"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Run the app**

Run: `pnpm dev`

- [ ] **Step 2: Verify the flow**

1. Open a client portfolio (`/clients/[id]`). Enter `1` in "חודשי ליווי", blur/save.
2. Confirm the summary line shows start date, `1 חודשים`, and an end date one month after the client's `createdAt`.
3. If `createdAt` is older than the entered months, confirm the **"הסתיים"** (red) badge appears; otherwise confirm **"נותרו N חודשים"** (green).
4. Go to `/clients` and confirm a finished client shows the small "הסתיים" badge next to its name, while still appearing in the active list (not moved to past).
5. Clear the field (empty) and save → summary/badges disappear.

- [ ] **Step 3: Final typecheck**

Run: `pnpm typecheck`
Expected: PASS.

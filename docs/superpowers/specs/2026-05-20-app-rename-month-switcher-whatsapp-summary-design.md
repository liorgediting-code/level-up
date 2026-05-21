# App Rename + Home Month Switcher + Meeting WhatsApp Summary — Design

**Date:** 2026-05-20
**Status:** Approved (brainstorming) — pending plan

A bundled small-features spec covering three independent UI changes that share the property of being one-day-each and touching the existing shell + home dashboard + sales workspace. Larger asks from the same conversation (quarterly/yearly planning system; call recordings + transcription + AI analysis) are deferred to separate specs.

## A. App rename: "ASTRAL" → "לבל אפ" with subtitle

The product is rebranded to `לבל אפ` (short logo word) with the tagline `סוכנות שיווק ואימון מכירות`.

### Files

| File | Line | Change |
|---|---|---|
| `src/app/_shell/app-shell.tsx` | 32 | Replace `<div className="text-base font-bold tracking-tight">ASTRAL</div>` with a two-line block: `לבל אפ` (existing bold class) above `<div className="text-[10px] text-muted leading-tight">סוכנות שיווק ואימון מכירות</div>`. Wrap in a flex column with `gap-0.5`. |
| `src/app/layout.tsx` | 15 | `title: "לבל אפ — סוכנות שיווק ואימון מכירות"` |
| `src/lib/crm/notify.ts` | 29 | `"לבל אפ CRM <onboarding@resend.dev>"` (default; env override still honored via `RESEND_FROM`) |

### Out of scope

The `<h1>סקירת סוכנות</h1>` in `src/app/page.tsx:137` is a page heading, not the app name — left untouched.

---

## B. Month switcher on home dashboard

The home page (`src/app/page.tsx`) currently aggregates several "this month" metrics by calling `startOfMonth()`. The user wants to navigate backwards (and forwards) through months to see historical agency activity and how many clients were active in each.

### URL state

A new query parameter `?m=YYYY-MM` controls the selected month. Absent param ⇒ current month. The page becomes `async function OverviewPage({ searchParams })`.

### New utility — `src/lib/utils.ts`

Add `monthRange(monthKey?: string)`:

- Parses `YYYY-MM`. On invalid/missing input, falls back to current month.
- Returns `{ start: Date, end: Date, label: string, key: string, isCurrent: boolean }` where `end` is the first day of the following month (used with `lt:` in Prisma).
- `label` uses Hebrew month + year, e.g. `"מאי 2026"`.

The existing `startOfMonth()` / `monthLabel()` helpers stay (other surfaces still use them).

### New client component — `src/app/_shell/month-switcher.tsx`

Props: `{ monthKey: string; label: string; isCurrent: boolean }`.

Renders three controls in a single horizontal group, RTL-friendly:

- `‹` previous-month button
- bold month label
- `›` next-month button
- `[היום]` reset button — visible only when `!isCurrent`

Each button computes the target `?m=` value, calls `router.push(...)` then `router.refresh()`. Disabled state on next button when target month is in the future is **not** required (forward navigation to empty months is allowed — they'll simply show zeros).

### Home page changes — `src/app/page.tsx`

1. Read `searchParams.m`, call `monthRange(m)` → use `start` and `end` everywhere the file currently uses `monthStart`.
2. Replace `monthLabel()` calls in the header / agency-section with the resolved `label`.
3. Replace the static "פעילות {monthLabel()}" subtitle and the "{monthLabel()}" in the agency section with the `<MonthSwitcher />` component rendered in the header area.
4. Convert range queries from `{ gte: monthStart }` to `{ gte: start, lt: end }`:
   - `leadsThisMonth` (rename variable to `leadsInMonth`)
   - `agencyStats` aggregate
   - `agencyCampaigns.stats` where clause
5. **Active-clients-in-month** semantics. Today the `clients` query uses `{ endedAt: null }`. Change to:
   ```
   where: {
     createdAt: { lt: end },
     OR: [{ endedAt: null }, { endedAt: { gte: start } }],
   }
   ```
   This makes the "לקוחות פעילים" KPI and the "התקדמות לקוחות" list reflect the chosen month. For the current month this is equivalent to the existing behavior. `activeClients` is the count of the returned rows.
6. The "לידים החודש" KPI sub-text continues to read `סה״כ במערכת {leadsTotal}` (total is not month-scoped).

### Out of scope

- Marketing dashboard per-client (`/clients/[id]/marketing/dashboard`) — already has its own range picker; untouched.
- CRM stats (`/crm`) — not month-scoped today, no change.

---

## C. WhatsApp-ready meeting summary

Each meeting carries the user's free-text notes across several fields (`notes`, `outcome`, `whatWorked`, `whatToImprove`, `attendees`). They want a single button that produces a Hebrew text block they can copy and paste into WhatsApp.

### Trigger

Inside the `MeetingDrawer` defined in `src/app/clients/[id]/sales/sales-client.tsx` (function at line ~201), add a button labeled `📋 סיכום לוואטסאפ` in the drawer's footer/action area.

Enabled when `meeting.status === "held"` OR any of the summary fields are non-empty. Disabled (or hidden) otherwise — there's nothing to summarize before a meeting takes place.

### New client component — `src/components/whatsapp-summary-modal.tsx`

Props:

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  meeting: {
    title: string;
    scheduledAt: string | null;
    attendees: string;
    notes: string;
    outcome: string;
    whatWorked: string;
    whatToImprove: string;
  };
};
```

Behavior on open:

1. Fetch open sales tasks for the client: `GET /api/clients/{clientId}/tasks?space=sales&status=open` (verify route accepts these query params during implementation; if not, extend it minimally — read-only filter, no breaking changes).
2. Build a formatted text block (see "Format" below).
3. Render preview inside a `<pre dir="rtl" className="whitespace-pre-wrap ...">` so the user sees exactly what will land in WhatsApp.
4. Two footer buttons: `[העתק לקליפבורד]` and `[סגור]`.
5. Copy uses `navigator.clipboard.writeText(text)`. On success, swap the button label to `הועתק ✓` for 2 seconds. On failure (or when `navigator.clipboard` is undefined — e.g. http context), fall back to a hidden `<textarea>` + `document.execCommand('copy')`.

### Format

```
📋 סיכום פגישה — {clientName}
🗓 {dateHebrew}{ " · 👥 " + attendees if attendees }

📝 הערות
{notes}

✅ מה עבד טוב
{whatWorked}

🔧 מה לשפר
{whatToImprove}

🎯 תוצאה
{outcome}

📌 משימות פתוחות
• {task.title}{ " (עד " + dueDateHebrew + ")" if dueDate }
• ...
```

Section-omission rules:

- If `notes` is blank → omit the `📝 הערות` section (header + body).
- Same for `whatWorked`, `whatToImprove`, `outcome`.
- If open-tasks array is empty → omit `📌 משימות פתוחות`.
- If `attendees` is blank → just `🗓 {dateHebrew}` without the trailing ` · 👥 ...`.
- If `scheduledAt` is `null` (unscheduled placeholder) → use the title alone in the date line: `🗓 {meeting.title}` — but in practice this branch shouldn't trigger because the button is disabled for unheld unscheduled meetings.

Date formatting: `new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "long", year: "numeric" }).format(d)` → e.g. `"20 במאי 2026"`.

Task due dates: same locale, short form `{ day: "2-digit", month: "2-digit" }`.

### Server data flow

No server changes required for the summary itself — everything is composed client-side from data already in the drawer plus the tasks fetch. The tasks fetch should not fail silently: if it errors, render the rest of the summary and a small inline note `(לא נטענו משימות)` in place of the tasks section.

### Out of scope

- Direct deep-link to WhatsApp (`wa.me/...`) — explicitly rejected during brainstorming in favor of copy-paste preview.
- Sharing via web share API on mobile — not requested; revisit later.
- Persisting "summary copied at" timestamp — no use case yet.

---

## Risks and considerations

- **Month-switcher and clients list semantics shift.** When viewing a past month, the "התקדמות לקוחות" list will now include clients who have since been ended. Users browsing history might be surprised when a past-month view shows a client they archived. The fix in B.5 is intentional — without it, the count and the list disagree.
- **Tasks endpoint shape.** The existing `/api/clients/[id]/tasks` may or may not accept `space` / `status` query filters today. If not, the implementer should either (a) extend the GET handler with `Body.safeParse`-style query parsing or (b) filter client-side after fetching all tasks for the client. Either is fine for a one-user app; prefer (a) for clarity.
- **RTL emojis in `<pre>`.** Emojis at the start of lines in RTL contexts can shift around. Manual QA: open the modal, copy, paste into WhatsApp Web, confirm the visual order matches the preview.
- **Logo subtitle wrap.** The shell sidebar is narrow; `סוכנות שיווק ואימון מכירות` at `text-[10px]` should fit on one line, but if it wraps, switch to `truncate` with a tooltip rather than allowing two lines.

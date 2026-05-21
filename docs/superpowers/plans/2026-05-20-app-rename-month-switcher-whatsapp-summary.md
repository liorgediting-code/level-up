# App Rename + Month Switcher + WhatsApp Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand "ASTRAL" → "לבל אפ / סוכנות שיווק ואימון מכירות"; add a month switcher to the home dashboard; let the user copy a formatted meeting summary for WhatsApp.

**Architecture:** Three small, independent UI bundles inside the existing Next.js 15 App Router app. No DB schema changes, no new API routes for A and B; one new GET handler on the tasks route for C. Server pages remain server-rendered; new interactive bits are client components.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Tailwind, Prisma (no schema changes), Zod (for the new GET query validation).

**Repo conventions:** No test suite (`pnpm typecheck` is the only verification gate). Repo is NOT git-initialized — **no commits**. Verify each task with `pnpm typecheck` + manual browser check at `http://localhost:3000`. Hebrew RTL throughout.

**Reference spec:** `docs/superpowers/specs/2026-05-20-app-rename-month-switcher-whatsapp-summary-design.md`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/app/_shell/app-shell.tsx` | modify | Sidebar logo block: name + subtitle |
| `src/app/layout.tsx` | modify | Browser tab `<title>` |
| `src/lib/crm/notify.ts` | modify | Default email sender label |
| `src/lib/utils.ts` | modify | Add `monthRange()` helper |
| `src/app/_shell/month-switcher.tsx` | create | Client component for prev/next/today nav |
| `src/app/page.tsx` | modify | Read `?m=`, swap to ranged queries, mount switcher, broaden active-clients filter |
| `src/components/whatsapp-summary-modal.tsx` | create | Client modal: format preview + copy |
| `src/app/api/clients/[id]/tasks/route.ts` | modify | Add `GET` with `space` + `status` query filters |
| `src/app/clients/[id]/sales/sales-client.tsx` | modify | Wire the WhatsApp button + modal inside `MeetingDrawer` |

---

## Bundle A: Rename

### Task A1: Update sidebar logo block

**Files:**
- Modify: `src/app/_shell/app-shell.tsx:27-35`

- [ ] **Step 1: Replace logo badge letter and label text**

Replace lines 27-35 (the existing `<div className="mb-8 flex items-center gap-2.5 px-2 pt-2">` block) with:

```tsx
        <div className="mb-8 flex items-center gap-2.5 px-2 pt-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-card">
            <span className="text-base font-bold">ל</span>
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight">לבל אפ</div>
            <div className="truncate text-[10px] leading-tight text-muted">סוכנות שיווק ואימון מכירות</div>
          </div>
        </div>
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes with no errors.

Then open `http://localhost:3000`. Sidebar should read `לבל אפ` (bold) above `סוכנות שיווק ואימון מכירות` (small, muted), with a `ל` badge to the right. The subtitle should be on one line — if it truncates with `…`, that's the intended fallback.

### Task A2: Update browser title

**Files:**
- Modify: `src/app/layout.tsx:15`

- [ ] **Step 1: Change the title metadata**

Replace line 15:

```tsx
  title: "לבל אפ — סוכנות שיווק ואימון מכירות",
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes.

Reload any page and check the browser tab title.

### Task A3: Update CRM email sender default

**Files:**
- Modify: `src/lib/crm/notify.ts:29`

- [ ] **Step 1: Change the default sender string**

Replace line 29:

```ts
  const from = process.env.RESEND_FROM || "לבל אפ CRM <onboarding@resend.dev>";
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes. (No runtime check needed — env override path is unchanged.)

---

## Bundle B: Month switcher on home dashboard

### Task B1: Add `monthRange()` to utils

**Files:**
- Modify: `src/lib/utils.ts` (append at end of file)

- [ ] **Step 1: Append the helper**

Add to `src/lib/utils.ts`:

```ts
export type MonthRange = {
  start: Date;
  end: Date;
  label: string;
  key: string;
  isCurrent: boolean;
};

/**
 * Parse `YYYY-MM` to a UTC month range. Invalid/missing input ⇒ current month.
 * `end` is the first day of the following month (use with Prisma `lt:`).
 */
export function monthRange(monthKey?: string | null): MonthRange {
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-indexed
  let key = currentKey;

  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
    const [y, m] = monthKey.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m - 1;
      key = monthKey;
    }
  }

  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const label = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(start);
  return { start, end, label, key, isCurrent: key === currentKey };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes.

### Task B2: Create the MonthSwitcher client component

**Files:**
- Create: `src/app/_shell/month-switcher.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Props = {
  monthKey: string;
  label: string;
  isCurrent: boolean;
};

function shift(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function MonthSwitcher({ monthKey, label, isCurrent }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(nextKey: string | null) {
    const params = new URLSearchParams(search.toString());
    if (nextKey === null) params.delete("m");
    else params.set("m", nextKey);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      router.push(url);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5">
      <button
        onClick={() => go(shift(monthKey, -1))}
        disabled={pending}
        aria-label="חודש קודם"
        className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        ‹
      </button>
      <div className="min-w-[6.5rem] text-center text-sm font-semibold">{label}</div>
      <button
        onClick={() => go(shift(monthKey, 1))}
        disabled={pending}
        aria-label="חודש הבא"
        className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        ›
      </button>
      {!isCurrent && (
        <button
          onClick={() => go(null)}
          disabled={pending}
          className="ms-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-elevated disabled:opacity-50"
        >
          היום
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes (component is not yet used — that's fine, no unused-file errors in Next.js).

### Task B3: Rewire `src/app/page.tsx` to consume the selected month

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update imports**

In the import block at the top (lines 1-6), change:

```ts
import { fmtIls, fmtInt, fmtPct, startOfMonth, monthLabel } from "@/lib/utils";
```

to:

```ts
import { fmtIls, fmtInt, fmtPct, monthRange } from "@/lib/utils";
```

and add:

```ts
import MonthSwitcher from "./_shell/month-switcher";
```

- [ ] **Step 2: Convert the page signature to accept `searchParams`**

Replace `export default async function OverviewPage() {` (line 10) and the `const monthStart = startOfMonth();` line (line 11) with:

```ts
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const { start: monthStart, end: monthEnd, label: currentLabel, key: monthKey, isCurrent } = monthRange(m);
```

(Keep the variable name `monthStart` to minimize diff. `monthEnd` is new.)

- [ ] **Step 3: Add `lt: monthEnd` to all three month-scoped queries**

In the same `Promise.all` block:

- Line 45 — change:
  ```ts
  prisma.lead.count({ where: { createdAt: { gte: monthStart } } }),
  ```
  to:
  ```ts
  prisma.lead.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }),
  ```

- Line 58 — change:
  ```ts
  where: { date: { gte: monthStart }, campaign: { isAgencyOwned: true } },
  ```
  to:
  ```ts
  where: { date: { gte: monthStart, lt: monthEnd }, campaign: { isAgencyOwned: true } },
  ```

- Line 65 — change:
  ```ts
  stats: { where: { date: { gte: monthStart } }, select: { spend: true, impressions: true, clicks: true, leads: true } },
  ```
  to:
  ```ts
  stats: { where: { date: { gte: monthStart, lt: monthEnd } }, select: { spend: true, impressions: true, clicks: true, leads: true } },
  ```

- [ ] **Step 4: Broaden the clients query to "active during the selected month"**

Lines 25-42 (the `prisma.client.findMany({ ... })` call). Change the `where` clause from `{ endedAt: null }` to:

```ts
      where: {
        createdAt: { lt: monthEnd },
        OR: [{ endedAt: null }, { endedAt: { gte: monthStart } }],
      },
```

The rest of that `findMany` (the `orderBy` and `select`) stays unchanged.

- [ ] **Step 5: Replace the static month label in the header with `<MonthSwitcher />`**

Lines 135-141 (`<header className="flex flex-wrap items-end justify-between gap-3">` block). Replace the entire `<header>` with:

```tsx
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">סקירת סוכנות</h1>
          <p className="mt-1 text-sm text-muted">
            {isCurrent ? "פעילות " : "פעילות בחודש "}
            {currentLabel} · {activeClients} לקוחות פעילים
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSwitcher monthKey={monthKey} label={currentLabel} isCurrent={isCurrent} />
          <Link href="/crm" className="btn-soft">CRM · {fmtInt(leadsUnread)} חדשים →</Link>
        </div>
      </header>
```

- [ ] **Step 6: Replace remaining `monthLabel()` call in the agency section**

Line 297 — change:
```tsx
<div className="text-xs text-muted">{monthLabel()} · קמפיינים ששויכו אלינו</div>
```
to:
```tsx
<div className="text-xs text-muted">{currentLabel} · קמפיינים ששויכו אלינו</div>
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck`
Expected: passes.

Manual QA at `http://localhost:3000`:
1. Header shows `סקירת סוכנות` with current month and switcher to its left.
2. Click `‹` — URL becomes `/?m=2026-04` (or previous month). Month label updates, "היום" button appears, KPIs and agency section reflect April only.
3. Click `היום` — URL drops the `m` param, returns to current month, "היום" button disappears.
4. Pick a month from before any client was created. `לקוחות פעילים` should be `0`, the client-progress list should show the empty state.

---

## Bundle C: WhatsApp meeting summary

### Task C1: Add GET handler to tasks route

**Files:**
- Modify: `src/app/api/clients/[id]/tasks/route.ts`

- [ ] **Step 1: Append the GET handler**

Add at the end of the file (after the existing POST):

```ts
const Query = z.object({
  space: z.enum(TASK_SPACES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    space: url.searchParams.get("space") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const tasks = await prisma.task.findMany({
    where: {
      clientId,
      ...(parsed.data.space ? { space: parsed.data.space } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, dueDate: true, status: true, priority: true },
  });
  return NextResponse.json({ tasks });
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes.

Smoke test in browser devtools console (replace `<clientId>` with a real id from `/clients`):
```js
await fetch("/api/clients/<clientId>/tasks?space=sales&status=open").then(r => r.json())
```
Expected: `{ tasks: [...] }`.

### Task C2: Create WhatsApp summary modal component

**Files:**
- Create: `src/components/whatsapp-summary-modal.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";

type OpenTask = {
  id: string;
  title: string;
  dueDate: string | null;
};

type MeetingSummaryInput = {
  title: string;
  scheduledAt: string | null;
  attendees: string;
  notes: string;
  outcome: string;
  whatWorked: string;
  whatToImprove: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  meeting: MeetingSummaryInput;
};

function fmtHebrewDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

function buildSummary(
  clientName: string,
  meeting: MeetingSummaryInput,
  tasks: OpenTask[],
  tasksError: boolean,
): string {
  const lines: string[] = [];
  lines.push(`📋 סיכום פגישה — ${clientName}`);

  const dateLine = meeting.scheduledAt ? `🗓 ${fmtHebrewDate(meeting.scheduledAt)}` : `🗓 ${meeting.title}`;
  const attendees = meeting.attendees.trim();
  lines.push(attendees ? `${dateLine} · 👥 ${attendees}` : dateLine);

  const section = (header: string, body: string) => {
    const t = body.trim();
    if (!t) return;
    lines.push("");
    lines.push(header);
    lines.push(t);
  };

  section("📝 הערות", meeting.notes);
  section("✅ מה עבד טוב", meeting.whatWorked);
  section("🔧 מה לשפר", meeting.whatToImprove);
  section("🎯 תוצאה", meeting.outcome);

  if (tasksError) {
    lines.push("");
    lines.push("📌 משימות פתוחות");
    lines.push("(לא נטענו משימות)");
  } else if (tasks.length > 0) {
    lines.push("");
    lines.push("📌 משימות פתוחות");
    for (const t of tasks) {
      const due = t.dueDate ? ` (עד ${fmtShortDate(t.dueDate)})` : "";
      lines.push(`• ${t.title}${due}`);
    }
  }

  return lines.join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function WhatsappSummaryModal({ open, onClose, clientId, clientName, meeting }: Props) {
  const [tasks, setTasks] = useState<OpenTask[]>([]);
  const [tasksError, setTasksError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setTasksError(false);
    fetch(`/api/clients/${clientId}/tasks?space=sales&status=open`)
      .then((r) => {
        if (!r.ok) throw new Error("bad response");
        return r.json();
      })
      .then((data: { tasks: OpenTask[] }) => {
        if (!cancelled) setTasks(data.tasks ?? []);
      })
      .catch(() => {
        if (!cancelled) setTasksError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  if (!open) return null;

  const text = buildSummary(clientName, meeting, tasks, tasksError);

  async function onCopy() {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      alert("ההעתקה נכשלה. אפשר לבחור ולהעתיק ידנית.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose}>
      <div
        className="fixed left-1/2 top-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">סיכום לוואטסאפ</h3>
          <button onClick={onClose} className="text-sm text-muted">סגור</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-sm text-muted">טוען משימות…</div>
          ) : (
            <pre dir="rtl" className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-fg">
              {text}
            </pre>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="btn-ghost">סגור</button>
          <button onClick={onCopy} disabled={loading} className="btn-primary disabled:opacity-50">
            {copied ? "הועתק ✓" : "העתק לקליפבורד"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes.

### Task C3: Wire the modal into MeetingDrawer

**Files:**
- Modify: `src/app/clients/[id]/sales/sales-client.tsx`

- [ ] **Step 1: Import the modal at the top of the file**

After line 7 (the existing `MEETING_STATUS_*` import), add:

```ts
import WhatsappSummaryModal from "@/components/whatsapp-summary-modal";
```

- [ ] **Step 2: Pass `clientName` from server page into `SalesClient`**

This requires two small changes. First, in `src/app/clients/[id]/sales/sales-client.tsx`, extend the component props (around line 26-30):

```ts
export default function SalesClient({
  clientId, clientName, range, meetings, target,
}: {
  clientId: string; clientName: string; range: Range; meetings: MeetingRow[]; target: number | null;
}) {
```

Then find where `<MeetingDrawer ...>` is rendered (line 139 per grep) and forward `clientName`:

```tsx
        <MeetingDrawer
          clientId={clientId}
          clientName={clientName}
          meeting={openMeeting}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
```

And update the `MeetingDrawer` function signature (line 201) and its props type:

```tsx
function MeetingDrawer({
  clientId, clientName, meeting, onClose, onChanged,
}: { clientId: string; clientName: string; meeting: MeetingRow; onClose: () => void; onChanged: () => void }) {
```

- [ ] **Step 3: Pass `clientName` from the server page**

Open `src/app/clients/[id]/sales/page.tsx`. Find where it renders `<SalesClient ... />` and add `clientName={...}`. The client's name is already loaded for the layout — verify the page has access to it. If the page doesn't currently fetch the client name, add a minimal `prisma.client.findUnique({ where: { id }, select: { name: true } })` call and pass `clientName={client?.name ?? ""}`.

Verification: `pnpm typecheck` should fail right now with a missing prop error from the page — that's the signal to fix the page. After fixing, typecheck should pass.

- [ ] **Step 4: Add WhatsApp button state and trigger to MeetingDrawer**

Inside `MeetingDrawer` (after `const [adding, setAdding] = useState(false);` on line 221), add:

```ts
  const [showWhatsapp, setShowWhatsapp] = useState(false);
```

Determine whether the summary is meaningful. After the existing `const isPlaceholder = meeting.scheduledAt === null;` line (line 278), add:

```ts
  const summaryReady =
    meeting.persistedStatus === "held" ||
    Boolean(
      meeting.notes.trim() ||
      meeting.outcome.trim() ||
      meeting.whatWorked.trim() ||
      meeting.whatToImprove.trim(),
    );
```

- [ ] **Step 5: Render the button + modal**

Find the footer action row (lines 366-369):

```tsx
        <div className="flex justify-end gap-2">
          <button onClick={del} className="text-sm text-bad">מחק</button>
          <button onClick={save} className="btn-primary">שמור</button>
        </div>
```

Replace with:

```tsx
        <div className="flex flex-wrap items-center justify-end gap-2">
          {summaryReady && (
            <button
              type="button"
              onClick={() => setShowWhatsapp(true)}
              className="btn-soft"
            >
              📋 סיכום לוואטסאפ
            </button>
          )}
          <button onClick={del} className="text-sm text-bad">מחק</button>
          <button onClick={save} className="btn-primary">שמור</button>
        </div>

        <WhatsappSummaryModal
          open={showWhatsapp}
          onClose={() => setShowWhatsapp(false)}
          clientId={clientId}
          clientName={clientName}
          meeting={{
            title: meeting.title,
            scheduledAt: meeting.scheduledAt,
            attendees: meeting.attendees,
            notes: meeting.notes,
            outcome: meeting.outcome,
            whatWorked: meeting.whatWorked,
            whatToImprove: meeting.whatToImprove,
          }}
        />
```

The modal uses the persisted `meeting` row, not the editable in-drawer state. Document this trade-off inline (one short line if needed): if the user edits fields and clicks "סיכום לוואטסאפ" without saving first, they'll see the saved snapshot. This is simpler than re-syncing live state and matches typical behavior — save, then summarize.

- [ ] **Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 7: Manual QA**

1. Start `pnpm dev`, navigate to `/clients/<id>/sales`.
2. Open a meeting that has at least notes filled in. Drawer should show `📋 סיכום לוואטסאפ` button.
3. Open a meeting that has nothing filled and `status=scheduled`. Button should NOT appear.
4. Click the button → modal opens, preview renders, open sales tasks for this client appear under `📌 משימות פתוחות` (or section is omitted if there are none).
5. Click `העתק לקליפבורד` → button label flips to `הועתק ✓` for ~2s. Paste into a text editor or WhatsApp Web — formatting matches the preview.
6. Edit text in the drawer without saving, reopen modal → modal still shows pre-edit content (expected).
7. Save with new notes → reopen modal → updated content appears.

---

## Self-review checklist (run before declaring done)

- [ ] Sidebar shows new logo + subtitle without overflow on a narrow viewport (1024px breakpoint).
- [ ] `pnpm typecheck` passes for the whole project after every task.
- [ ] Home dashboard with `?m=2026-04` shows April 2026 metrics and updates the agency-section sub-label.
- [ ] "היום" button only appears when `m` is set to a non-current month.
- [ ] Active-clients filter on the home page returns the same count as before when no `m` is set.
- [ ] WhatsApp modal omits empty sections.
- [ ] Tasks fetch error surfaces inline `(לא נטענו משימות)` instead of crashing the modal.
- [ ] Clipboard fallback path works in Safari (no `navigator.clipboard` over http) — manually test if available.

## Risks and follow-ups noted in the spec

- Past-month client list will include now-archived clients. Intentional. If users find this confusing, future enhancement could add a small "(הסתיים)" badge next to ended clients in the list.
- The tasks endpoint now has a GET. If it gains pagination later, the modal will need updating.
- The modal copies the saved snapshot of the meeting, not the in-drawer edits. If users complain, change Task C3 step 5 to pass the local state values (`notes`, `outcome`, etc. from `useState`) instead of `meeting.*`.

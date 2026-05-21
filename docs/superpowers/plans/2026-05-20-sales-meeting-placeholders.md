# Sales Meeting Placeholders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user sets `Client.salesMeetingsTarget` to N, N meeting rows exist for that client (existing meetings count toward N, the rest are empty placeholders), and the sales meetings page renders them as "פגישה N מתוך M" with a counter strip.

**Architecture:** `Meeting.scheduledAt` becomes nullable; a placeholder is `scheduledAt IS NULL`. A new `syncMeetingsToTarget(tx, clientId, target)` helper materializes/trims placeholders inside the same transaction that updates the client. UI orders by `(scheduledAt ASC NULLS LAST, createdAt ASC)`, numbers rows at render time, and the meetings counter widget shows a full breakdown.

**Tech Stack:** Next.js 15 App Router (server components), Prisma + SQLite, Zod, Tailwind. Hebrew RTL UI.

**Verification:** This repo has no automated test suite (per `CLAUDE.md`). Each task verifies via `pnpm typecheck` and a manual UI check at `http://localhost:3000`. Reference spec: `docs/superpowers/specs/2026-05-20-sales-meeting-placeholders-design.md`.

---

## Task 1: Make `Meeting.scheduledAt` nullable

**Files:**
- Modify: `prisma/schema.prisma:259`

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, change line 259 from:
```prisma
  scheduledAt DateTime
```
to:
```prisma
  scheduledAt DateTime?
```

Leave the `@@index([scheduledAt])` index unchanged — SQLite indexes nullable columns fine.

- [ ] **Step 2: Push schema & regenerate client**

Run:
```bash
pnpm db:push
pnpm db:generate
```
Expected: `Your database is now in sync with your Prisma schema.` and no errors. Existing rows keep their dates.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: errors in `src/lib/sales/meetings.ts:24` (comparing `m.scheduledAt < now` when it can be null) and `src/app/clients/[id]/sales/page.tsx:20` (`.toISOString()` on possibly null). These are expected — fixed in Task 2 and Task 5.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(sales): make Meeting.scheduledAt nullable for placeholders"
```

---

## Task 2: Add `syncMeetingsToTarget` and fix nullable handling in `src/lib/sales/meetings.ts`

**Files:**
- Modify: `src/lib/sales/meetings.ts` (whole file)

- [ ] **Step 1: Replace the file contents**

Replace `src/lib/sales/meetings.ts` with:

```ts
import { prisma } from "@/lib/db";
import type { Meeting, Prisma } from "@prisma/client";

export type MeetingStatus = "scheduled" | "pending_update" | "held" | "cancelled" | "no_show";
export const PERSISTED_MEETING_STATUSES = ["scheduled", "held", "cancelled", "no_show"] as const;

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "נקבעה",
  pending_update: "ממתינה לעדכון",
  held: "התקיימה",
  cancelled: "בוטלה",
  no_show: "לא הגיעו",
};

export const MEETING_STATUS_COLOR: Record<MeetingStatus, string> = {
  scheduled: "#3b82f6",
  pending_update: "#f59e0b",
  held: "#10b981",
  cancelled: "#64748b",
  no_show: "#ef4444",
};

// A placeholder (scheduledAt = null) never projects to pending_update.
export function effectiveStatus(m: Pick<Meeting, "status" | "scheduledAt">, now: Date = new Date()): MeetingStatus {
  if (m.status === "scheduled" && m.scheduledAt != null && m.scheduledAt < now) return "pending_update";
  return m.status as MeetingStatus;
}

export type MeetingRange = "upcoming" | "past" | "all";

// Order is canonical: dated meetings by scheduledAt asc, then placeholders by createdAt asc.
// SQLite sorts NULLs first by default on ASC, so we sort in two passes via raw orderBy.
export async function listMeetingsForClient(clientId: string, range: MeetingRange = "all") {
  const now = new Date();
  if (range === "upcoming") {
    return prisma.meeting.findMany({
      where: { clientId, scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
    });
  }
  if (range === "past") {
    return prisma.meeting.findMany({
      where: { clientId, scheduledAt: { lt: now } },
      orderBy: { scheduledAt: "desc" },
    });
  }
  // "all" — dated rows first ordered by scheduledAt asc, placeholders (null) last by createdAt asc.
  const dated = await prisma.meeting.findMany({
    where: { clientId, scheduledAt: { not: null } },
    orderBy: { scheduledAt: "asc" },
  });
  const placeholders = await prisma.meeting.findMany({
    where: { clientId, scheduledAt: null },
    orderBy: { createdAt: "asc" },
  });
  return [...dated, ...placeholders];
}

export async function countHeldMeetings(clientId: string): Promise<number> {
  return prisma.meeting.count({ where: { clientId, status: "held" } });
}

export type SyncResult = { created: number; deleted: number; warning?: string };

// Materialize / trim placeholders so total meeting count matches target.
// MUST be called inside a $transaction (caller passes tx).
export async function syncMeetingsToTarget(
  tx: Prisma.TransactionClient,
  clientId: string,
  target: number | null,
): Promise<SyncResult> {
  if (target == null || target <= 0) return { created: 0, deleted: 0 };

  const count = await tx.meeting.count({ where: { clientId } });
  if (count === target) return { created: 0, deleted: 0 };

  if (count < target) {
    const toCreate = target - count;
    await tx.meeting.createMany({
      data: Array.from({ length: toCreate }, () => ({
        clientId,
        title: "פגישה",
        scheduledAt: null,
      })),
    });
    return { created: toCreate, deleted: 0 };
  }

  // count > target — delete placeholders only (newest first), capped at count - target.
  const surplus = count - target;
  const placeholders = await tx.meeting.findMany({
    where: { clientId, scheduledAt: null },
    orderBy: { createdAt: "desc" },
    take: surplus,
    select: { id: true },
  });
  if (placeholders.length === 0) {
    return {
      created: 0,
      deleted: 0,
      warning: `היעד (${target}) נמוך ממספר הפגישות הקיימות עם תאריך`,
    };
  }
  await tx.meeting.deleteMany({ where: { id: { in: placeholders.map((p) => p.id) } } });
  const warning = placeholders.length < surplus
    ? `היעד (${target}) נמוך ממספר הפגישות הקיימות עם תאריך — חלק לא נמחקו`
    : undefined;
  return { created: 0, deleted: placeholders.length, warning };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: errors in this file are gone. Still failing in `src/app/clients/[id]/sales/page.tsx:20` (`.toISOString()` on nullable) — fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sales/meetings.ts
git commit -m "feat(sales): add syncMeetingsToTarget + handle nullable scheduledAt"
```

---

## Task 3: Wire `syncMeetingsToTarget` into the client PATCH route

**Files:**
- Modify: `src/app/api/clients/[id]/route.ts` (whole file)

- [ ] **Step 1: Replace the file contents**

Replace `src/app/api/clients/[id]/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { syncMeetingsToTarget } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
  endedAt: z.union([z.string(), z.null()]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const { endedAt, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (endedAt !== undefined) {
    if (endedAt === null || endedAt === "") {
      data.endedAt = null;
    } else {
      const d = new Date(endedAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "invalid endedAt" }, { status: 400 });
      }
      data.endedAt = d;
    }
  }

  const targetInBody = Object.prototype.hasOwnProperty.call(parsed.data, "salesMeetingsTarget");
  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.update({ where: { id }, data });
    const sync = targetInBody
      ? await syncMeetingsToTarget(tx, id, parsed.data.salesMeetingsTarget ?? null)
      : { created: 0, deleted: 0 };
    return { client, sync };
  });

  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors in this file.

- [ ] **Step 3: Manual verification**

Start dev: `pnpm dev`. Open a client at `http://localhost:3000/clients/<id>/sales`. Use the existing `MeetingsCounter` "✎" button to set the target to a number greater than current count (e.g. 5). Check Prisma Studio (`pnpm db:studio` in a separate terminal): the client should now have at least 5 Meeting rows, the new ones with `scheduledAt = null` and `title = "פגישה"`. Lower the target to 2 and confirm the placeholders (only) are removed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clients/[id]/route.ts
git commit -m "feat(sales): sync placeholders on client target change"
```

---

## Task 4: Relax meeting create/update routes to accept null `scheduledAt`

**Files:**
- Modify: `src/app/api/clients/[id]/meetings/route.ts`
- Modify: `src/app/api/meetings/[id]/route.ts`

- [ ] **Step 1: Update the create route**

Replace `src/app/api/clients/[id]/meetings/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERSISTED_MEETING_STATUSES } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Body = z.object({
  title: z.string().trim().min(1).max(160),
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(PERSISTED_MEETING_STATUSES).default("scheduled"),
  attendees: z.string().default(""),
  notes: z.string().default(""),
  outcome: z.string().default(""),
  whatWorked: z.string().default(""),
  whatToImprove: z.string().default(""),
  link: z.string().url().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const m = await prisma.meeting.create({
    data: {
      clientId,
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      status: parsed.data.status,
      attendees: parsed.data.attendees,
      notes: parsed.data.notes,
      outcome: parsed.data.outcome,
      whatWorked: parsed.data.whatWorked,
      whatToImprove: parsed.data.whatToImprove,
      link: parsed.data.link ?? null,
    },
  });
  return NextResponse.json({ id: m.id });
}
```

- [ ] **Step 2: Update the PATCH route**

Replace `src/app/api/meetings/[id]/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERSISTED_MEETING_STATUSES } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Patch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(PERSISTED_MEETING_STATUSES).optional(),
  attendees: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
  whatWorked: z.string().optional(),
  whatToImprove: z.string().optional(),
  link: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.scheduledAt === null) {
    data.scheduledAt = null;
  } else if (parsed.data.scheduledAt) {
    data.scheduledAt = new Date(parsed.data.scheduledAt);
  }
  await prisma.meeting.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.meeting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors in these files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clients/[id]/meetings/route.ts src/app/api/meetings/[id]/route.ts
git commit -m "feat(sales): allow null scheduledAt on meeting create/update"
```

---

## Task 5: Update the sales page server component to pass null-safe rows + counter data

**Files:**
- Modify: `src/app/clients/[id]/sales/page.tsx` (whole file)

- [ ] **Step 1: Replace the file contents**

Replace `src/app/clients/[id]/sales/page.tsx` with:

```ts
import { prisma } from "@/lib/db";
import { effectiveStatus, listMeetingsForClient, type MeetingRange } from "@/lib/sales/meetings";
import SalesClient, { type MeetingRow } from "./sales-client";

export const dynamic = "force-dynamic";

export default async function SalesMeetingsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const range: MeetingRange = sp.range === "upcoming" || sp.range === "past" || sp.range === "all"
    ? (sp.range as MeetingRange) : "all";

  const [meetings, client] = await Promise.all([
    listMeetingsForClient(id, range),
    prisma.client.findUnique({ where: { id }, select: { salesMeetingsTarget: true } }),
  ]);

  const rows: MeetingRow[] = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
    persistedStatus: m.status as MeetingRow["persistedStatus"],
    effectiveStatus: effectiveStatus(m),
    attendees: m.attendees,
    notes: m.notes,
    outcome: m.outcome,
    whatWorked: m.whatWorked,
    whatToImprove: m.whatToImprove,
    link: m.link,
  }));

  return (
    <SalesClient
      clientId={id}
      range={range}
      meetings={rows}
      target={client?.salesMeetingsTarget ?? null}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: now fails inside `sales-client.tsx` (the `MeetingRow.scheduledAt` type changed; `new Date(m.scheduledAt)` calls reject `null`, the `target` prop is unknown). Fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/app/clients/[id]/sales/page.tsx
git commit -m "feat(sales): pass nullable scheduledAt and target to client view"
```

---

## Task 6: Render placeholders + "פגישה N מתוך M" in `sales-client.tsx`

**Files:**
- Modify: `src/app/clients/[id]/sales/sales-client.tsx`

- [ ] **Step 1: Update the `MeetingRow` type**

In `src/app/clients/[id]/sales/sales-client.tsx`, change the type definition at lines 10-22 from:
```ts
export type MeetingRow = {
  id: string;
  title: string;
  scheduledAt: string;
  ...
};
```
to:
```ts
export type MeetingRow = {
  id: string;
  title: string;
  scheduledAt: string | null;
  persistedStatus: PersistedStatus;
  effectiveStatus: MeetingStatus;
  attendees: string;
  notes: string;
  outcome: string;
  whatWorked: string;
  whatToImprove: string;
  link: string | null;
};
```

- [ ] **Step 2: Update the `SalesClient` component signature & header**

Change the `SalesClient` component (starts at line 26). Update the props and add the counter strip. The opening of the component becomes:

```tsx
export default function SalesClient({
  clientId, range, meetings, target,
}: {
  clientId: string; range: Range; meetings: MeetingRow[]; target: number | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function changeRange(next: Range) {
    const url = next === "all" ? `/clients/${clientId}/sales` : `/clients/${clientId}/sales?range=${next}`;
    router.push(url);
  }

  const openMeeting = openId ? meetings.find((m) => m.id === openId) ?? null : null;
  const total = target ?? meetings.length;

  const counts = {
    done: meetings.filter((m) => m.persistedStatus === "held").length,
    scheduled: meetings.filter((m) => m.persistedStatus === "scheduled" && m.scheduledAt !== null).length,
    awaiting: meetings.filter((m) => m.scheduledAt === null).length,
    cancelled: meetings.filter((m) => m.persistedStatus === "cancelled").length,
    noShow: meetings.filter((m) => m.persistedStatus === "no_show").length,
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span><b className="text-foreground">{counts.done}</b> בוצעו</span>
        <span><b className="text-foreground">{counts.scheduled}</b> מתוזמנות</span>
        <span><b className="text-foreground">{counts.awaiting}</b> ממתינות לתזמון</span>
        {counts.cancelled > 0 && <span><b className="text-foreground">{counts.cancelled}</b> בוטלו</span>}
        {counts.noShow > 0 && <span><b className="text-foreground">{counts.noShow}</b> לא הגיעו</span>}
        {target != null && <span>· יעד: <b className="text-foreground">{target}</b></span>}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 text-xs">
          {(["all", "upcoming", "past"] as const).map((r) => (
            <button
              key={r}
              onClick={() => changeRange(r)}
              className={`btn-ghost ${range === r ? "border-accent text-accent" : ""}`}
            >
              {r === "all" ? "כולן" : r === "upcoming" ? "עתידיות" : "עבר"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/clients/${clientId}/sales/tasks`} className="btn-ghost text-xs">+ משימה</Link>
          <button onClick={() => setCreating(true)} className="btn-primary">+ פגישה חדשה</button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-right text-xs text-muted">
          <tr>
            <th className="p-2">#</th>
            <th className="p-2">תאריך</th>
            <th className="p-2">כותרת</th>
            <th className="p-2">סטטוס</th>
            <th className="p-2">משתתפים</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m, i) => (
            <tr
              key={m.id}
              onClick={() => setOpenId(m.id)}
              className={`cursor-pointer border-t border-border hover:bg-border/20 ${m.scheduledAt === null ? "text-muted" : ""}`}
            >
              <td className="p-2 text-xs whitespace-nowrap">פגישה {i + 1} מתוך {total}</td>
              <td className="p-2 text-xs">
                {m.scheduledAt
                  ? new Date(m.scheduledAt).toLocaleString("he-IL")
                  : <span className="text-amber-600">— לחץ לתזמון</span>}
              </td>
              <td className="p-2">{m.title}</td>
              <td className="p-2">
                {m.scheduledAt === null ? (
                  <span className="rounded-full border border-amber-400 px-2 py-0.5 text-xs text-amber-700">לא תוזמנה</span>
                ) : (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs text-white"
                    style={{ background: MEETING_STATUS_COLOR[m.effectiveStatus] }}
                  >
                    {MEETING_STATUS_LABEL[m.effectiveStatus]}
                  </span>
                )}
              </td>
              <td className="p-2 text-xs">{m.attendees || "-"}</td>
            </tr>
          ))}
          {meetings.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-sm text-muted">אין פגישות בתצוגה זו.</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <NewMeetingDialog
          clientId={clientId}
          onClose={() => setCreating(false)}
          onCreated={() => router.refresh()}
        />
      )}
      {openMeeting && (
        <MeetingDrawer
          clientId={clientId}
          meeting={openMeeting}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
```

This replaces the body of `SalesClient` (lines 26-114 in the original). Keep `NewMeetingDialog` (lines 116-165) unchanged.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: remaining error is inside `MeetingDrawer` — its `useState` for `date`/`time` does `new Date(meeting.scheduledAt)` with a possibly-null value. Fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/[id]/sales/sales-client.tsx
git commit -m "feat(sales): render placeholders + numbered meeting rows + counter strip"
```

---

## Task 7: Make `MeetingDrawer` handle empty `scheduledAt`

**Files:**
- Modify: `src/app/clients/[id]/sales/sales-client.tsx` (the `MeetingDrawer` function, starts around line 167)

- [ ] **Step 1: Replace the `MeetingDrawer` function**

Replace the entire `MeetingDrawer` function with:

```tsx
function MeetingDrawer({
  clientId, meeting, onClose, onChanged,
}: { clientId: string; meeting: MeetingRow; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(meeting.title);
  const pad = (n: number) => String(n).padStart(2, "0");
  const initial = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const [date, setDate] = useState(
    initial ? `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}-${pad(initial.getDate())}` : "",
  );
  const [time, setTime] = useState(
    initial ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}` : "",
  );
  const [attendees, setAttendees] = useState(meeting.attendees);
  const [notes, setNotes] = useState(meeting.notes);
  const [outcome, setOutcome] = useState(meeting.outcome);
  const [whatWorked, setWhatWorked] = useState(meeting.whatWorked);
  const [whatToImprove, setWhatToImprove] = useState(meeting.whatToImprove);
  const [link, setLink] = useState(meeting.link ?? "");
  const [status, setStatus] = useState<PersistedStatus>(meeting.persistedStatus);
  const [followUp, setFollowUp] = useState("");
  const [adding, setAdding] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { alert("עדכון נכשל"); return false; }
    return true;
  }

  async function save() {
    // Both date and time required together. Either both filled (-> scheduled meeting)
    // or both empty (-> stays a placeholder).
    let scheduledAt: string | null = null;
    if (date && time) {
      scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    } else if (date || time) {
      alert("יש למלא גם תאריך וגם שעה, או להשאיר את שניהם ריקים");
      return;
    }
    const ok = await patch({
      title, scheduledAt, attendees, notes, outcome,
      whatWorked, whatToImprove,
      link: link.trim() || null,
      status,
    });
    if (ok) { onClose(); onChanged(); }
  }

  async function addFollowUp() {
    const t = followUp.trim();
    if (!t) return;
    setAdding(true);
    const res = await fetch(`/api/clients/${clientId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ space: "sales", title: t, description: `מתוך פגישה: ${meeting.title}` }),
    });
    setAdding(false);
    if (!res.ok) { alert("הוספת המשימה נכשלה"); return; }
    setFollowUp("");
    onChanged();
  }

  async function quickSet(s: PersistedStatus) {
    setStatus(s);
    const ok = await patch({ status: s });
    if (ok) onChanged();
  }

  async function del() {
    if (!confirm("למחוק את הפגישה?")) return;
    await fetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
    onClose(); onChanged();
  }

  const showResolve = meeting.effectiveStatus === "pending_update";
  const isPlaceholder = meeting.scheduledAt === null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isPlaceholder ? "פגישה (לא תוזמנה)" : "פגישה"}</h2>
          <button onClick={onClose} className="text-sm text-muted">סגור</button>
        </div>

        {showResolve && (
          <div className="mb-4 rounded-md border border-amber-500 bg-amber-50 p-2 text-xs">
            פגישה זו כבר עברה. עדכן סטטוס:
            <div className="mt-2 flex gap-1">
              <button onClick={() => quickSet("held")} className="btn-ghost">התקיימה</button>
              <button onClick={() => quickSet("cancelled")} className="btn-ghost">בוטלה</button>
              <button onClick={() => quickSet("no_show")} className="btn-ghost">לא הגיעו</button>
            </div>
          </div>
        )}

        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">כותרת</span>
          <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">תאריך</span>
            <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">שעה</span>
            <input type="time" className="input w-full" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">סטטוס</span>
          <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as PersistedStatus)}>
            <option value="scheduled">נקבעה</option>
            <option value="held">התקיימה</option>
            <option value="cancelled">בוטלה</option>
            <option value="no_show">לא הגיעו</option>
          </select>
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">משתתפים</span>
          <input className="input w-full" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">קישור</span>
          <input className="input w-full" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">הערות</span>
          <textarea className="input h-24 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">תוצאת הפגישה</span>
          <textarea className="input h-20 w-full" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">מה עבד טוב</span>
          <textarea className="input h-20 w-full" value={whatWorked} onChange={(e) => setWhatWorked(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-muted">מה צריך לשפר</span>
          <textarea className="input h-20 w-full" value={whatToImprove} onChange={(e) => setWhatToImprove(e.target.value)} />
        </label>

        <div className="mb-4 rounded-md border border-border p-2">
          <div className="mb-2 text-xs text-muted">משימת המשך</div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="כותרת משימה ולחץ Enter"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFollowUp()}
            />
            <button onClick={addFollowUp} disabled={adding || !followUp.trim()} className="btn-primary disabled:opacity-50">
              הוסף
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={del} className="text-sm text-bad">מחק</button>
          <button onClick={save} className="btn-primary">שמור</button>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (zero errors).

- [ ] **Step 3: Manual verification**

With `pnpm dev` running, on a client with a target set:
1. Click a placeholder row → drawer opens with empty date/time inputs, title `"פגישה"`.
2. Fill date+time and save → row now shows a real date in the table, the "ממתינות לתזמון" counter goes down, "מתוזמנות" goes up.
3. Open the same row again, clear both date and time, save → row goes back to "לא תוזמנה".
4. Try filling only date but not time → alert appears, save aborted.

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/[id]/sales/sales-client.tsx
git commit -m "feat(sales): handle empty schedule in MeetingDrawer"
```

---

## Task 8: Surface sync warnings + simplify counter to total breakdown

**Files:**
- Modify: `src/app/clients/[id]/sales/meetings-counter.tsx` (whole file)

The header strip in Task 6 now shows the full breakdown, so this widget can stay focused on editing the target. We just need it to surface the warning that the API returns when target < dated count.

- [ ] **Step 1: Replace the file contents**

Replace `src/app/clients/[id]/sales/meetings-counter.tsx` with:

```tsx
"use client";
import { useRouter } from "next/navigation";

export default function MeetingsCounter({
  clientId, held, target,
}: { clientId: string; held: number; target: number | null }) {
  const router = useRouter();
  async function editTarget() {
    const current = target == null ? "" : String(target);
    const next = prompt("יעד פגישות מכירה (השאר ריק למחיקה):", current);
    if (next === null) return;
    const trimmed = next.trim();
    let value: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) { alert("מספר לא תקין"); return; }
      value = n;
    }
    const r = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ salesMeetingsTarget: value }),
    });
    if (!r.ok) { alert(await r.text()); return; }
    const body = await r.json().catch(() => null) as { sync?: { created: number; deleted: number; warning?: string } } | null;
    if (body?.sync?.warning) alert(body.sync.warning);
    else if (body?.sync && (body.sync.created > 0 || body.sync.deleted > 0)) {
      const parts: string[] = [];
      if (body.sync.created > 0) parts.push(`נוספו ${body.sync.created} פלייסהולדרים`);
      if (body.sync.deleted > 0) parts.push(`הוסרו ${body.sync.deleted} פלייסהולדרים`);
      // soft notification — using alert keeps this lightweight without a toast lib
      alert(parts.join(" · "));
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-good/15 px-3 py-1 text-xs text-good">
      פגישות שהתקיימו: {target == null ? held : `${held} / ${target}`}
      <button onClick={editTarget} className="opacity-60 hover:opacity-100" title="עדכן יעד">✎</button>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Full manual verification (the spec's checklist)**

With `pnpm dev` running:

1. **New target on empty client:** create or pick a client with no meetings, set target = 12 via the ✎ button. → toast says "נוספו 12 פלייסהולדרים". The meetings list shows 12 placeholder rows, each "פגישה N מתוך 12 · — לחץ לתזמון · לא תוזמנה". Header: "0 בוצעו · 0 מתוזמנות · 12 ממתינות לתזמון · יעד: 12".
2. **Fill one placeholder:** open row #1, set date + time + status=`התקיימה` + retrospective, save. → row #1 now shows the real date with status "התקיימה"; header: "1 בוצעו · 0 מתוזמנות · 11 ממתינות · יעד: 12".
3. **Increase target:** 12 → 15. → toast "נוספו 3 פלייסהולדרים", three new rows at the bottom.
4. **Decrease target with no real meetings to keep:** 15 → 10. → toast "הוסרו 5 פלייסהולדרים", 5 newest placeholders gone, 10 rows total.
5. **Decrease below dated count:** if you already have 3 held meetings and lower target to 2, the API returns the warning; you should see an alert with the Hebrew warning text. Target is still saved (the client row updates) but dated meetings remain. Header shows "3 בוצעו ... יעד: 2".
6. **Clear target (empty input):** ✎, empty, OK → no meetings deleted, header drops the "יעד" segment, rows still number "פגישה N מתוך <total rows>".
7. **Delete a placeholder manually:** open a placeholder, click מחק. → row gone, no auto-replace.
8. **Restore by re-saving target:** ✎, same number, OK → missing placeholder is regenerated.

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/[id]/sales/meetings-counter.tsx
git commit -m "feat(sales): surface placeholder sync result & target warnings"
```

---

## Final review

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 2: Smoke test the unaffected sales flows**

With `pnpm dev`:
1. The "+ פגישה חדשה" dialog still creates a dated meeting normally.
2. Range tabs (כולן / עתידיות / עבר): "עתידיות" and "עבר" don't show placeholders (they filter by `scheduledAt` `gte`/`lt`, which excludes nulls); "כולן" shows everything.
3. The journey ↔ task sync code path was not touched. Open a marketing journey for the same client and verify it still advances/reverts as before.

- [ ] **Step 3: Spec cross-reference**

Open `docs/superpowers/specs/2026-05-20-sales-meeting-placeholders-design.md` and confirm each section maps to a task: schema (T1), sync helper (T2), API wiring (T3), routes (T4), UI server side (T5), UI client rendering + counters (T6), drawer (T7), warnings (T8). The two open questions in the spec are resolved by this plan as: cancelled/no_show shown as their own segments only when > 0 (T6); placeholder can be saved without a date as long as date AND time are both empty (T7).

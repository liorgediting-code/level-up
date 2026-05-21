# Sales Coaching & Tasks Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure each client page into two workspaces (Sales Coaching + Marketing), add a meetings module under Sales, and add per-client tasks lists scoped per workspace.

**Architecture:** Two new Prisma models (`Meeting`, `Task`) with relations to `Client`. URL restructure: existing `/clients/[id]/{dashboard,landing,materials,analyze}` move under `/clients/[id]/marketing/*`; new `/clients/[id]/sales/*`. A new `src/middleware.ts` 308-redirects the old paths. Tasks UI is a single shared component rendered by both workspace task pages, scoped by `space`. Meeting status `pending_update` is a read-time projection, never persisted.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + SQLite, Zod, Tailwind. No test framework — `pnpm typecheck` is the verification gate per CLAUDE.md. Repo is not git-initialized; "checkpoint" markers replace commits.

---

## File Structure

**Modify:**
- `prisma/schema.prisma` — add 2 models, 2 relations on `Client`.
- `src/app/clients/[id]/client-tabs.tsx` — keep only "פורטפוליו"; add two large workspace cards.
- `src/app/clients/[id]/portfolio-client.tsx` — remove `CampaignsBox`; keep description/links/payments/landing/analysis.
- `src/app/clients/[id]/page.tsx` — drop `allCampaigns` / `attached` props passed into portfolio.

**Move (keep content; only `import` path adjustments if any):**
- `src/app/clients/[id]/dashboard/` → `src/app/clients/[id]/marketing/dashboard/`
- `src/app/clients/[id]/landing/` → `src/app/clients/[id]/marketing/landing/`
- `src/app/clients/[id]/materials/` → `src/app/clients/[id]/marketing/materials/`
- `src/app/clients/[id]/analyze/` → `src/app/clients/[id]/marketing/analyze/`

**Create:**
- `src/middleware.ts` — legacy `/clients/[id]/{old-path}` → `/clients/[id]/marketing/{old-path}` 308s.
- `src/lib/sales/meetings.ts` — `effectiveStatus`, `listMeetingsForClient`, status constants.
- `src/lib/sales/tasks.ts` — `listTasksForClient(clientId, space)`, priority/status constants.
- `src/app/api/clients/[id]/meetings/route.ts` — POST create.
- `src/app/api/meetings/[id]/route.ts` — PATCH, DELETE.
- `src/app/api/clients/[id]/tasks/route.ts` — POST create.
- `src/app/api/tasks/[id]/route.ts` — PATCH, DELETE.
- `src/app/clients/[id]/tasks-shared.tsx` — shared client component for both workspaces' task pages.
- `src/app/clients/[id]/sales/layout.tsx` — sub-nav (פגישות, משימות).
- `src/app/clients/[id]/sales/page.tsx` — meetings list (server).
- `src/app/clients/[id]/sales/sales-client.tsx` — table + drawer + new-meeting dialog.
- `src/app/clients/[id]/sales/tasks/page.tsx` — server, wraps `tasks-shared`.
- `src/app/clients/[id]/marketing/layout.tsx` — sub-nav (6 tabs).
- `src/app/clients/[id]/marketing/campaigns/page.tsx` — extracted campaigns box.
- `src/app/clients/[id]/marketing/campaigns/campaigns-client.tsx` — UI mirroring the removed `CampaignsBox`.
- `src/app/clients/[id]/marketing/tasks/page.tsx` — server, wraps `tasks-shared`.

---

## Task 1: Add `Meeting` and `Task` Prisma models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append new models**

Append to the end of `prisma/schema.prisma`:

```prisma
model Meeting {
  id          String   @id @default(cuid())
  clientId    String
  title       String
  scheduledAt DateTime
  status      String   @default("scheduled") // scheduled | held | cancelled | no_show  (pending_update is a read-time projection only)
  attendees   String   @default("")
  notes       String   @default("")
  outcome     String   @default("")
  link        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@index([clientId])
  @@index([scheduledAt])
}

model Task {
  id           String    @id @default(cuid())
  clientId     String
  space        String    // sales | marketing
  title        String
  description  String    @default("")
  priority     String    @default("normal") // low | normal | high
  dueDate      DateTime?
  status       String    @default("open")   // open | done
  completedAt  DateTime?
  createdAt    DateTime  @default(now())

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@index([clientId])
  @@index([clientId, space, status])
  @@index([dueDate])
}
```

Inside the existing `Client` model's relation block, add:

```
  meetings Meeting[]
  tasks    Task[]
```

- [ ] **Step 2: Push & regenerate**

Run:
```
pnpm db:push
pnpm db:generate
```
Expected: "Your database is now in sync …" and a clean Prisma client regeneration.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(sales): add Meeting and Task models"

---

## Task 2: Sales lib helpers

**Files:**
- Create: `src/lib/sales/meetings.ts`
- Create: `src/lib/sales/tasks.ts`

- [ ] **Step 1: meetings.ts**

```ts
// src/lib/sales/meetings.ts
import { prisma } from "@/lib/db";
import type { Meeting } from "@prisma/client";

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

export function effectiveStatus(m: Pick<Meeting, "status" | "scheduledAt">, now: Date = new Date()): MeetingStatus {
  if (m.status === "scheduled" && m.scheduledAt < now) return "pending_update";
  return m.status as MeetingStatus;
}

export type MeetingRange = "upcoming" | "past" | "all";

export async function listMeetingsForClient(clientId: string, range: MeetingRange = "all") {
  const now = new Date();
  const where: { clientId: string; scheduledAt?: { gte?: Date; lt?: Date } } = { clientId };
  if (range === "upcoming") where.scheduledAt = { gte: now };
  if (range === "past") where.scheduledAt = { lt: now };
  return prisma.meeting.findMany({
    where,
    orderBy: { scheduledAt: range === "upcoming" ? "asc" : "desc" },
  });
}

export async function countHeldMeetings(clientId: string): Promise<number> {
  return prisma.meeting.count({ where: { clientId, status: "held" } });
}
```

- [ ] **Step 2: tasks.ts**

```ts
// src/lib/sales/tasks.ts
import { prisma } from "@/lib/db";

export type TaskSpace = "sales" | "marketing";
export type TaskStatus = "open" | "done";
export type TaskPriority = "low" | "normal" | "high";

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const TASK_STATUSES = ["open", "done"] as const;
export const TASK_SPACES = ["sales", "marketing"] as const;

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "נמוכה",
  normal: "רגילה",
  high: "גבוהה",
};

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

export async function listTasksForClient(clientId: string, space: TaskSpace) {
  // Sort: by status (open first) → priority rank → dueDate asc (nulls last) → createdAt desc.
  // Done in JS for simplicity since priority is a string column.
  const rows = await prisma.task.findMany({
    where: { clientId, space },
    orderBy: [{ createdAt: "desc" }],
  });
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const pa = TASK_PRIORITY_RANK[a.priority as TaskPriority] ?? 1;
    const pb = TASK_PRIORITY_RANK[b.priority as TaskPriority] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
    const db = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return rows;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(sales): meetings + tasks lib helpers"

---

## Task 3: Meetings API

**Files:**
- Create: `src/app/api/clients/[id]/meetings/route.ts`
- Create: `src/app/api/meetings/[id]/route.ts`

- [ ] **Step 1: POST create**

`src/app/api/clients/[id]/meetings/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERSISTED_MEETING_STATUSES } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Body = z.object({
  title: z.string().trim().min(1).max(160),
  scheduledAt: z.string().datetime(),
  status: z.enum(PERSISTED_MEETING_STATUSES).default("scheduled"),
  attendees: z.string().default(""),
  notes: z.string().default(""),
  outcome: z.string().default(""),
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
      scheduledAt: new Date(parsed.data.scheduledAt),
      status: parsed.data.status,
      attendees: parsed.data.attendees,
      notes: parsed.data.notes,
      outcome: parsed.data.outcome,
      link: parsed.data.link ?? null,
    },
  });
  return NextResponse.json({ id: m.id });
}
```

- [ ] **Step 2: PATCH + DELETE**

`src/app/api/meetings/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERSISTED_MEETING_STATUSES } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Patch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  scheduledAt: z.string().datetime().optional(),
  status: z.enum(PERSISTED_MEETING_STATUSES).optional(),
  attendees: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
  link: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.scheduledAt) data.scheduledAt = new Date(parsed.data.scheduledAt);
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
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(sales): meetings API"

---

## Task 4: Tasks API

**Files:**
- Create: `src/app/api/clients/[id]/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: POST create**

`src/app/api/clients/[id]/tasks/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TASK_PRIORITIES, TASK_SPACES, TASK_STATUSES } from "@/lib/sales/tasks";

export const runtime = "nodejs";

const Body = z.object({
  space: z.enum(TASK_SPACES),
  title: z.string().trim().min(1).max(200),
  description: z.string().default(""),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(TASK_STATUSES).default("open"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const t = await prisma.task.create({
    data: {
      clientId,
      space: parsed.data.space,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      status: parsed.data.status,
      completedAt: parsed.data.status === "done" ? new Date() : null,
    },
  });
  return NextResponse.json({ id: t.id });
}
```

- [ ] **Step 2: PATCH + DELETE**

`src/app/api/tasks/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/sales/tasks";

export const runtime = "nodejs";

const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    data.status = parsed.data.status;
    data.completedAt = parsed.data.status === "done" ? new Date() : null;
  }

  await prisma.task.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(sales): tasks API"

---

## Task 5: Move existing pages under `/marketing/`

**Files:**
- Move (rename) entire directories:
  - `src/app/clients/[id]/dashboard/` → `src/app/clients/[id]/marketing/dashboard/`
  - `src/app/clients/[id]/landing/` → `src/app/clients/[id]/marketing/landing/`
  - `src/app/clients/[id]/materials/` → `src/app/clients/[id]/marketing/materials/`
  - `src/app/clients/[id]/analyze/` → `src/app/clients/[id]/marketing/analyze/`

- [ ] **Step 1: Move the directories**

Run from the repo root:
```
mkdir -p src/app/clients/\[id\]/marketing
git mv src/app/clients/\[id\]/dashboard src/app/clients/\[id\]/marketing/dashboard 2>/dev/null \
  || mv src/app/clients/\[id\]/dashboard src/app/clients/\[id\]/marketing/dashboard
git mv src/app/clients/\[id\]/landing src/app/clients/\[id\]/marketing/landing 2>/dev/null \
  || mv src/app/clients/\[id\]/landing src/app/clients/\[id\]/marketing/landing
git mv src/app/clients/\[id\]/materials src/app/clients/\[id\]/marketing/materials 2>/dev/null \
  || mv src/app/clients/\[id\]/materials src/app/clients/\[id\]/marketing/materials
git mv src/app/clients/\[id\]/analyze src/app/clients/\[id\]/marketing/analyze 2>/dev/null \
  || mv src/app/clients/\[id\]/analyze src/app/clients/\[id\]/marketing/analyze
```
(The `||` falls back to plain `mv` if the repo isn't git-initialized — which is the case here.)

- [ ] **Step 2: Patch relative imports**

Each moved page may import `../helpers` or `../portfolio-client`. Now they are one directory deeper, so those imports become `../../helpers`. Update every TypeScript file in the moved directories:

Run:
```
grep -rl "from \"\\.\\./helpers\"" src/app/clients/\[id\]/marketing/ 2>/dev/null \
  | xargs -I{} sed -i '' 's|from "\.\./helpers"|from "../../helpers"|g' "{}"
grep -rl "from \"\\.\\./portfolio-client\"" src/app/clients/\[id\]/marketing/ 2>/dev/null \
  | xargs -I{} sed -i '' 's|from "\.\./portfolio-client"|from "../../portfolio-client"|g' "{}"
grep -rl "from \"\\.\\./client-tabs\"" src/app/clients/\[id\]/marketing/ 2>/dev/null \
  | xargs -I{} sed -i '' 's|from "\.\./client-tabs"|from "../../client-tabs"|g' "{}"
```

(If any moved file imports something else from `../` — e.g. `../layout`, `../page`, sibling helpers — manually update those imports too. Use `grep -rn "from \"\\.\\./" src/app/clients/\[id\]/marketing/` to audit. Imports using the `@/` alias are unaffected by the move.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If errors mention "Cannot find module '../something'", that's an import you missed — fix it.

- [ ] **Step 4: Checkpoint** — "refactor(clients): move dashboard/landing/materials/analyze under /marketing/"

---

## Task 6: Marketing layout with 6-tab sub-nav

**Files:**
- Create: `src/app/clients/[id]/marketing/layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
// src/app/clients/[id]/marketing/layout.tsx
import Link from "next/link";
import MarketingTabs from "./marketing-tabs";

export default async function MarketingLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${id}`} className="text-xs text-muted hover:text-accent">← חזרה לפורטפוליו</Link>
        <h1 className="mt-1 text-2xl font-semibold">שיווק</h1>
      </div>
      <MarketingTabs clientId={id} />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Write the tabs client component**

Create `src/app/clients/[id]/marketing/marketing-tabs.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "דשבורד" },
  { href: "/landing", label: "דף נחיתה" },
  { href: "/materials", label: "חומרים" },
  { href: "/analyze", label: "ניתוח AI" },
  { href: "/campaigns", label: "קמפיינים" },
  { href: "/tasks", label: "משימות" },
];

export default function MarketingTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}/marketing`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const href = `${base}${t.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.href}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(marketing): workspace layout + tabs"

---

## Task 7: Marketing campaigns page (extracted from portfolio)

**Files:**
- Create: `src/app/clients/[id]/marketing/campaigns/page.tsx`
- Create: `src/app/clients/[id]/marketing/campaigns/campaigns-client.tsx`

- [ ] **Step 1: Server page**

```tsx
// src/app/clients/[id]/marketing/campaigns/page.tsx
import { prisma } from "@/lib/db";
import CampaignsClient from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function MarketingCampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, all] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: { campaigns: { include: { campaign: true } } },
    }),
    prisma.campaign.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!client) return null;
  const attached = client.campaigns.map((cc) => ({
    id: cc.campaign.id, name: cc.campaign.name, status: cc.campaign.status, objective: cc.campaign.objective,
  }));
  const allRows = all.map((c) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective }));
  return <CampaignsClient clientId={id} attached={attached} all={allRows} />;
}
```

- [ ] **Step 2: Client component**

```tsx
// src/app/clients/[id]/marketing/campaigns/campaigns-client.tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Camp = { id: string; name: string; status: string | null; objective: string | null };

export default function CampaignsClient(props: { clientId: string; attached: Camp[]; all: Camp[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const available = props.all.filter((c) => !props.attached.some((a) => a.id === c.id));

  async function attach() {
    if (!selected) return;
    await fetch(`/api/clients/${props.clientId}/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId: selected }),
    });
    setSelected("");
    router.refresh();
  }
  async function detach(campaignId: string) {
    await fetch(`/api/clients/${props.clientId}/campaigns?campaignId=${campaignId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">קמפיינים במטא</h2>
      <ul className="mb-3 space-y-1 text-sm">
        {props.attached.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span>{c.name} <span className="text-xs text-muted">{c.objective ?? ""}</span></span>
            <button onClick={() => detach(c.id)} className="text-xs text-muted hover:text-bad">נתק</button>
          </li>
        ))}
        {!props.attached.length && (
          <li className="text-muted">לא חוברו קמפיינים. <Link className="hover:text-accent" href="/campaigns">צפה בכל הקמפיינים ←</Link></li>
        )}
      </ul>
      {available.length > 0 && (
        <div className="flex gap-2">
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— בחר קמפיין —</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={attach} className="btn-ghost whitespace-nowrap">חבר</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(marketing): campaigns page"

---

## Task 8: Tasks shared component

**Files:**
- Create: `src/app/clients/[id]/tasks-shared.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/clients/[id]/tasks-shared.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Priority = "low" | "normal" | "high";
type Status = "open" | "done";
type Space = "sales" | "marketing";

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  status: Status;
  completedAt: string | null;
};

const PRIORITY_LABEL: Record<Priority, string> = { low: "נמוכה", normal: "רגילה", high: "גבוהה" };
const PRIORITY_COLOR: Record<Priority, string> = { low: "#94a3b8", normal: "#3b82f6", high: "#ef4444" };

export default function TasksShared({
  clientId, space, tasks,
}: {
  clientId: string; space: Space; tasks: TaskRow[];
}) {
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState("");
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = tasks.filter((t) => filter === "all" ? true : t.status === filter);
  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null;

  async function createQuick() {
    const title = quickAdd.trim();
    if (!title) return;
    await fetch(`/api/clients/${clientId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ space, title }),
    });
    setQuickAdd("");
    router.refresh();
  }

  async function toggleDone(t: TaskRow) {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: t.status === "open" ? "done" : "open" }),
    });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createQuick()}
          placeholder="הוסף משימה ולחץ Enter"
          className="input flex-1"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as "open" | "done" | "all")} className="input">
          <option value="open">פתוחות</option>
          <option value="done">הושלמו</option>
          <option value="all">הכל</option>
        </select>
      </div>

      <ul className="space-y-1">
        {visible.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-border/20"
          >
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => toggleDone(t)}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className={`flex-1 text-right ${t.status === "done" ? "text-muted line-through" : ""}`}
              onClick={() => setOpenId(t.id)}
            >
              {t.title}
            </button>
            <span
              className="rounded-full px-2 py-0.5 text-xs text-white"
              style={{ background: PRIORITY_COLOR[t.priority] }}
            >
              {PRIORITY_LABEL[t.priority]}
            </span>
            {t.dueDate && (
              <span className="text-xs text-muted">{new Date(t.dueDate).toLocaleDateString("he-IL")}</span>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-sm text-muted">אין משימות בתצוגה זו.</li>}
      </ul>

      {openTask && (
        <TaskDrawer
          task={openTask}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function TaskDrawer({
  task, onClose, onChanged,
}: { task: TaskRow; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [status, setStatus] = useState<Status>(task.status);

  async function save() {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        status,
      }),
    });
    onClose();
    onChanged();
  }

  async function del() {
    if (!confirm("למחוק את המשימה?")) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onClose();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">משימה</h2>
          <button onClick={onClose} className="text-sm text-muted">סגור</button>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">כותרת</span>
          <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">תיאור</span>
          <textarea className="input h-24 w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">עדיפות</span>
            <select className="input w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">{PRIORITY_LABEL.low}</option>
              <option value="normal">{PRIORITY_LABEL.normal}</option>
              <option value="high">{PRIORITY_LABEL.high}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">תאריך יעד</span>
            <input type="date" className="input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-muted">סטטוס</span>
          <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="open">פתוחה</option>
            <option value="done">הושלמה</option>
          </select>
        </label>
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
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(tasks): shared task list component"

---

## Task 9: Marketing tasks page

**Files:**
- Create: `src/app/clients/[id]/marketing/tasks/page.tsx`

- [ ] **Step 1: Write the server page**

```tsx
// src/app/clients/[id]/marketing/tasks/page.tsx
import { listTasksForClient } from "@/lib/sales/tasks";
import TasksShared, { type TaskRow } from "../../tasks-shared";

export const dynamic = "force-dynamic";

export default async function MarketingTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await listTasksForClient(id, "marketing");
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskRow["priority"],
    dueDate: t.dueDate?.toISOString() ?? null,
    status: t.status as TaskRow["status"],
    completedAt: t.completedAt?.toISOString() ?? null,
  }));
  return <TasksShared clientId={id} space="marketing" tasks={rows} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(marketing): tasks page"

---

## Task 10: Sales layout with 2-tab sub-nav

**Files:**
- Create: `src/app/clients/[id]/sales/layout.tsx`
- Create: `src/app/clients/[id]/sales/sales-tabs.tsx`

- [ ] **Step 1: Layout**

```tsx
// src/app/clients/[id]/sales/layout.tsx
import Link from "next/link";
import { countHeldMeetings } from "@/lib/sales/meetings";
import SalesTabs from "./sales-tabs";

export default async function SalesLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const held = await countHeldMeetings(id);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link href={`/clients/${id}`} className="text-xs text-muted hover:text-accent">← חזרה לפורטפוליו</Link>
          <h1 className="mt-1 text-2xl font-semibold">אימון מכירות</h1>
        </div>
        <span className="rounded-full bg-good/15 px-3 py-1 text-xs text-good">פגישות שהתקיימו: {held}</span>
      </div>
      <SalesTabs clientId={id} />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Sales tabs**

```tsx
// src/app/clients/[id]/sales/sales-tabs.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "פגישות" },
  { href: "/tasks", label: "משימות" },
];

export default function SalesTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}/sales`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.href}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(sales): workspace layout + tabs"

---

## Task 11: Sales meetings page (server + client)

**Files:**
- Create: `src/app/clients/[id]/sales/page.tsx`
- Create: `src/app/clients/[id]/sales/sales-client.tsx`

- [ ] **Step 1: Server page**

```tsx
// src/app/clients/[id]/sales/page.tsx
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
  const meetings = await listMeetingsForClient(id, range);
  const rows: MeetingRow[] = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    scheduledAt: m.scheduledAt.toISOString(),
    persistedStatus: m.status as MeetingRow["persistedStatus"],
    effectiveStatus: effectiveStatus(m),
    attendees: m.attendees,
    notes: m.notes,
    outcome: m.outcome,
    link: m.link,
  }));
  return <SalesClient clientId={id} range={range} meetings={rows} />;
}
```

- [ ] **Step 2: Client component**

```tsx
// src/app/clients/[id]/sales/sales-client.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MEETING_STATUS_COLOR, MEETING_STATUS_LABEL, type MeetingStatus,
} from "@/lib/sales/meetings";

type PersistedStatus = "scheduled" | "held" | "cancelled" | "no_show";
export type MeetingRow = {
  id: string;
  title: string;
  scheduledAt: string;
  persistedStatus: PersistedStatus;
  effectiveStatus: MeetingStatus;
  attendees: string;
  notes: string;
  outcome: string;
  link: string | null;
};

type Range = "all" | "upcoming" | "past";

export default function SalesClient({
  clientId, range, meetings,
}: {
  clientId: string; range: Range; meetings: MeetingRow[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function changeRange(next: Range) {
    const url = next === "all" ? `/clients/${clientId}/sales` : `/clients/${clientId}/sales?range=${next}`;
    router.push(url);
  }

  const openMeeting = openId ? meetings.find((m) => m.id === openId) ?? null : null;

  return (
    <div>
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
        <button onClick={() => setCreating(true)} className="btn-primary">+ פגישה חדשה</button>
      </div>

      <table className="w-full text-sm">
        <thead className="text-right text-xs text-muted">
          <tr>
            <th className="p-2">תאריך</th>
            <th className="p-2">כותרת</th>
            <th className="p-2">סטטוס</th>
            <th className="p-2">משתתפים</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m) => (
            <tr
              key={m.id}
              onClick={() => setOpenId(m.id)}
              className="cursor-pointer border-t border-border hover:bg-border/20"
            >
              <td className="p-2 text-xs">{new Date(m.scheduledAt).toLocaleString("he-IL")}</td>
              <td className="p-2">{m.title}</td>
              <td className="p-2">
                <span
                  className="rounded-full px-2 py-0.5 text-xs text-white"
                  style={{ background: MEETING_STATUS_COLOR[m.effectiveStatus] }}
                >
                  {MEETING_STATUS_LABEL[m.effectiveStatus]}
                </span>
              </td>
              <td className="p-2 text-xs">{m.attendees || "-"}</td>
            </tr>
          ))}
          {meetings.length === 0 && (
            <tr><td colSpan={4} className="p-4 text-center text-sm text-muted">אין פגישות בתצוגה זו.</td></tr>
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
          meeting={openMeeting}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function NewMeetingDialog({
  clientId, onClose, onCreated,
}: { clientId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [attendees, setAttendees] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    if (!title.trim() || !date || !time) return;
    const iso = new Date(`${date}T${time}:00`).toISOString();
    const res = await fetch(`/api/clients/${clientId}/meetings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        scheduledAt: iso,
        attendees,
        notes,
        outcome: "",
        link: link.trim() || null,
      }),
    });
    if (!res.ok) { alert("יצירה נכשלה"); return; }
    onClose();
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">פגישה חדשה</h2>
        <input className="input mb-2 w-full" placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <input className="input mb-2 w-full" placeholder="משתתפים" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        <input className="input mb-2 w-full" placeholder="קישור (zoom/calendly, אופציונלי)" value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" />
        <textarea className="input mb-3 h-20 w-full" placeholder="הערות" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">ביטול</button>
          <button onClick={submit} className="btn-primary">צור</button>
        </div>
      </div>
    </div>
  );
}

function MeetingDrawer({
  meeting, onClose, onChanged,
}: { meeting: MeetingRow; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(meeting.title);
  const dt = new Date(meeting.scheduledAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const [date, setDate] = useState(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
  const [time, setTime] = useState(`${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
  const [attendees, setAttendees] = useState(meeting.attendees);
  const [notes, setNotes] = useState(meeting.notes);
  const [outcome, setOutcome] = useState(meeting.outcome);
  const [link, setLink] = useState(meeting.link ?? "");
  const [status, setStatus] = useState<PersistedStatus>(meeting.persistedStatus);

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
    const iso = new Date(`${date}T${time}:00`).toISOString();
    const ok = await patch({
      title, scheduledAt: iso, attendees, notes, outcome,
      link: link.trim() || null,
      status,
    });
    if (ok) { onClose(); onChanged(); }
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">פגישה</h2>
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
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-muted">תוצאת הפגישה</span>
          <textarea className="input h-20 w-full" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={del} className="text-sm text-bad">מחק</button>
          <button onClick={save} className="btn-primary">שמור</button>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(sales): meetings list + drawer + new dialog"

---

## Task 12: Sales tasks page

**Files:**
- Create: `src/app/clients/[id]/sales/tasks/page.tsx`

- [ ] **Step 1: Server page**

```tsx
// src/app/clients/[id]/sales/tasks/page.tsx
import { listTasksForClient } from "@/lib/sales/tasks";
import TasksShared, { type TaskRow } from "../../tasks-shared";

export const dynamic = "force-dynamic";

export default async function SalesTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await listTasksForClient(id, "sales");
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskRow["priority"],
    dueDate: t.dueDate?.toISOString() ?? null,
    status: t.status as TaskRow["status"],
    completedAt: t.completedAt?.toISOString() ?? null,
  }));
  return <TasksShared clientId={id} space="sales" tasks={rows} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(sales): tasks page"

---

## Task 13: Update `client-tabs.tsx` and `portfolio-client.tsx`

**Files:**
- Modify: `src/app/clients/[id]/client-tabs.tsx`
- Modify: `src/app/clients/[id]/portfolio-client.tsx`
- Modify: `src/app/clients/[id]/page.tsx`

- [ ] **Step 1: Replace `client-tabs.tsx`**

Replace ENTIRE contents of `src/app/clients/[id]/client-tabs.tsx` with:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}`;
  const onPortfolio = pathname === base;
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b border-border">
        <Link
          href={base}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            onPortfolio ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          פורטפוליו
        </Link>
      </nav>
      {onPortfolio && (
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href={`${base}/sales`}
            className="card flex items-center justify-between gap-3 hover:border-accent"
          >
            <div>
              <div className="text-lg font-semibold">אימון מכירות</div>
              <div className="text-xs text-muted">פגישות והערות, משימות אימון מכירות</div>
            </div>
            <span className="text-2xl">→</span>
          </Link>
          <Link
            href={`${base}/marketing/dashboard`}
            className="card flex items-center justify-between gap-3 hover:border-accent"
          >
            <div>
              <div className="text-lg font-semibold">שיווק</div>
              <div className="text-xs text-muted">דשבורד, דפי נחיתה, חומרים, ניתוח AI, קמפיינים</div>
            </div>
            <span className="text-2xl">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Remove `CampaignsBox` from portfolio**

In `src/app/clients/[id]/portfolio-client.tsx`:

a. **Remove** the `CampaignsBox` invocation in the `ClientPortfolio` component's return JSX. The line is:
```tsx
      <CampaignsBox clientId={props.clientId} attached={props.attached} all={props.allCampaigns} onChange={refresh} />
```
Delete that line.

b. **Remove** the `attached` and `allCampaigns` from the `ClientPortfolio` props type and from the destructuring:
- Remove `attached: Camp[];` and `allCampaigns: Camp[];` from the props interface.
- Remove the prop references.

c. **Remove** the entire `function CampaignsBox(...)` definition (the function and everything inside it).

d. **Remove** the now-unused `type Camp = ...` type alias at the top of the file.

After editing, ensure no stray references to `Camp`, `CampaignsBox`, `attached`, or `allCampaigns` remain in the file.

- [ ] **Step 3: Update `page.tsx` to stop passing campaign props**

In `src/app/clients/[id]/page.tsx`:

a. **Remove** the line `const allCampaigns = await prisma.campaign.findMany({ orderBy: { name: "asc" } });`.

b. **Remove** `campaigns: { include: { campaign: true } },` from the `include` block of the `findUnique`.

c. **Remove** these two lines from the `<ClientPortfolio ... />` invocation:
```tsx
        attached={client.campaigns.map((cc) => ({ id: cc.campaign.id, name: cc.campaign.name, status: cc.campaign.status, objective: cc.campaign.objective }))}
        allCampaigns={allCampaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective }))}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — "refactor(clients): portfolio shows workspace cards, drop campaigns box"

---

## Task 14: Legacy redirects middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write the middleware**

```ts
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LEGACY_PATHS = ["dashboard", "landing", "materials", "analyze"] as const;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Match /clients/<id>/<legacy>[/...]
  const match = pathname.match(/^\/clients\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!match) return NextResponse.next();
  const [, clientId, segment, rest] = match;
  if ((LEGACY_PATHS as readonly string[]).includes(segment)) {
    const url = req.nextUrl.clone();
    url.pathname = `/clients/${clientId}/marketing/${segment}${rest ?? ""}`;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/clients/:id/:segment*"],
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(routing): 308 redirect legacy per-client paths under /marketing/"

---

## Task 15: End-to-end smoke test

- [ ] **Step 1: Boot dev**

Run: `pnpm dev` in one terminal. Wait for "Ready in".

- [ ] **Step 2: Manual flow**

In a browser:
1. Open `http://localhost:3000/clients/<existing-clientId>`. Verify portfolio renders with two big workspace cards (אימון מכירות / שיווק). Verify the campaigns section is gone from the portfolio body.
2. Click "אימון מכירות". Confirm the page header reads "אימון מכירות" with a "פגישות שהתקיימו: 0" chip. Sub-nav shows פגישות (active) and משימות.
3. Click "+ פגישה חדשה". Create a meeting with today's date, time = 5 minutes ago, title "סמוק". Verify the row appears with status chip "ממתינה לעדכון" (because the time has passed).
4. Click the row. Verify the amber banner offers התקיימה / בוטלה / לא הגיעו. Click "התקיימה". Refresh — chip should now read "התקיימה" and the page chip "פגישות שהתקיימו: 1".
5. Click "משימות" in sales sub-nav. Quick-add a task "להתקשר ללקוח", press Enter. Verify it appears. Click it → drawer opens → change priority to "גבוהה" and save. Verify the chip turned red.
6. Go back to portfolio, click "שיווק". Confirm the 6 marketing sub-tabs render. Click "משימות". Quick-add a task "כתוב פוסט". Confirm it does NOT show up in `/clients/<id>/sales/tasks` (different space).
7. Click "קמפיינים". Confirm the attach/detach UI from the old portfolio appears here.
8. Open `http://localhost:3000/clients/<id>/dashboard` — verify the URL is replaced (308) with `/clients/<id>/marketing/dashboard` and the existing dashboard renders.

- [ ] **Step 3: Checkpoint** — "test: e2e sales/marketing smoke verified"

---

## Notes for the Implementer

- **No git repo:** Skip every `git mv`/`git commit`. Use plain `mv` and treat checkpoints as logical milestones.
- **No tests:** `pnpm typecheck` is the only automated gate. Manual smoke covers behavior.
- **Hebrew RTL** is the default; reuse existing utility classes (`card`, `input`, `btn-primary`, `btn-ghost`, `text-muted`, `text-accent`, `text-bad`, `text-good`) from `globals.css`. Do not introduce new ones.
- **`pending_update` is read-only**: never write it to the DB. The Zod enums in the meetings API explicitly omit it.
- **JSON columns**: `Meeting` and `Task` use only scalar columns — no JSON parsing needed.
- **Existing API for campaigns** (`/api/clients/[id]/campaigns`) is untouched. The new marketing/campaigns page just relocates the UI.

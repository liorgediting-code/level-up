# Deadlines, KPI tables, ASTRAL funnels, and notes panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task deadlines in UI, per-client monthly KPI tables, ASTRAL-level funnels with attached campaigns + KPI tables, and a persistent left-side notes panel on client and funnel pages.

**Architecture:** Single Next.js 15 process with Prisma/SQLite. New API routes under `src/app/api/`, server pages with `*-client.tsx` siblings for interactivity. Shared `<MetricsTable>` component reused between client and funnel KPI tables. Notes panel mounts from the app shell based on pathname.

**Tech Stack:** Next.js 15 App Router, Prisma + SQLite, Zod, TailwindCSS. No test suite — verification is `pnpm typecheck` + manual smoke in `pnpm dev`.

**Spec:** `docs/superpowers/specs/2026-05-24-deadlines-kpis-funnels-notes-design.md`

---

## File Map

**Schema (1 file):**
- Modify `prisma/schema.prisma` — add `ClientMetricColumn`, `ClientMetricRow`, `Funnel`, `FunnelCampaign`, `FunnelMetricColumn`, `FunnelMetricRow`, `Note`; add back-relations on `Client` and `Campaign`.

**API (10 routes):**
- Create `src/app/api/clients/[id]/metrics/route.ts` — GET
- Create `src/app/api/clients/[id]/metrics/columns/route.ts` — POST
- Create `src/app/api/clients/[id]/metrics/columns/[columnId]/route.ts` — DELETE
- Create `src/app/api/clients/[id]/metrics/rows/route.ts` — POST
- Create `src/app/api/clients/[id]/metrics/rows/[rowId]/route.ts` — PATCH, DELETE
- Create `src/app/api/funnels/route.ts` — GET, POST
- Create `src/app/api/funnels/[id]/route.ts` — GET, PATCH, DELETE
- Create `src/app/api/funnels/[id]/campaigns/route.ts` — PUT
- Create `src/app/api/funnels/[id]/columns/route.ts`, `.../columns/[columnId]/route.ts`
- Create `src/app/api/funnels/[id]/rows/route.ts`, `.../rows/[rowId]/route.ts`
- Create `src/app/api/notes/route.ts` — GET, POST
- Create `src/app/api/notes/[id]/route.ts` — DELETE
- Modify `src/app/api/tasks/[id]/route.ts` — allow `dueDate` in PATCH (verify it's already accepted; add if not)

**UI components (shared):**
- Create `src/components/metrics-table.tsx` — shared editable table
- Create `src/components/notes-panel.tsx` — fixed left-side notes drawer
- Create `src/lib/metrics.ts` — helpers: `monthKey`, `normalizeMonth`, `formatValue`

**Pages:**
- Modify `src/app/clients/[id]/portfolio-client.tsx` — embed `<MetricsTable>` for client KPIs
- Modify `src/app/clients/[id]/page.tsx` — load metric columns + rows
- Create `src/app/funnels/page.tsx`, `src/app/funnels/funnels-client.tsx` — list + new-funnel form
- Create `src/app/funnels/[id]/page.tsx`, `src/app/funnels/[id]/funnel-client.tsx` — detail
- Modify `src/app/_shell/app-shell.tsx` — add "משפכים" nav link; mount `<NotesPanel>` on client/funnel routes

**Task UI:**
- Modify whichever task-list components render Marketing and Sales tasks (`src/app/clients/[id]/marketing/tasks/*` and `src/app/clients/[id]/sales/*`) — add date input on create + inline edit on row; add overdue color class.

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new models to schema**

Append to `prisma/schema.prisma` (after existing models):

```prisma
model ClientMetricColumn {
  id        String   @id @default(cuid())
  clientId  String
  key       String
  label     String
  unit      String   @default("number")
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([clientId, key])
  @@index([clientId, sortOrder])
}

model ClientMetricRow {
  id          String   @id @default(cuid())
  clientId    String
  periodMonth DateTime
  leads       Int      @default(0)
  revenue     Int      @default(0)
  customers   Int      @default(0)
  extraJson   String   @default("{}")
  updatedAt   DateTime @updatedAt

  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([clientId, periodMonth])
  @@index([clientId, periodMonth])
}

model Funnel {
  id          String   @id @default(cuid())
  name        String
  description String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  campaigns   FunnelCampaign[]
  columns     FunnelMetricColumn[]
  rows        FunnelMetricRow[]
  notes       Note[]
}

model FunnelCampaign {
  funnelId   String
  campaignId String
  createdAt  DateTime @default(now())

  funnel     Funnel   @relation(fields: [funnelId], references: [id], onDelete: Cascade)
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@id([funnelId, campaignId])
  @@index([campaignId])
}

model FunnelMetricColumn {
  id        String   @id @default(cuid())
  funnelId  String
  key       String
  label     String
  unit      String   @default("number")
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  funnel    Funnel   @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  @@unique([funnelId, key])
  @@index([funnelId, sortOrder])
}

model FunnelMetricRow {
  id          String   @id @default(cuid())
  funnelId    String
  periodMonth DateTime
  valuesJson  String   @default("{}")
  updatedAt   DateTime @updatedAt

  funnel      Funnel   @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  @@unique([funnelId, periodMonth])
  @@index([funnelId, periodMonth])
}

model Note {
  id        String   @id @default(cuid())
  scope     String
  targetId  String
  body      String
  createdAt DateTime @default(now())

  clientId  String?
  client    Client?  @relation(fields: [clientId], references: [id], onDelete: Cascade)
  funnelId  String?
  funnel    Funnel?  @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  @@index([scope, targetId, createdAt])
  @@index([clientId])
  @@index([funnelId])
}
```

- [ ] **Step 2: Add back-relations on existing models**

In `Client` model add: `metricColumns ClientMetricColumn[]`, `metricRows ClientMetricRow[]`, `notes Note[]`.

In `Campaign` model add: `funnels FunnelCampaign[]`.

- [ ] **Step 3: Push schema & regenerate client**

```bash
pnpm db:push && pnpm db:generate
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add client/funnel metric tables, funnels, notes"
```

---

## Task 2: Metrics helpers

**Files:**
- Create: `src/lib/metrics.ts`

- [ ] **Step 1: Write helpers**

```typescript
// src/lib/metrics.ts
export type MetricUnit = "number" | "currency" | "percent";

export function normalizeMonth(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabelHe(d: Date): string {
  const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatValue(value: number, unit: MetricUnit): string {
  if (unit === "currency") return `₪${Math.round(value / 100).toLocaleString("he-IL")}`;
  if (unit === "percent") return `${value}%`;
  return value.toLocaleString("he-IL");
}

export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || `col_${Date.now()}`;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/metrics.ts
git commit -m "lib: metric formatting + month helpers"
```

---

## Task 3: Client metrics API

**Files:**
- Create: `src/app/api/clients/[id]/metrics/route.ts`
- Create: `src/app/api/clients/[id]/metrics/columns/route.ts`
- Create: `src/app/api/clients/[id]/metrics/columns/[columnId]/route.ts`
- Create: `src/app/api/clients/[id]/metrics/rows/route.ts`
- Create: `src/app/api/clients/[id]/metrics/rows/[rowId]/route.ts`

- [ ] **Step 1: GET /api/clients/[id]/metrics**

```typescript
// src/app/api/clients/[id]/metrics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [columns, rows] = await Promise.all([
    prisma.clientMetricColumn.findMany({
      where: { clientId: id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.clientMetricRow.findMany({
      where: { clientId: id },
      orderBy: { periodMonth: "desc" },
    }),
  ]);
  return NextResponse.json({
    columns,
    rows: rows.map((r) => ({
      id: r.id,
      periodMonth: r.periodMonth.toISOString(),
      leads: r.leads,
      revenue: r.revenue,
      customers: r.customers,
      extra: JSON.parse(r.extraJson || "{}") as Record<string, number>,
    })),
  });
}
```

- [ ] **Step 2: Columns POST + DELETE**

```typescript
// src/app/api/clients/[id]/metrics/columns/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/metrics";

export const runtime = "nodejs";
const Body = z.object({ label: z.string().min(1).max(60), unit: z.enum(["number","currency","percent"]).default("number") });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const existing = await prisma.clientMetricColumn.findMany({ where: { clientId: id }, select: { key: true, sortOrder: true } });
  const taken = new Set(existing.map((c) => c.key));
  let key = slugify(parsed.data.label);
  let i = 2;
  while (taken.has(key)) key = `${slugify(parsed.data.label)}_${i++}`;
  const sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
  const col = await prisma.clientMetricColumn.create({
    data: { clientId: id, key, label: parsed.data.label, unit: parsed.data.unit, sortOrder },
  });
  return NextResponse.json(col, { status: 201 });
}
```

```typescript
// src/app/api/clients/[id]/metrics/columns/[columnId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; columnId: string }> }) {
  const { columnId } = await ctx.params;
  await prisma.clientMetricColumn.delete({ where: { id: columnId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Rows POST + PATCH + DELETE**

```typescript
// src/app/api/clients/[id]/metrics/rows/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeMonth } from "@/lib/metrics";

export const runtime = "nodejs";
const Body = z.object({ periodMonth: z.string().min(7) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const monthDate = normalizeMonth(parsed.data.periodMonth + (parsed.data.periodMonth.length === 7 ? "-01" : ""));
  const row = await prisma.clientMetricRow.upsert({
    where: { clientId_periodMonth: { clientId: id, periodMonth: monthDate } },
    update: {},
    create: { clientId: id, periodMonth: monthDate },
  });
  return NextResponse.json(row, { status: 201 });
}
```

```typescript
// src/app/api/clients/[id]/metrics/rows/[rowId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const Patch = z.object({
  leads: z.number().int().nonnegative().optional(),
  revenue: z.number().int().nonnegative().optional(),
  customers: z.number().int().nonnegative().optional(),
  extra: z.record(z.string(), z.number()).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; rowId: string }> }) {
  const { rowId } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { extra, ...builtins } = parsed.data;
  const current = await prisma.clientMetricRow.findUnique({ where: { id: rowId }, select: { extraJson: true } });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const merged = { ...(JSON.parse(current.extraJson || "{}") as Record<string, number>), ...(extra ?? {}) };
  const row = await prisma.clientMetricRow.update({
    where: { id: rowId },
    data: { ...builtins, extraJson: JSON.stringify(merged) },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; rowId: string }> }) {
  const { rowId } = await ctx.params;
  await prisma.clientMetricRow.delete({ where: { id: rowId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/api/clients/[id]/metrics src/lib/metrics.ts
git commit -m "api: client metric columns and monthly rows"
```

---

## Task 4: Funnels API

**Files:**
- Create: `src/app/api/funnels/route.ts`
- Create: `src/app/api/funnels/[id]/route.ts`
- Create: `src/app/api/funnels/[id]/campaigns/route.ts`
- Create: `src/app/api/funnels/[id]/columns/route.ts`
- Create: `src/app/api/funnels/[id]/columns/[columnId]/route.ts`
- Create: `src/app/api/funnels/[id]/rows/route.ts`
- Create: `src/app/api/funnels/[id]/rows/[rowId]/route.ts`

- [ ] **Step 1: List + create funnels**

```typescript
// src/app/api/funnels/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const Body = z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).optional() });

export async function GET() {
  const funnels = await prisma.funnel.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { campaigns: true } } },
  });
  return NextResponse.json(funnels.map((f) => ({
    id: f.id, name: f.name, description: f.description,
    campaignCount: f._count.campaigns, updatedAt: f.updatedAt.toISOString(),
  })));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const f = await prisma.funnel.create({ data: { name: parsed.data.name, description: parsed.data.description ?? "" } });
  return NextResponse.json(f, { status: 201 });
}
```

- [ ] **Step 2: Get / update / delete a funnel**

```typescript
// src/app/api/funnels/[id]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const Patch = z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(2000).optional() });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = await prisma.funnel.findUnique({
    where: { id },
    include: {
      campaigns: { include: { campaign: { select: { id: true, name: true } } } },
      columns: { orderBy: { sortOrder: "asc" } },
      rows: { orderBy: { periodMonth: "desc" } },
    },
  });
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: f.id, name: f.name, description: f.description,
    campaigns: f.campaigns.map((c) => c.campaign),
    columns: f.columns,
    rows: f.rows.map((r) => ({
      id: r.id, periodMonth: r.periodMonth.toISOString(),
      values: JSON.parse(r.valuesJson || "{}") as Record<string, number>,
    })),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const f = await prisma.funnel.update({ where: { id }, data: parsed.data });
  return NextResponse.json(f);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.funnel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Attach campaigns (replace-set)**

```typescript
// src/app/api/funnels/[id]/campaigns/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const Body = z.object({ campaignIds: z.array(z.string()).max(500) });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  await prisma.$transaction([
    prisma.funnelCampaign.deleteMany({ where: { funnelId: id } }),
    prisma.funnelCampaign.createMany({
      data: parsed.data.campaignIds.map((cid) => ({ funnelId: id, campaignId: cid })),
    }),
    prisma.funnel.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Funnel columns (mirror client columns)**

```typescript
// src/app/api/funnels/[id]/columns/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/metrics";

export const runtime = "nodejs";
const Body = z.object({ label: z.string().min(1).max(60), unit: z.enum(["number","currency","percent"]).default("number") });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const existing = await prisma.funnelMetricColumn.findMany({ where: { funnelId: id }, select: { key: true, sortOrder: true } });
  const taken = new Set(existing.map((c) => c.key));
  let key = slugify(parsed.data.label);
  let i = 2;
  while (taken.has(key)) key = `${slugify(parsed.data.label)}_${i++}`;
  const sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
  const col = await prisma.funnelMetricColumn.create({
    data: { funnelId: id, key, label: parsed.data.label, unit: parsed.data.unit, sortOrder },
  });
  return NextResponse.json(col, { status: 201 });
}
```

```typescript
// src/app/api/funnels/[id]/columns/[columnId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; columnId: string }> }) {
  const { columnId } = await ctx.params;
  await prisma.funnelMetricColumn.delete({ where: { id: columnId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Funnel rows**

```typescript
// src/app/api/funnels/[id]/rows/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeMonth } from "@/lib/metrics";

export const runtime = "nodejs";
const Body = z.object({ periodMonth: z.string().min(7) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const monthDate = normalizeMonth(parsed.data.periodMonth + (parsed.data.periodMonth.length === 7 ? "-01" : ""));
  const row = await prisma.funnelMetricRow.upsert({
    where: { funnelId_periodMonth: { funnelId: id, periodMonth: monthDate } },
    update: {},
    create: { funnelId: id, periodMonth: monthDate },
  });
  return NextResponse.json(row, { status: 201 });
}
```

```typescript
// src/app/api/funnels/[id]/rows/[rowId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const Patch = z.object({ values: z.record(z.string(), z.number()) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; rowId: string }> }) {
  const { rowId } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const current = await prisma.funnelMetricRow.findUnique({ where: { id: rowId }, select: { valuesJson: true } });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const merged = { ...(JSON.parse(current.valuesJson || "{}") as Record<string, number>), ...parsed.data.values };
  const row = await prisma.funnelMetricRow.update({ where: { id: rowId }, data: { valuesJson: JSON.stringify(merged) } });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; rowId: string }> }) {
  const { rowId } = await ctx.params;
  await prisma.funnelMetricRow.delete({ where: { id: rowId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/api/funnels
git commit -m "api: funnels with campaigns + metric columns/rows"
```

---

## Task 5: Notes API

**Files:**
- Create: `src/app/api/notes/route.ts`
- Create: `src/app/api/notes/[id]/route.ts`

- [ ] **Step 1: GET + POST notes**

```typescript
// src/app/api/notes/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const Scope = z.enum(["client", "funnel"]);
const Body = z.object({ scope: Scope, targetId: z.string().min(1), body: z.string().min(1).max(4000) });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = Scope.safeParse(url.searchParams.get("scope") ?? "");
  const targetId = url.searchParams.get("targetId") ?? "";
  if (!scope.success || !targetId) return NextResponse.json({ error: "missing scope/targetId" }, { status: 400 });
  const notes = await prisma.note.findMany({
    where: { scope: scope.data, targetId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() })));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const body = parsed.data.body.trim();
  if (!body) return NextResponse.json({ error: "empty body" }, { status: 400 });
  const note = await prisma.note.create({
    data: {
      scope: parsed.data.scope,
      targetId: parsed.data.targetId,
      body,
      clientId: parsed.data.scope === "client" ? parsed.data.targetId : null,
      funnelId: parsed.data.scope === "funnel" ? parsed.data.targetId : null,
    },
  });
  return NextResponse.json({ id: note.id, body: note.body, createdAt: note.createdAt.toISOString() }, { status: 201 });
}
```

- [ ] **Step 2: DELETE note**

```typescript
// src/app/api/notes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/api/notes
git commit -m "api: notes for client/funnel scopes"
```

---

## Task 6: MetricsTable shared component

**Files:**
- Create: `src/components/metrics-table.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/components/metrics-table.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatValue, monthLabelHe, monthKey, type MetricUnit } from "@/lib/metrics";

export type Column = { id?: string; key: string; label: string; unit: MetricUnit; builtin?: boolean };
export type Row = { id: string; periodMonth: string; values: Record<string, number> };

export default function MetricsTable(props: {
  columns: Column[];
  rows: Row[];
  endpoints: {
    addColumn: string;        // POST { label, unit }
    deleteColumn: (colId: string) => string; // DELETE
    addRow: string;           // POST { periodMonth: "YYYY-MM" }
    patchRow: (rowId: string) => string; // PATCH
    deleteRow: (rowId: string) => string;
  };
  rowPatchShape: "client" | "funnel"; // client: { leads/revenue/customers/extra }, funnel: { values }
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [colLabel, setColLabel] = useState("");
  const [colUnit, setColUnit] = useState<MetricUnit>("number");

  async function addColumn() {
    if (!colLabel.trim()) return;
    await fetch(props.endpoints.addColumn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: colLabel.trim(), unit: colUnit }),
    });
    setColLabel(""); setAdding(false); router.refresh();
  }

  async function deleteColumn(colId: string) {
    if (!confirm("למחוק את העמודה?")) return;
    await fetch(props.endpoints.deleteColumn(colId), { method: "DELETE" });
    router.refresh();
  }

  async function addRow() {
    const now = new Date();
    const mk = monthKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
    await fetch(props.endpoints.addRow, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodMonth: mk }),
    });
    router.refresh();
  }

  async function deleteRow(rowId: string) {
    if (!confirm("למחוק את החודש?")) return;
    await fetch(props.endpoints.deleteRow(rowId), { method: "DELETE" });
    router.refresh();
  }

  async function commitCell(rowId: string, key: string, value: number, builtin: boolean) {
    let body: Record<string, unknown>;
    if (props.rowPatchShape === "client") {
      body = builtin ? { [key]: value } : { extra: { [key]: value } };
    } else {
      body = { values: { [key]: value } };
    }
    await fetch(props.endpoints.patchRow(rowId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={addRow} className="rounded-md bg-accent px-3 py-1.5 text-xs text-white">+ הוסף חודש</button>
        {!adding ? (
          <button onClick={() => setAdding(true)} className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs">+ הוסף עמודה</button>
        ) : (
          <div className="flex items-center gap-2">
            <input value={colLabel} onChange={(e) => setColLabel(e.target.value)} placeholder="שם העמודה" className="rounded-md border border-border bg-bg px-2 py-1 text-xs" />
            <select value={colUnit} onChange={(e) => setColUnit(e.target.value as MetricUnit)} className="rounded-md border border-border bg-bg px-2 py-1 text-xs">
              <option value="number">מספר</option>
              <option value="currency">מטבע (₪)</option>
              <option value="percent">אחוז</option>
            </select>
            <button onClick={addColumn} className="rounded-md bg-accent px-3 py-1.5 text-xs text-white">הוסף</button>
            <button onClick={() => { setAdding(false); setColLabel(""); }} className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs">ביטול</button>
          </div>
        )}
      </div>
      {props.rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted">אין נתונים — הוסף חודש כדי להתחיל.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-bg text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-right">חודש</th>
                {props.columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-right">
                    <div className="flex items-center justify-between gap-2">
                      <span>{c.label}</span>
                      {!c.builtin && c.id && (
                        <button onClick={() => deleteColumn(c.id!)} className="text-rose-500 hover:underline" title="מחק עמודה">×</button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((r) => {
                const d = new Date(r.periodMonth);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{monthLabelHe(d)}</td>
                    {props.columns.map((c) => {
                      const v = r.values[c.key] ?? 0;
                      return (
                        <td key={c.key} className="px-3 py-2">
                          <CellEditor
                            value={v}
                            unit={c.unit}
                            onCommit={(nv) => commitCell(r.id, c.key, nv, !!c.builtin)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-left">
                      <button onClick={() => deleteRow(r.id)} className="text-xs text-rose-500 hover:underline">מחק</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CellEditor(props: { value: number; unit: MetricUnit; onCommit: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(props.unit === "currency" ? Math.round(props.value / 100) : props.value));
  if (!editing) {
    return (
      <button className="w-full text-right hover:underline" onClick={() => setEditing(true)}>
        {formatValue(props.value, props.unit)}
      </button>
    );
  }
  function commit() {
    const n = Number(raw.replace(/[^\d.-]/g, "")) || 0;
    const stored = props.unit === "currency" ? Math.round(n * 100) : Math.round(n);
    props.onCommit(stored);
    setEditing(false);
  }
  return (
    <input
      autoFocus
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-right text-sm"
    />
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/metrics-table.tsx
git commit -m "ui: shared metrics table component"
```

---

## Task 7: Client KPI table on portfolio

**Files:**
- Modify: `src/app/clients/[id]/page.tsx`
- Modify: `src/app/clients/[id]/portfolio-client.tsx`

- [ ] **Step 1: Server-fetch columns + rows in `page.tsx`**

In the existing Prisma calls inside `page.tsx`, additionally fetch `prisma.clientMetricColumn.findMany({ where: { clientId: id }, orderBy: { sortOrder: "asc" } })` and `prisma.clientMetricRow.findMany({ where: { clientId: id }, orderBy: { periodMonth: "desc" } })`. Pass to `<PortfolioClient>` as new props `metricColumns` and `metricRows`, mapping rows to `{ id, periodMonth: r.periodMonth.toISOString(), leads: r.leads, revenue: r.revenue, customers: r.customers, extra: JSON.parse(r.extraJson || "{}") }`.

- [ ] **Step 2: Render `<MetricsTable>` in `portfolio-client.tsx`**

Add a new section after payments and before analysis history:

```tsx
import MetricsTable, { type Column, type Row } from "@/components/metrics-table";

// inside the component, build columns:
const metricColumns: Column[] = [
  { key: "leads", label: "לידים", unit: "number", builtin: true },
  { key: "revenue", label: "הכנסות", unit: "currency", builtin: true },
  { key: "customers", label: "לקוחות", unit: "number", builtin: true },
  ...props.metricColumns.map((c) => ({ id: c.id, key: c.key, label: c.label, unit: c.unit as Column["unit"] })),
];
const metricRows: Row[] = props.metricRows.map((r) => ({
  id: r.id,
  periodMonth: r.periodMonth,
  values: { leads: r.leads, revenue: r.revenue, customers: r.customers, ...r.extra },
}));

// JSX section:
<section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
  <h2 className="text-sm font-semibold">מדדים חודשיים</h2>
  <MetricsTable
    columns={metricColumns}
    rows={metricRows}
    rowPatchShape="client"
    endpoints={{
      addColumn: `/api/clients/${props.id}/metrics/columns`,
      deleteColumn: (cid) => `/api/clients/${props.id}/metrics/columns/${cid}`,
      addRow: `/api/clients/${props.id}/metrics/rows`,
      patchRow: (rid) => `/api/clients/${props.id}/metrics/rows/${rid}`,
      deleteRow: (rid) => `/api/clients/${props.id}/metrics/rows/${rid}`,
    }}
  />
</section>
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/clients/[id]/page.tsx src/app/clients/[id]/portfolio-client.tsx
git commit -m "ui: monthly KPI table on client portfolio"
```

---

## Task 8: Funnels list + new-funnel page

**Files:**
- Create: `src/app/funnels/page.tsx`
- Create: `src/app/funnels/funnels-client.tsx`

- [ ] **Step 1: List page (server)**

```tsx
// src/app/funnels/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import FunnelsClient from "./funnels-client";

export const dynamic = "force-dynamic";

export default async function FunnelsPage() {
  const funnels = await prisma.funnel.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { campaigns: true } } },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">משפכים</h1>
      </div>
      <FunnelsClient
        funnels={funnels.map((f) => ({
          id: f.id, name: f.name, description: f.description,
          campaignCount: f._count.campaigns,
          updatedAt: f.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Client with new-funnel form + list**

```tsx
// src/app/funnels/funnels-client.tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type F = { id: string; name: string; description: string; campaignCount: number; updatedAt: string };

export default function FunnelsClient(props: { funnels: F[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/funnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.ok) { const f = await res.json(); router.push(`/funnels/${f.id}`); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold">משפך חדש</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם המשפך" className="rounded-md border border-border bg-bg px-3 py-2 text-sm" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור קצר" className="rounded-md border border-border bg-bg px-3 py-2 text-sm" />
          <button onClick={create} disabled={busy || !name.trim()} className="rounded-md bg-accent px-4 py-2 text-sm text-white disabled:opacity-50">צור</button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        {props.funnels.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">אין עדיין משפכים.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="px-3 py-2 text-right">שם</th><th className="px-3 py-2 text-right">תיאור</th><th className="px-3 py-2 text-right">קמפיינים</th><th className="px-3 py-2 text-right">עודכן</th></tr>
            </thead>
            <tbody>
              {props.funnels.map((f) => (
                <tr key={f.id} className="border-t border-border hover:bg-bg">
                  <td className="px-3 py-2"><Link href={`/funnels/${f.id}`} className="font-medium hover:underline">{f.name}</Link></td>
                  <td className="px-3 py-2 text-muted">{f.description || "—"}</td>
                  <td className="px-3 py-2">{f.campaignCount}</td>
                  <td className="px-3 py-2 text-muted">{new Date(f.updatedAt).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/funnels/page.tsx src/app/funnels/funnels-client.tsx
git commit -m "ui: funnels list and create form"
```

---

## Task 9: Funnel detail page

**Files:**
- Create: `src/app/funnels/[id]/page.tsx`
- Create: `src/app/funnels/[id]/funnel-client.tsx`

- [ ] **Step 1: Server page**

```tsx
// src/app/funnels/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import FunnelClient from "./funnel-client";

export const dynamic = "force-dynamic";

export default async function FunnelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [funnel, allCampaigns] = await Promise.all([
    prisma.funnel.findUnique({
      where: { id },
      include: {
        campaigns: { include: { campaign: { select: { id: true, name: true } } } },
        columns: { orderBy: { sortOrder: "asc" } },
        rows: { orderBy: { periodMonth: "desc" } },
      },
    }),
    prisma.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!funnel) notFound();
  return (
    <FunnelClient
      id={funnel.id}
      name={funnel.name}
      description={funnel.description}
      attachedCampaignIds={funnel.campaigns.map((c) => c.campaign.id)}
      allCampaigns={allCampaigns}
      columns={funnel.columns.map((c) => ({ id: c.id, key: c.key, label: c.label, unit: c.unit as "number" | "currency" | "percent" }))}
      rows={funnel.rows.map((r) => ({ id: r.id, periodMonth: r.periodMonth.toISOString(), values: JSON.parse(r.valuesJson || "{}") }))}
    />
  );
}
```

- [ ] **Step 2: Client component**

```tsx
// src/app/funnels/[id]/funnel-client.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import MetricsTable, { type Column, type Row } from "@/components/metrics-table";

type Lite = { id: string; name: string };

export default function FunnelClient(props: {
  id: string;
  name: string;
  description: string;
  attachedCampaignIds: string[];
  allCampaigns: Lite[];
  columns: Column[];
  rows: Row[];
}) {
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [description, setDescription] = useState(props.description);
  const [attached, setAttached] = useState<Set<string>>(new Set(props.attachedCampaignIds));

  async function saveHeader() {
    await fetch(`/api/funnels/${props.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || props.name, description }),
    });
    router.refresh();
  }

  async function toggleCampaign(cid: string) {
    const next = new Set(attached);
    next.has(cid) ? next.delete(cid) : next.add(cid);
    setAttached(next);
    await fetch(`/api/funnels/${props.id}/campaigns`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignIds: [...next] }),
    });
    router.refresh();
  }

  async function remove() {
    if (!confirm("למחוק את המשפך?")) return;
    const res = await fetch(`/api/funnels/${props.id}`, { method: "DELETE" });
    if (res.ok) router.push("/funnels");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-lg font-semibold" />
          <button onClick={saveHeader} className="rounded-md bg-accent px-3 py-2 text-sm text-white">שמור</button>
          <button onClick={remove} className="rounded-md border border-rose-500/40 px-3 py-2 text-sm text-rose-500">מחק</button>
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור המשפך" rows={2} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
      </header>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">קמפיינים משויכים ({attached.size})</h2>
        {props.allCampaigns.length === 0 ? (
          <div className="text-xs text-muted">אין קמפיינים זמינים. סנכרן מ-Meta כדי להוסיף.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {props.allCampaigns.map((c) => {
              const on = attached.has(c.id);
              return (
                <button key={c.id} onClick={() => toggleCampaign(c.id)} className={`rounded-full px-3 py-1.5 text-xs border ${on ? "bg-accent text-white border-accent" : "bg-bg border-border"}`}>
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">מדדים חודשיים</h2>
        <MetricsTable
          columns={props.columns}
          rows={props.rows}
          rowPatchShape="funnel"
          endpoints={{
            addColumn: `/api/funnels/${props.id}/columns`,
            deleteColumn: (cid) => `/api/funnels/${props.id}/columns/${cid}`,
            addRow: `/api/funnels/${props.id}/rows`,
            patchRow: (rid) => `/api/funnels/${props.id}/rows/${rid}`,
            deleteRow: (rid) => `/api/funnels/${props.id}/rows/${rid}`,
          }}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/app/funnels/[id]
git commit -m "ui: funnel detail with campaign multi-select and metrics"
```

---

## Task 10: Notes panel + shell wiring

**Files:**
- Create: `src/components/notes-panel.tsx`
- Modify: `src/app/_shell/app-shell.tsx`

- [ ] **Step 1: Notes panel component**

```tsx
// src/components/notes-panel.tsx
"use client";
import { useEffect, useState } from "react";

type Note = { id: string; body: string; createdAt: string };

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "עכשיו";
  const m = Math.floor(s / 60);
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  const d = Math.floor(h / 24);
  return `לפני ${d} ימים`;
}

export default function NotesPanel(props: { scope: "client" | "funnel"; targetId: string }) {
  const STORE_KEY = "notes-panel:open";
  const [open, setOpen] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
    if (saved !== null) setOpen(saved === "1");
    else if (typeof window !== "undefined" && window.innerWidth < 768) setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORE_KEY, open ? "1" : "0");
    document.body.classList.toggle("with-notes-panel", open);
    return () => { document.body.classList.remove("with-notes-panel"); };
  }, [open]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/notes?scope=${props.scope}&targetId=${encodeURIComponent(props.targetId)}`)
      .then((r) => r.json())
      .then((rows: Note[]) => { if (!cancel) { setNotes(rows); setLoading(false); } })
      .catch(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [props.scope, props.targetId]);

  async function add() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: props.scope, targetId: props.targetId, body }),
    });
    if (res.ok) {
      const n: Note = await res.json();
      setNotes((prev) => [n, ...prev]);
    } else {
      setDraft(body);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את ההערה?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-md border border-l-0 border-border bg-surface px-2 py-3 text-xs"
        title="פתח הערות"
      >
        הערות »
      </button>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-30 h-screen w-80 border-l border-border bg-surface flex flex-col" dir="rtl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">הערות</span>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-fg" title="סגור">«</button>
      </div>
      <div className="border-b border-border p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add(); }}
          placeholder="כתוב הערה…"
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
          <span>⌘/Ctrl + Enter לשליחה</span>
          <button onClick={add} disabled={!draft.trim()} className="rounded-md bg-accent px-2 py-1 text-white disabled:opacity-50">שלח</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading ? (
          <div className="text-center text-xs text-muted py-4">טוען…</div>
        ) : notes.length === 0 ? (
          <div className="text-center text-xs text-muted py-4">אין הערות עדיין.</div>
        ) : notes.map((n) => (
          <div key={n.id} className="group rounded-md border border-border bg-bg p-2 text-sm">
            <div className="whitespace-pre-wrap break-words">{n.body}</div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
              <span>{relTime(n.createdAt)}</span>
              <button onClick={() => remove(n.id)} className="opacity-0 group-hover:opacity-100 text-rose-500 hover:underline">מחק</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Mount from app shell + add nav link**

Read `src/app/_shell/app-shell.tsx`. Modifications:

1. Add a nav link to "משפכים" → `/funnels`, placed adjacent to the "לקוחות" / "CRM" links.
2. Make the shell a client component (or wrap a small client child) that calls `usePathname()` and conditionally renders `<NotesPanel>`:

```tsx
"use client";
import { usePathname } from "next/navigation";
import NotesPanel from "@/components/notes-panel";
// ... existing imports ...

// inside the component body, before rendering children:
const pathname = usePathname();
const clientMatch = /^\/clients\/([^/]+)(?:\/|$)/.exec(pathname);
const funnelMatch = /^\/funnels\/([^/]+)(?:\/|$)/.exec(pathname);
const noteScope = clientMatch ? { scope: "client" as const, targetId: clientMatch[1] }
  : funnelMatch ? { scope: "funnel" as const, targetId: funnelMatch[1] } : null;

// in JSX, alongside the rendered children:
{noteScope && <NotesPanel scope={noteScope.scope} targetId={noteScope.targetId} />}
```

If the shell is currently a server component, extract the dynamic part into a sibling `app-shell-client.tsx` and have the server shell render `<AppShellClient>{children}</AppShellClient>`. Wire the nav links as `<Link>` so server-rendered links continue to work.

3. Add to `src/app/globals.css` (or wherever Tailwind globals live) a small rule so the main content shifts when the notes panel is open:

```css
body.with-notes-panel main { padding-left: 20rem; }
@media (max-width: 768px) { body.with-notes-panel main { padding-left: 0; } }
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/notes-panel.tsx src/app/_shell/app-shell.tsx src/app/globals.css
git commit -m "ui: notes panel mounted on client/funnel routes + nav link to funnels"
```

---

## Task 11: Task deadlines in UI

**Files (to discover during execution):**
- Modify the marketing tasks list/create UI under `src/app/clients/[id]/marketing/tasks/*`
- Modify the sales tasks list/create UI under `src/app/clients/[id]/sales/*`
- Verify or extend `src/app/api/tasks/[id]/route.ts` to accept `dueDate`

- [ ] **Step 1: Verify the task PATCH route accepts `dueDate`**

Open `src/app/api/tasks/[id]/route.ts`. If the Zod schema does not list `dueDate`, add:
```typescript
dueDate: z.string().datetime().nullable().optional()
```
and in the update body include `dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : (parsed.data.dueDate === null ? null : undefined)`.

Same check for the POST/create route if there is one.

- [ ] **Step 2: Add date input to task create forms**

In each task create form, add:
```tsx
<input
  type="date"
  value={due}
  onChange={(e) => setDue(e.target.value)}
  className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
/>
```
and include in the POST body: `dueDate: due ? new Date(due).toISOString() : null`.

- [ ] **Step 3: Add inline edit + overdue color in task list rows**

For each task row, render:
```tsx
{(() => {
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
  return (
    <input
      type="date"
      value={task.dueDate ? new Date(task.dueDate).toISOString().slice(0,10) : ""}
      onChange={async (e) => {
        await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null }),
        });
        router.refresh();
      }}
      className={`rounded-md border border-border bg-bg px-2 py-1 text-xs ${overdue ? "text-amber-500" : "text-muted"}`}
    />
  );
})()}
```

- [ ] **Step 4: Typecheck + manual smoke**

```bash
pnpm typecheck
```

Manually in `pnpm dev`: open a client, add a task with a due date, mark another task with a past due date and confirm it renders amber.

- [ ] **Step 5: Commit**

```bash
git add src/app/clients src/app/api/tasks
git commit -m "ui: task deadlines on create + inline edit + overdue color"
```

---

## Task 12: Final manual smoke + final commit

- [ ] **Step 1: Run dev and walk through**

`pnpm dev` (already running in background). Visit in browser:
1. `/clients/<id>` — add a metric column, add a month row, edit a cell. Confirm it persists across refresh.
2. `/funnels` — create a funnel, navigate to its detail, attach campaigns, add metric column + row, edit a value.
3. Notes panel — open on client and funnel pages; add a note, refresh, confirm it's there; delete it.
4. Tasks — create a task with a due date; edit it inline; confirm overdue styling.

- [ ] **Step 2: Final typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Push**

(Only if user asks.)

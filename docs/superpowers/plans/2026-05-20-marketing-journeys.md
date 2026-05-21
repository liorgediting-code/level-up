# Marketing Journeys + Client Creation Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `salesMeetingsTarget` to clients, capture marketing path choices (organic / paid / both) at creation, drive each path through sequential journey stages with per-video checklists, and mirror every active stage as a row in the per-client Tasks list so the missions tab stays in sync.

**Architecture:** Three new Prisma models (`Journey`, `JourneyStage`, `JourneyVideoItem`); 2 fields added to existing models (`Client.salesMeetingsTarget`, `Task.linkedStageId`). A `src/lib/journeys/` module owns templates and transactional progression logic (`advanceStage`, `revertStage`, `toggleVideoItem`). API: extended `POST /api/clients` + `PATCH /api/clients/[id]`, new journeys endpoints, modified tasks PATCH/DELETE that re-routes through journey sync when a task is linked. UI: 2-step client-creation modal, new `/marketing/journeys` tab with stepper + per-stage panel, sales counter shows held/target, marketing/tasks page renders journey-origin badges.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + SQLite, Zod, Tailwind. No test framework per CLAUDE.md — `pnpm typecheck` is the verification gate. Repo is not git-initialized — "checkpoint" markers replace commits.

---

## File Structure

**Modify:**
- `prisma/schema.prisma` — add 3 models + 2 field additions.
- `src/app/api/clients/route.ts` — accept `salesMeetingsTarget` and `journeys[]` in POST.
- `src/app/api/clients/[id]/route.ts` — accept `salesMeetingsTarget` in PATCH.
- `src/app/api/tasks/[id]/route.ts` — route status changes through journey sync; reject DELETE for linked tasks.
- `src/app/clients/new-client-form.tsx` — convert inline form to "+ לקוח חדש" button opening a 2-step modal.
- `src/app/clients/[id]/marketing/marketing-tabs.tsx` — insert "מסלולים" tab before "משימות".
- `src/app/clients/[id]/marketing/tasks/page.tsx` — eager-load linked stage + journey for badge rendering.
- `src/app/clients/[id]/tasks-shared.tsx` — render journey-kind badge, disable delete for linked rows.
- `src/app/clients/[id]/sales/layout.tsx` — counter shows "N / Y" when target set; inline pencil to edit target.

**Create:**
- `src/lib/journeys/templates.ts` — `ORGANIC_STAGES`, `PAID_STAGES`, `stageLabel`, `kindLabel`, `taskTitleFor`.
- `src/lib/journeys/create.ts` — `createJourneyForClient(tx, clientId, kind, videoCount)`.
- `src/lib/journeys/advance.ts` — `advanceActiveStage`, `revertCompletedStage`, `toggleVideoItem`.
- `src/lib/journeys/sync.ts` — `syncFromTaskStatusChange(taskId, newStatus)`.
- `src/app/api/clients/[id]/journeys/route.ts` — POST.
- `src/app/api/journeys/[id]/route.ts` — DELETE.
- `src/app/api/journeys/[id]/stages/[stageId]/route.ts` — PATCH.
- `src/app/api/journeys/[id]/stages/[stageId]/videos/[videoIndex]/route.ts` — PATCH.
- `src/app/clients/[id]/marketing/journeys/page.tsx` — server.
- `src/app/clients/[id]/marketing/journeys/journeys-client.tsx` — UI (stepper + active stage panel + add-journey dialog).

---

## Task 1: Prisma models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update `Client` model**

Inside the existing `model Client {` block, add `salesMeetingsTarget Int?` to the scalar fields, and `journeys Journey[]` to the relations list (alongside the existing `meetings`, `tasks`, etc.).

- [ ] **Step 2: Update `Task` model**

Inside the existing `model Task {` block, add a scalar field `linkedStageId String? @unique` and a relation `linkedStage JourneyStage? @relation(fields: [linkedStageId], references: [id], onDelete: SetNull)`.

- [ ] **Step 3: Append new models**

Append to the end of `prisma/schema.prisma`:

```prisma
model Journey {
  id                 String   @id @default(cuid())
  clientId           String
  kind               String   // organic | paid
  videoCount         Int
  status             String   @default("active") // active | completed
  currentStageIndex  Int      @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  client Client         @relation(fields: [clientId], references: [id], onDelete: Cascade)
  stages JourneyStage[]

  @@unique([clientId, kind])
  @@index([clientId])
}

model JourneyStage {
  id          String   @id @default(cuid())
  journeyId   String
  index       Int
  kind        String   // writing | filming | editing | strategy | ads_writing | ad_filming | creative
  mode        String   // single | per_video
  docLink     String?
  filmingDate DateTime?
  status      String   @default("locked") // locked | active | done
  taskId      String?  @unique

  journey    Journey            @relation(fields: [journeyId], references: [id], onDelete: Cascade)
  task       Task?
  videoItems JourneyVideoItem[]

  @@index([journeyId])
}

model JourneyVideoItem {
  id      String    @id @default(cuid())
  stageId String
  index   Int
  done    Boolean   @default(false)
  doneAt  DateTime?

  stage JourneyStage @relation(fields: [stageId], references: [id], onDelete: Cascade)

  @@unique([stageId, index])
}
```

- [ ] **Step 4: Push and regenerate**

Run:
```
pnpm db:push
pnpm db:generate
```
Expected: "Your database is now in sync with your Prisma schema." then client regenerates.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors. (Existing code that touches `task.create({...})` does not pass `linkedStageId`, which is fine since it's optional.)

- [ ] **Step 6: Checkpoint** — "feat(journey): Prisma models for Journey/JourneyStage/JourneyVideoItem"

---

## Task 2: Stage templates

**Files:**
- Create: `src/lib/journeys/templates.ts`

- [ ] **Step 1: Write the templates module**

```ts
// src/lib/journeys/templates.ts
export type JourneyKind = "organic" | "paid";
export type StageKind =
  | "writing" | "filming" | "editing"
  | "strategy" | "ads_writing" | "ad_filming" | "creative";
export type StageMode = "single" | "per_video";

export type StageTemplate = { index: number; kind: StageKind; mode: StageMode };

export const ORGANIC_STAGES: StageTemplate[] = [
  { index: 0, kind: "writing", mode: "single" },
  { index: 1, kind: "filming", mode: "single" },
  { index: 2, kind: "editing", mode: "per_video" },
];

export const PAID_STAGES: StageTemplate[] = [
  { index: 0, kind: "strategy",    mode: "single" },
  { index: 1, kind: "ads_writing", mode: "per_video" },
  { index: 2, kind: "ad_filming",  mode: "per_video" },
  { index: 3, kind: "creative",    mode: "per_video" },
];

export function templateFor(kind: JourneyKind): StageTemplate[] {
  return kind === "organic" ? ORGANIC_STAGES : PAID_STAGES;
}

export const STAGE_LABEL: Record<StageKind, string> = {
  writing: "כתיבת תסריטים",
  filming: "יום צילום",
  editing: "עריכת סרטונים",
  strategy: "אסטרטגיית מודעות",
  ads_writing: "כתיבת מודעות",
  ad_filming: "צילום מודעות",
  creative: "קריאייטיב",
};

export const KIND_LABEL: Record<JourneyKind, string> = {
  organic: "אורגני",
  paid: "ממומן",
};

export const KIND_BADGE_COLOR: Record<JourneyKind, string> = {
  organic: "#ec4899",
  paid: "#a855f7",
};

export function taskTitleFor(stageKind: StageKind, journeyKind: JourneyKind): string {
  return `${STAGE_LABEL[stageKind]} — ${KIND_LABEL[journeyKind]}`;
}

export function taskDescriptionFor(stageIndex: number, totalStages: number, journeyKind: JourneyKind): string {
  return `שלב ${stageIndex + 1} מתוך ${totalStages} במסלול ${KIND_LABEL[journeyKind]}`;
}

export function isFilmingKind(stageKind: StageKind): boolean {
  return stageKind === "filming" || stageKind === "ad_filming";
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(journey): stage templates + labels"

---

## Task 3: `createJourneyForClient`

**Files:**
- Create: `src/lib/journeys/create.ts`

- [ ] **Step 1: Write the helper**

```ts
// src/lib/journeys/create.ts
import type { Prisma } from "@prisma/client";
import {
  type JourneyKind, templateFor, taskTitleFor, taskDescriptionFor,
} from "@/lib/journeys/templates";

/**
 * Creates a Journey + all stages (idx 0 active, rest locked) + the active stage's Task
 * + its video items (if per_video).
 *
 * Must run inside a Prisma transaction (caller's responsibility).
 *
 * @returns the journey id
 */
export async function createJourneyForClient(
  tx: Prisma.TransactionClient,
  clientId: string,
  kind: JourneyKind,
  videoCount: number,
): Promise<string> {
  if (videoCount < 1 || !Number.isInteger(videoCount)) {
    throw new Error(`videoCount must be a positive integer, got ${videoCount}`);
  }
  const template = templateFor(kind);

  const journey = await tx.journey.create({
    data: {
      clientId,
      kind,
      videoCount,
      status: "active",
      currentStageIndex: 0,
    },
  });

  // Create all stages: idx 0 active, rest locked.
  for (const t of template) {
    await tx.journeyStage.create({
      data: {
        journeyId: journey.id,
        index: t.index,
        kind: t.kind,
        mode: t.mode,
        status: t.index === 0 ? "active" : "locked",
      },
    });
  }

  // Materialize the active stage's Task + (if per_video) its video items.
  const activeStage = await tx.journeyStage.findFirstOrThrow({
    where: { journeyId: journey.id, index: 0 },
  });
  await materializeActiveStage(tx, journey.id, activeStage.id, template[0], videoCount, kind, template.length);

  return journey.id;
}

/** Internal: spawn Task + (if per_video) video items, and link the Task back to the stage. */
export async function materializeActiveStage(
  tx: Prisma.TransactionClient,
  journeyId: string,
  stageId: string,
  template: { index: number; kind: import("@/lib/journeys/templates").StageKind; mode: import("@/lib/journeys/templates").StageMode },
  videoCount: number,
  journeyKind: JourneyKind,
  totalStages: number,
): Promise<void> {
  const journey = await tx.journey.findUniqueOrThrow({ where: { id: journeyId } });

  const task = await tx.task.create({
    data: {
      clientId: journey.clientId,
      space: "marketing",
      title: taskTitleFor(template.kind, journeyKind),
      description: taskDescriptionFor(template.index, totalStages, journeyKind),
      priority: "normal",
      status: "open",
      linkedStageId: stageId,
    },
  });
  await tx.journeyStage.update({
    where: { id: stageId },
    data: { taskId: task.id },
  });

  if (template.mode === "per_video") {
    await tx.journeyVideoItem.createMany({
      data: Array.from({ length: videoCount }, (_, i) => ({
        stageId,
        index: i + 1,
        done: false,
      })),
    });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(journey): createJourneyForClient + materializeActiveStage"

---

## Task 4: `advanceActiveStage`, `revertCompletedStage`, `toggleVideoItem`

**Files:**
- Create: `src/lib/journeys/advance.ts`

- [ ] **Step 1: Write the advance/revert logic**

```ts
// src/lib/journeys/advance.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  type JourneyKind, type StageKind, type StageMode, templateFor, isFilmingKind,
} from "@/lib/journeys/templates";
import { materializeActiveStage } from "@/lib/journeys/create";

type StageRow = {
  id: string;
  journeyId: string;
  index: number;
  kind: string;
  mode: string;
  status: string;
  filmingDate: Date | null;
  taskId: string | null;
};

/**
 * Marks a single-mode stage done, cascading to the next stage (if any) or completing the journey.
 * Throws on invalid preconditions (caller turns these into 4xx).
 */
export async function advanceActiveStage(stageId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.journeyStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.status !== "active") throw new Error("stage not active");
    if (stage.mode === "per_video") throw new Error("per_video stage cannot be marked done directly");
    if (isFilmingKind(stage.kind as StageKind)) {
      if (!stage.filmingDate) throw new Error("filmingDate required");
      if (stage.filmingDate > new Date()) throw new Error("filmingDate is in the future");
    }
    await advanceStageInTx(tx, stage);
  });
}

/** Internal: shared advancement logic, callable from within an existing tx. */
export async function advanceStageInTx(tx: Prisma.TransactionClient, stage: StageRow): Promise<void> {
  // Mark stage + linked task done
  await tx.journeyStage.update({
    where: { id: stage.id },
    data: { status: "done" },
  });
  if (stage.taskId) {
    await tx.task.update({
      where: { id: stage.taskId },
      data: { status: "done", completedAt: new Date() },
    });
  }

  const journey = await tx.journey.findUniqueOrThrow({ where: { id: stage.journeyId } });
  const template = templateFor(journey.kind as JourneyKind);

  const next = template.find((t) => t.index === stage.index + 1);
  if (!next) {
    await tx.journey.update({
      where: { id: journey.id },
      data: { status: "completed" },
    });
    return;
  }

  // Activate next stage
  const nextStage = await tx.journeyStage.findFirstOrThrow({
    where: { journeyId: journey.id, index: next.index },
  });
  await tx.journeyStage.update({
    where: { id: nextStage.id },
    data: { status: "active" },
  });
  await tx.journey.update({
    where: { id: journey.id },
    data: { currentStageIndex: next.index },
  });
  await materializeActiveStage(
    tx, journey.id, nextStage.id, next, journey.videoCount, journey.kind as JourneyKind, template.length,
  );
}

/**
 * Reverts a done stage back to active, deleting all later stages' video items + linked tasks
 * and re-locking those stages. If the journey was "completed", it returns to "active".
 */
export async function revertCompletedStage(stageId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.journeyStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.status === "active") return; // no-op
    if (stage.status !== "done") throw new Error("can only revert a done stage");
    await revertStageInTx(tx, stage);
  });
}

export async function revertStageInTx(tx: Prisma.TransactionClient, stage: StageRow): Promise<void> {
  const laterStages = await tx.journeyStage.findMany({
    where: { journeyId: stage.journeyId, index: { gt: stage.index } },
    orderBy: { index: "desc" },
  });

  // Walk later stages back to locked, deleting their video items + tasks.
  for (const later of laterStages) {
    if (later.status === "locked") continue;
    await tx.journeyVideoItem.deleteMany({ where: { stageId: later.id } });
    if (later.taskId) {
      await tx.task.delete({ where: { id: later.taskId } }); // cascade clears the linkedStageId reference
    }
    await tx.journeyStage.update({
      where: { id: later.id },
      data: { status: "locked", taskId: null, docLink: null, filmingDate: null },
    });
  }

  // Reactivate the reverted stage; restore Task to open.
  await tx.journeyStage.update({
    where: { id: stage.id },
    data: { status: "active" },
  });
  if (stage.taskId) {
    await tx.task.update({
      where: { id: stage.taskId },
      data: { status: "open", completedAt: null },
    });
  }
  await tx.journey.update({
    where: { id: stage.journeyId },
    data: { status: "active", currentStageIndex: stage.index },
  });
}

/**
 * Toggles a per-video item. If the toggle completes all items in the stage, advances the journey.
 * If the toggle un-completes an item on an already-done stage, reverts the stage (cascade).
 */
export async function toggleVideoItem(stageId: string, videoIndex: number, done: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.journeyStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.mode !== "per_video") throw new Error("stage is not per_video");

    await tx.journeyVideoItem.update({
      where: { stageId_index: { stageId, index: videoIndex } },
      data: { done, doneAt: done ? new Date() : null },
    });

    const items = await tx.journeyVideoItem.findMany({ where: { stageId } });
    const allDone = items.length > 0 && items.every((i) => i.done);

    if (allDone && stage.status === "active") {
      await advanceStageInTx(tx, stage);
    } else if (!allDone && stage.status === "done") {
      await revertStageInTx(tx, stage);
    }
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(journey): advance/revert/toggle helpers"

---

## Task 5: Sync helper for Task PATCH

**Files:**
- Create: `src/lib/journeys/sync.ts`

- [ ] **Step 1: Write the sync helper**

```ts
// src/lib/journeys/sync.ts
import { prisma } from "@/lib/db";
import { advanceActiveStage, revertCompletedStage } from "@/lib/journeys/advance";

/**
 * Called by the Task PATCH route when a Task that has linkedStageId changes status.
 * - open → done: advance the linked stage (which marks the Task done as a side-effect; idempotent).
 * - done → open: revert the linked stage.
 *
 * Returns true if the caller should SKIP its own Task update (the journey helper already wrote it).
 */
export async function syncFromTaskStatusChange(
  taskId: string,
  newStatus: "open" | "done",
): Promise<{ handled: boolean }> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !task.linkedStageId) return { handled: false };
  if (task.status === newStatus) return { handled: true };

  if (newStatus === "done") {
    await advanceActiveStage(task.linkedStageId);
  } else {
    await revertCompletedStage(task.linkedStageId);
  }
  return { handled: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(journey): task↔stage sync helper"

---

## Task 6: Extend `POST /api/clients` and `PATCH /api/clients/[id]`

**Files:**
- Modify: `src/app/api/clients/route.ts`
- Modify: `src/app/api/clients/[id]/route.ts`

- [ ] **Step 1: Replace `src/app/api/clients/route.ts` entirely**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createJourneyForClient } from "@/lib/journeys/create";

export const runtime = "nodejs";

const JourneyInput = z.object({
  kind: z.enum(["organic", "paid"]),
  videoCount: z.number().int().min(1),
});

const Body = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
  journeys: z.array(JourneyInput).optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  // Reject duplicate kinds in the same request
  const kinds = (parsed.data.journeys ?? []).map((j) => j.kind);
  if (new Set(kinds).size !== kinds.length) {
    return NextResponse.json({ error: "duplicate journey kinds" }, { status: 400 });
  }

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        salesMeetingsTarget: parsed.data.salesMeetingsTarget ?? null,
      },
    });
    for (const j of parsed.data.journeys ?? []) {
      await createJourneyForClient(tx, created.id, j.kind, j.videoCount);
    }
    return created;
  });

  return NextResponse.json(client);
}
```

- [ ] **Step 2: Replace `src/app/api/clients/[id]/route.ts` entirely**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const client = await prisma.client.update({ where: { id }, data: parsed.data });
  return NextResponse.json(client);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(api): client POST accepts journeys + salesMeetingsTarget"

---

## Task 7: Journeys API — add journey, delete journey, update stage, toggle video

**Files:**
- Create: `src/app/api/clients/[id]/journeys/route.ts`
- Create: `src/app/api/journeys/[id]/route.ts`
- Create: `src/app/api/journeys/[id]/stages/[stageId]/route.ts`
- Create: `src/app/api/journeys/[id]/stages/[stageId]/videos/[videoIndex]/route.ts`

- [ ] **Step 1: POST add journey**

`src/app/api/clients/[id]/journeys/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createJourneyForClient } from "@/lib/journeys/create";

export const runtime = "nodejs";

const Body = z.object({
  kind: z.enum(["organic", "paid"]),
  videoCount: z.number().int().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const existing = await prisma.journey.findUnique({
    where: { clientId_kind: { clientId, kind: parsed.data.kind } },
  });
  if (existing) {
    return NextResponse.json({ error: `client already has a ${parsed.data.kind} journey` }, { status: 409 });
  }

  const journeyId = await prisma.$transaction((tx) =>
    createJourneyForClient(tx, clientId, parsed.data.kind, parsed.data.videoCount),
  );
  return NextResponse.json({ id: journeyId });
}
```

- [ ] **Step 2: DELETE journey**

`src/app/api/journeys/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Cascade deletes stages + video items via the FK onDelete cascade,
  // but the linked Tasks aren't reached by cascade (Task.linkedStageId is SetNull).
  // Delete them explicitly first.
  const stages = await prisma.journeyStage.findMany({
    where: { journeyId: id },
    select: { taskId: true },
  });
  const taskIds = stages.map((s) => s.taskId).filter((x): x is string => !!x);
  if (taskIds.length > 0) {
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  }
  await prisma.journey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: PATCH stage**

`src/app/api/journeys/[id]/stages/[stageId]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { advanceActiveStage } from "@/lib/journeys/advance";

export const runtime = "nodejs";

const Body = z.object({
  docLink: z.string().url().nullable().optional(),
  filmingDate: z.string().datetime().nullable().optional(),
  markDone: z.literal(true).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const stage = await prisma.journeyStage.findUnique({ where: { id: stageId } });
  if (!stage) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Field updates first (docLink, filmingDate) regardless of markDone
  const data: { docLink?: string | null; filmingDate?: Date | null } = {};
  if (parsed.data.docLink !== undefined) data.docLink = parsed.data.docLink;
  if (parsed.data.filmingDate !== undefined) {
    data.filmingDate = parsed.data.filmingDate ? new Date(parsed.data.filmingDate) : null;
  }
  if (Object.keys(data).length > 0) {
    await prisma.journeyStage.update({ where: { id: stageId }, data });
  }

  if (parsed.data.markDone) {
    try {
      await advanceActiveStage(stageId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "advance failed";
      const code =
        msg === "stage not active" ? 409 :
        msg === "per_video stage cannot be marked done directly" ? 400 :
        msg === "filmingDate required" ? 409 :
        msg === "filmingDate is in the future" ? 409 :
        500;
      return NextResponse.json({ error: msg }, { status: code });
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: PATCH video item**

`src/app/api/journeys/[id]/stages/[stageId]/videos/[videoIndex]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleVideoItem } from "@/lib/journeys/advance";

export const runtime = "nodejs";

const Body = z.object({ done: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ stageId: string; videoIndex: string }> },
) {
  const { stageId, videoIndex } = await params;
  const idx = Number(videoIndex);
  if (!Number.isInteger(idx) || idx < 1) {
    return NextResponse.json({ error: "invalid videoIndex" }, { status: 400 });
  }
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  try {
    await toggleVideoItem(stageId, idx, parsed.data.done);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "toggle failed";
    const code = msg === "stage is not per_video" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Checkpoint** — "feat(api): journeys + stages + video item endpoints"

---

## Task 8: Modify `PATCH /api/tasks/[id]` to route through journey sync; reject DELETE if linked

**Files:**
- Modify: `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Replace file entirely**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/sales/tasks";
import { syncFromTaskStatusChange } from "@/lib/journeys/sync";

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

  // If linked and status is changing, route through journey sync (which writes the Task too).
  if (existing.linkedStageId && parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    try {
      await syncFromTaskStatusChange(id, parsed.data.status);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync failed";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    // Then apply any non-status fields the user also changed
    const nonStatus: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) nonStatus.title = parsed.data.title;
    if (parsed.data.description !== undefined) nonStatus.description = parsed.data.description;
    if (parsed.data.priority !== undefined) nonStatus.priority = parsed.data.priority;
    if (parsed.data.dueDate !== undefined) nonStatus.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    if (Object.keys(nonStatus).length > 0) {
      await prisma.task.update({ where: { id }, data: nonStatus });
    }
    return NextResponse.json({ ok: true });
  }

  // Non-linked or non-status PATCH path (original behavior).
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
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ ok: true });
  if (t.linkedStageId) {
    return NextResponse.json({ error: "linked to journey stage" }, { status: 409 });
  }
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(api): tasks PATCH routes linked rows through journey sync; DELETE rejects linked"

---

## Task 9: 2-step client creation modal

**Files:**
- Modify: `src/app/clients/new-client-form.tsx`

- [ ] **Step 1: Replace file entirely**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = 1 | 2;

export default function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const [organicOn, setOrganicOn] = useState(false);
  const [paidOn, setPaidOn] = useState(false);
  const [organicCount, setOrganicCount] = useState("");
  const [paidCount, setPaidCount] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setStep(1);
    setName(""); setDescription(""); setTargetStr("");
    setOrganicOn(false); setPaidOn(false); setOrganicCount(""); setPaidCount("");
  }

  async function submit() {
    const journeys: Array<{ kind: "organic" | "paid"; videoCount: number }> = [];
    if (organicOn) {
      const n = Number(organicCount);
      if (!Number.isInteger(n) || n < 1) { alert("כמות סרטונים לאורגני חייבת להיות מספר ≥ 1"); return; }
      journeys.push({ kind: "organic", videoCount: n });
    }
    if (paidOn) {
      const n = Number(paidCount);
      if (!Number.isInteger(n) || n < 1) { alert("כמות מודעות לממומן חייבת להיות מספר ≥ 1"); return; }
      journeys.push({ kind: "paid", videoCount: n });
    }
    const target = targetStr.trim() === "" ? null : Number(targetStr);
    if (target !== null && (!Number.isInteger(target) || target < 0)) { alert("יעד פגישות חייב להיות מספר ≥ 0"); return; }

    setBusy(true);
    const r = await fetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        salesMeetingsTarget: target,
        journeys: journeys.length ? journeys : undefined,
      }),
    });
    setBusy(false);
    if (r.ok) {
      close();
      router.refresh();
    } else {
      alert(`Failed: ${await r.text()}`);
    }
  }

  function next() {
    if (!name.trim()) { alert("חובה להזין שם"); return; }
    setStep(2);
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>+ לקוח חדש</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={close}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">לקוח חדש — שלב {step} מתוך 2</h2>
              <button onClick={close} className="text-sm text-muted">סגור</button>
            </div>

            {step === 1 && (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">שם לקוח</span>
                  <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="שם העסק" autoFocus />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">תיאור / הצעה (אופציונלי)</span>
                  <textarea className="input h-20 w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">יעד פגישות מכירה (אופציונלי)</span>
                  <input
                    className="input w-full"
                    type="number"
                    min={0}
                    value={targetStr}
                    onChange={(e) => setTargetStr(e.target.value)}
                    placeholder="לדוגמה: 12"
                  />
                </label>
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={close} className="btn-ghost">ביטול</button>
                  <button onClick={next} className="btn-primary">הבא →</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-muted">בחר אילו מסלולי שיווק להפעיל עבור הלקוח. אפשר גם להשאיר ריק ולהוסיף בהמשך.</p>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={organicOn} onChange={(e) => setOrganicOn(e.target.checked)} />
                  <span className="text-sm font-medium">מסלול אורגני</span>
                </label>
                {organicOn && (
                  <input
                    className="input w-full"
                    type="number"
                    min={1}
                    placeholder="כמות סרטונים מתוכננת"
                    value={organicCount}
                    onChange={(e) => setOrganicCount(e.target.value)}
                  />
                )}

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={paidOn} onChange={(e) => setPaidOn(e.target.checked)} />
                  <span className="text-sm font-medium">מסלול ממומן</span>
                </label>
                {paidOn && (
                  <input
                    className="input w-full"
                    type="number"
                    min={1}
                    placeholder="כמות מודעות מתוכננת"
                    value={paidCount}
                    onChange={(e) => setPaidCount(e.target.value)}
                  />
                )}

                <div className="mt-2 flex justify-between gap-2">
                  <button onClick={() => setStep(1)} className="btn-ghost">← חזרה</button>
                  <button onClick={submit} disabled={busy} className="btn-primary">{busy ? "יוצר…" : "סיום"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — "feat(clients): 2-step creation modal with journeys + meetings target"

---

## Task 10: Add "מסלולים" tab + journeys page

**Files:**
- Modify: `src/app/clients/[id]/marketing/marketing-tabs.tsx`
- Create: `src/app/clients/[id]/marketing/journeys/page.tsx`
- Create: `src/app/clients/[id]/marketing/journeys/journeys-client.tsx`

- [ ] **Step 1: Insert "מסלולים" between "קמפיינים" and "משימות"**

In `src/app/clients/[id]/marketing/marketing-tabs.tsx`, change the `TABS` array to:
```tsx
const TABS = [
  { href: "/dashboard", label: "דשבורד" },
  { href: "/landing", label: "דף נחיתה" },
  { href: "/materials", label: "חומרים" },
  { href: "/analyze", label: "ניתוח AI" },
  { href: "/campaigns", label: "קמפיינים" },
  { href: "/journeys", label: "מסלולים" },
  { href: "/tasks", label: "משימות" },
];
```

- [ ] **Step 2: Server page**

`src/app/clients/[id]/marketing/journeys/page.tsx`:
```tsx
import { prisma } from "@/lib/db";
import JourneysClient, { type JourneyView } from "./journeys-client";

export const dynamic = "force-dynamic";

export default async function JourneysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journeys = await prisma.journey.findMany({
    where: { clientId: id },
    orderBy: { kind: "asc" },
    include: {
      stages: {
        orderBy: { index: "asc" },
        include: {
          videoItems: { orderBy: { index: "asc" } },
        },
      },
    },
  });
  const view: JourneyView[] = journeys.map((j) => ({
    id: j.id,
    kind: j.kind as "organic" | "paid",
    videoCount: j.videoCount,
    status: j.status as "active" | "completed",
    currentStageIndex: j.currentStageIndex,
    stages: j.stages.map((s) => ({
      id: s.id,
      index: s.index,
      kind: s.kind as JourneyView["stages"][number]["kind"],
      mode: s.mode as "single" | "per_video",
      status: s.status as "locked" | "active" | "done",
      docLink: s.docLink,
      filmingDate: s.filmingDate?.toISOString() ?? null,
      videoItems: s.videoItems.map((v) => ({ index: v.index, done: v.done })),
    })),
  }));
  return <JourneysClient clientId={id} journeys={view} />;
}
```

- [ ] **Step 3: Client component**

`src/app/clients/[id]/marketing/journeys/journeys-client.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  KIND_BADGE_COLOR, KIND_LABEL, STAGE_LABEL,
  type JourneyKind, type StageKind, type StageMode,
} from "@/lib/journeys/templates";

export type JourneyView = {
  id: string;
  kind: JourneyKind;
  videoCount: number;
  status: "active" | "completed";
  currentStageIndex: number;
  stages: Array<{
    id: string;
    index: number;
    kind: StageKind;
    mode: StageMode;
    status: "locked" | "active" | "done";
    docLink: string | null;
    filmingDate: string | null;
    videoItems: Array<{ index: number; done: boolean }>;
  }>;
};

export default function JourneysClient({ clientId, journeys }: { clientId: string; journeys: JourneyView[] }) {
  const router = useRouter();
  const [addKind, setAddKind] = useState<JourneyKind | null>(null);

  const hasOrganic = journeys.some((j) => j.kind === "organic");
  const hasPaid = journeys.some((j) => j.kind === "paid");

  return (
    <div className="space-y-6">
      {journeys.length === 0 && (
        <div className="card text-center">
          <p className="mb-4 text-sm text-muted">עדיין לא הוגדר מסלול שיווק ללקוח.</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => setAddKind("organic")} className="btn-primary">+ הוסף מסלול אורגני</button>
            <button onClick={() => setAddKind("paid")} className="btn-primary">+ הוסף מסלול ממומן</button>
          </div>
        </div>
      )}

      {journeys.map((j) => (
        <JourneyCard key={j.id} clientId={clientId} journey={j} onChanged={() => router.refresh()} />
      ))}

      {journeys.length > 0 && (!hasOrganic || !hasPaid) && (
        <div className="flex justify-center gap-2">
          {!hasOrganic && <button onClick={() => setAddKind("organic")} className="btn-ghost">+ הוסף מסלול אורגני</button>}
          {!hasPaid && <button onClick={() => setAddKind("paid")} className="btn-ghost">+ הוסף מסלול ממומן</button>}
        </div>
      )}

      {addKind && (
        <AddJourneyDialog
          clientId={clientId}
          kind={addKind}
          onClose={() => setAddKind(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function AddJourneyDialog({
  clientId, kind, onClose, onCreated,
}: { clientId: string; kind: JourneyKind; onClose: () => void; onCreated: () => void }) {
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) { alert("חייב להיות מספר ≥ 1"); return; }
    setBusy(true);
    const r = await fetch(`/api/clients/${clientId}/journeys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, videoCount: n }),
    });
    setBusy(false);
    if (!r.ok) { alert(await r.text()); return; }
    onClose();
    onCreated();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">הוסף מסלול {KIND_LABEL[kind]}</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">{kind === "organic" ? "כמות סרטונים מתוכננת" : "כמות מודעות מתוכננת"}</span>
          <input
            className="input w-full"
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            autoFocus
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">ביטול</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? "יוצר…" : "צור מסלול"}</button>
        </div>
      </div>
    </div>
  );
}

function JourneyCard({
  clientId: _clientId, journey, onChanged,
}: { clientId: string; journey: JourneyView; onChanged: () => void }) {
  const activeStage = journey.stages.find((s) => s.status === "active") ?? null;
  const total = journey.stages.length;
  const doneCount = journey.stages.filter((s) => s.status === "done").length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const kindLabel = KIND_LABEL[journey.kind];

  async function del() {
    if (!confirm(`למחוק את המסלול ${kindLabel}?`)) return;
    await fetch(`/api/journeys/${journey.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">מסלול {kindLabel} · {journey.videoCount} {journey.kind === "organic" ? "סרטונים" : "מודעות"}</h3>
        <button onClick={del} className="text-sm text-muted hover:text-bad">מחק</button>
      </div>

      {journey.status === "completed" && (
        <div className="rounded-md bg-good/15 px-3 py-2 text-sm text-good">סיימת את כל המשימות ללקוח</div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2">
          {journey.stages.map((s) => (
            <div key={s.id} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                  s.status === "done" ? "border-good bg-good/15 text-good" :
                  s.status === "active" ? "border-accent text-accent" :
                  "border-border text-muted"
                }`}
              >
                {s.status === "done" ? "✓" : s.index + 1}
              </div>
              <div className={`text-xs ${s.status === "locked" ? "text-muted" : ""}`}>{STAGE_LABEL[s.kind]}</div>
              {s.index < journey.stages.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {activeStage && (
        <ActiveStagePanel
          journeyId={journey.id}
          journeyKind={journey.kind}
          stage={activeStage}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function ActiveStagePanel({
  journeyId, journeyKind, stage, onChanged,
}: {
  journeyId: string;
  journeyKind: JourneyKind;
  stage: JourneyView["stages"][number];
  onChanged: () => void;
}) {
  const [docLink, setDocLink] = useState(stage.docLink ?? "");
  const [filmingDate, setFilmingDate] = useState(stage.filmingDate ? stage.filmingDate.slice(0, 10) : "");

  const isFilming = stage.kind === "filming" || stage.kind === "ad_filming";
  const filmingPassed = stage.filmingDate ? new Date(stage.filmingDate) <= new Date() : false;

  async function patchStage(body: Record<string, unknown>) {
    const r = await fetch(`/api/journeys/${journeyId}/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "שגיאה"); return false; }
    onChanged();
    return true;
  }

  async function saveDocLink() {
    if ((stage.docLink ?? "") === docLink) return;
    await patchStage({ docLink: docLink.trim() === "" ? null : docLink.trim() });
  }
  async function saveFilmingDate() {
    const iso = filmingDate ? new Date(`${filmingDate}T00:00:00`).toISOString() : null;
    await patchStage({ filmingDate: iso });
  }
  async function markDone() {
    await patchStage({ markDone: true });
  }
  async function toggleVideo(index: number, done: boolean) {
    const r = await fetch(`/api/journeys/${journeyId}/stages/${stage.id}/videos/${index}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "שגיאה"); return; }
    onChanged();
  }

  const linkPlaceholder =
    stage.kind === "writing" ? "לינק לדוק עם התסריטים" :
    stage.kind === "editing" ? "לינק לתיקייה עם הסרטונים הערוכים" :
    stage.kind === "strategy" ? "לינק לדוק האסטרטגיה" :
    stage.kind === "ads_writing" ? "לינק לדוק עם המודעות" :
    stage.kind === "creative" ? "לינק לתיקיית הקריאייטיב" :
    "לינק";

  return (
    <div
      className="rounded-md border-2 p-4"
      style={{ borderColor: KIND_BADGE_COLOR[journeyKind] }}
    >
      <div className="mb-3 text-sm font-medium">{STAGE_LABEL[stage.kind]}</div>

      {!isFilming && (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">לינק</span>
          <input
            className="input w-full"
            dir="ltr"
            value={docLink}
            onChange={(e) => setDocLink(e.target.value)}
            onBlur={saveDocLink}
            placeholder={linkPlaceholder}
          />
        </label>
      )}

      {isFilming && (
        <div className="mb-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">תאריך צילום</span>
            <input
              className="input w-full"
              type="date"
              value={filmingDate}
              onChange={(e) => setFilmingDate(e.target.value)}
              onBlur={saveFilmingDate}
            />
          </label>
        </div>
      )}

      {stage.mode === "per_video" && (
        <div className="mb-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted">סרטונים</span>
            <span className="text-xs text-muted">
              {stage.videoItems.filter((v) => v.done).length} / {stage.videoItems.length} הושלמו
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {stage.videoItems.map((v) => (
              <label key={v.index} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={v.done}
                  onChange={(e) => toggleVideo(v.index, e.target.checked)}
                />
                סרטון {v.index}
              </label>
            ))}
          </div>
        </div>
      )}

      {stage.mode === "single" && (
        <div className="flex justify-end">
          <button
            onClick={markDone}
            disabled={isFilming && !filmingPassed}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            title={isFilming && !filmingPassed ? "תאריך הצילום עדיין לא הגיע" : ""}
          >
            סמן בוצע
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — "feat(marketing): journeys tab with stepper + active stage panel"

---

## Task 11: Sales counter shows N/Y with target editor

**Files:**
- Modify: `src/app/clients/[id]/sales/layout.tsx`
- Create: `src/app/clients/[id]/sales/meetings-counter.tsx`

- [ ] **Step 1: Counter client component**

`src/app/clients/[id]/sales/meetings-counter.tsx`:
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

- [ ] **Step 2: Use it from the sales layout**

Replace `src/app/clients/[id]/sales/layout.tsx` entirely with:
```tsx
import Link from "next/link";
import { countHeldMeetings } from "@/lib/sales/meetings";
import { prisma } from "@/lib/db";
import SalesTabs from "./sales-tabs";
import MeetingsCounter from "./meetings-counter";

export default async function SalesLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [held, client] = await Promise.all([
    countHeldMeetings(id),
    prisma.client.findUnique({ where: { id }, select: { salesMeetingsTarget: true } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link href={`/clients/${id}`} className="text-xs text-muted hover:text-accent">← חזרה לפורטפוליו</Link>
          <h1 className="mt-1 text-2xl font-semibold">אימון מכירות</h1>
        </div>
        <MeetingsCounter clientId={id} held={held} target={client?.salesMeetingsTarget ?? null} />
      </div>
      <SalesTabs clientId={id} />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Checkpoint** — "feat(sales): meetings counter shows held/target with inline edit"

---

## Task 12: Tasks page — render journey badges + disable delete for linked rows

**Files:**
- Modify: `src/app/clients/[id]/marketing/tasks/page.tsx`
- Modify: `src/app/clients/[id]/sales/tasks/page.tsx`
- Modify: `src/app/clients/[id]/tasks-shared.tsx`

- [ ] **Step 1: Marketing tasks page — eager-load linked stage's journey for badge**

Replace `src/app/clients/[id]/marketing/tasks/page.tsx` entirely with:
```tsx
import { prisma } from "@/lib/db";
import TasksShared, { type TaskRow } from "../../tasks-shared";

export const dynamic = "force-dynamic";

export default async function MarketingTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await prisma.task.findMany({
    where: { clientId: id, space: "marketing" },
    orderBy: [{ createdAt: "desc" }],
    include: {
      linkedStage: {
        include: { journey: true },
      },
    },
  });
  // Re-sort like listTasksForClient (open first, priority, dueDate, then desc by createdAt).
  const rank: Record<string, number> = { high: 0, normal: 1, low: 2 };
  tasks.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const pa = rank[a.priority] ?? 1; const pb = rank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ? a.dueDate.getTime() : Infinity;
    const db = b.dueDate ? b.dueDate.getTime() : Infinity;
    if (da !== db) return da - db;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskRow["priority"],
    dueDate: t.dueDate?.toISOString() ?? null,
    status: t.status as TaskRow["status"],
    completedAt: t.completedAt?.toISOString() ?? null,
    linkedKind: t.linkedStage?.journey.kind === "organic"
      ? "organic" : t.linkedStage?.journey.kind === "paid"
      ? "paid" : null,
  }));
  return <TasksShared clientId={id} space="marketing" tasks={rows} />;
}
```

- [ ] **Step 2: Sales tasks page — fill in `linkedKind: null` (sales tasks never link)**

Replace `src/app/clients/[id]/sales/tasks/page.tsx` entirely with:
```tsx
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
    linkedKind: null,
  }));
  return <TasksShared clientId={id} space="sales" tasks={rows} />;
}
```

- [ ] **Step 3: Update `TaskRow` type + render badge + disable delete in `tasks-shared.tsx`**

In `src/app/clients/[id]/tasks-shared.tsx`:

a. Update the `TaskRow` export to include `linkedKind`:
```ts
export type TaskRow = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  status: Status;
  completedAt: string | null;
  linkedKind: "organic" | "paid" | null;
};
```

b. Add these constants near the existing `PRIORITY_LABEL`:
```ts
const LINKED_LABEL: Record<"organic" | "paid", string> = { organic: "אורגני", paid: "ממומן" };
const LINKED_COLOR: Record<"organic" | "paid", string> = { organic: "#ec4899", paid: "#a855f7" };
```

c. In the list `<li>` row, immediately after the title `<button>` and BEFORE the priority chip, add:
```tsx
            {t.linkedKind && (
              <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: LINKED_COLOR[t.linkedKind] }}>
                {LINKED_LABEL[t.linkedKind]}
              </span>
            )}
```

d. In `TaskDrawer`, update the delete button: replace the existing `del` button JSX with a version that disables itself for linked tasks. The relevant button currently looks like `<button onClick={del} className="text-sm text-bad">מחק</button>`. Change to:
```tsx
          <button
            onClick={del}
            disabled={task.linkedKind !== null}
            title={task.linkedKind ? "מקושר למסלול — מחק דרך טאב המסלולים" : ""}
            className="text-sm text-bad disabled:opacity-40"
          >
            מחק
          </button>
```

   The drawer receives the full `TaskRow`, so `task.linkedKind` is already available.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — "feat(tasks): journey-origin badges + linked-task delete guard"

---

## Task 13: End-to-end smoke test

- [ ] **Step 1: Boot dev**

`rm -rf .next && pnpm dev`. Wait for "Ready in".

- [ ] **Step 2: Create client with both journeys via API**

```bash
curl -sX POST http://localhost:3000/api/clients -H 'content-type: application/json' \
  -d '{"name":"smoke-journey","salesMeetingsTarget":10,"journeys":[{"kind":"organic","videoCount":3},{"kind":"paid","videoCount":2}]}'
```
Expected: client JSON with `salesMeetingsTarget: 10`.

```bash
sqlite3 prisma/dev.db "select kind, status, currentStageIndex, videoCount from Journey where clientId in (select id from Client where name='smoke-journey');"
```
Expected: two rows: `organic|active|0|3` and `paid|active|0|2`.

```bash
sqlite3 prisma/dev.db "select s.kind, s.status, t.title from JourneyStage s left join Task t on t.id=s.taskId where s.journeyId in (select id from Journey where clientId in (select id from Client where name='smoke-journey'));"
```
Expected: 7 rows total (3 organic + 4 paid). Two of them — `writing|active|...` and `strategy|active|...` — have non-NULL Task titles ("כתיבת תסריטים — אורגני", "אסטרטגיית מודעות — ממומן"). All others have NULL task.

- [ ] **Step 3: Advance the organic writing stage via tasks PATCH**

```bash
# find the writing task
TASK_ID=$(sqlite3 prisma/dev.db "select t.id from Task t join JourneyStage s on s.taskId=t.id join Journey j on j.id=s.journeyId join Client c on c.id=j.clientId where c.name='smoke-journey' and j.kind='organic' and s.kind='writing';")
curl -sX PATCH "http://localhost:3000/api/tasks/$TASK_ID" -H 'content-type: application/json' -d '{"status":"done"}'
```
Expected: `{"ok":true}`. Then:
```bash
sqlite3 prisma/dev.db "select s.kind, s.status from JourneyStage s where s.journeyId in (select id from Journey where kind='organic' and clientId in (select id from Client where name='smoke-journey')) order by s.index;"
```
Expected: `writing|done`, `filming|active`, `editing|locked`.

- [ ] **Step 4: Advance the filming stage via API (set date in past + markDone)**

```bash
ORG_J=$(sqlite3 prisma/dev.db "select id from Journey where kind='organic' and clientId in (select id from Client where name='smoke-journey');")
FILM_STAGE=$(sqlite3 prisma/dev.db "select id from JourneyStage where journeyId='$ORG_J' and kind='filming';")
PAST=$(date -u -v -1d +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u --date='1 day ago' +%Y-%m-%dT%H:%M:%S.000Z)
curl -sX PATCH "http://localhost:3000/api/journeys/$ORG_J/stages/$FILM_STAGE" -H 'content-type: application/json' -d "{\"filmingDate\":\"$PAST\"}"
curl -sX PATCH "http://localhost:3000/api/journeys/$ORG_J/stages/$FILM_STAGE" -H 'content-type: application/json' -d '{"markDone":true}'
```
Expected: both `{"ok":true}`. Then:
```bash
sqlite3 prisma/dev.db "select s.kind, s.status from JourneyStage s where s.journeyId='$ORG_J' order by s.index;"
```
Expected: `writing|done`, `filming|done`, `editing|active`. The editing stage now has 3 `JourneyVideoItem` rows:
```bash
sqlite3 prisma/dev.db "select index, done from JourneyVideoItem where stageId in (select id from JourneyStage where journeyId='$ORG_J' and kind='editing') order by index;"
```
Expected: `1|0`, `2|0`, `3|0`.

- [ ] **Step 5: Toggle video items and complete the journey**

```bash
EDIT_STAGE=$(sqlite3 prisma/dev.db "select id from JourneyStage where journeyId='$ORG_J' and kind='editing';")
for I in 1 2 3; do
  curl -sX PATCH "http://localhost:3000/api/journeys/$ORG_J/stages/$EDIT_STAGE/videos/$I" -H 'content-type: application/json' -d '{"done":true}'
  echo
done
sqlite3 prisma/dev.db "select status from Journey where id='$ORG_J';"
```
Expected: three `{"ok":true}` followed by `completed`.

- [ ] **Step 6: Cannot delete a linked Task**

```bash
T2=$(sqlite3 prisma/dev.db "select t.id from Task t where t.linkedStageId is not null limit 1;")
curl -siX DELETE "http://localhost:3000/api/tasks/$T2" | head -1
```
Expected: `HTTP/1.1 409 Conflict`. (If $T2 ends up empty because all linked stages are done and their tasks ARE deletable — pick a still-active linked task: paid strategy. Use `select t.id from Task t join JourneyStage s on s.taskId=t.id where s.status='active' limit 1;` instead.)

- [ ] **Step 7: Page renders**

In a browser open `http://localhost:3000/clients/<smoke-journey-id>/marketing/journeys`. Verify:
- Two cards, organic + paid.
- Organic shows green-completed banner.
- Paid shows the active "אסטרטגיית מודעות" panel with a doc-link input + סמן בוצע button.
- The marketing tasks tab shows the paid strategy task with a purple "ממומן" badge.

- [ ] **Step 8: Stop dev**

Kill the dev process.

- [ ] **Step 9: Checkpoint** — "test: e2e marketing-journeys smoke verified"

---

## Notes for the Implementer

- **No git repo:** skip every `git`/`commit` step. Use plain `mv` if you ever need to rename a folder.
- **No tests:** `pnpm typecheck` is the only automated gate. Smoke tests use `curl` + `sqlite3` against `prisma/dev.db`.
- **Transactions:** `createJourneyForClient` / `advanceStage` / `revertStage` / `toggleVideoItem` must run inside a single Prisma `$transaction`. The exposed helpers in `advance.ts` already open their own transaction; do NOT call `*InTx` variants from outside a `tx`.
- **Cascade subtlety:** Deleting a `JourneyStage` does NOT delete its linked `Task` (the FK is `SetNull` on `Task.linkedStageId`). The DELETE journey route deletes those Tasks explicitly. The revert helper also deletes the per-stage Tasks. Don't add a `Cascade` on `linkedStageId` — that would let a misclick on Task delete erase the stage relation in confusing ways.
- **Per-video items only exist for active/done stages:** they are created on stage activation, deleted on stage revert.
- **Filming pre-condition** is checked in `advance.ts` and also disabled in the UI button. The UI uses the panel's local `filmingDate` state which is refreshed via `router.refresh()` after save.

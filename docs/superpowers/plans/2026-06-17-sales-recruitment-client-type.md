# Sales-Recruitment Client Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new client type "השמת אנשי מכירות" (sales-staff recruitment) with global sequential stages, per-salesperson pricing, a closed-count + auto-payment, and a manual "client Excel" link.

**Architecture:** New `clientType` discriminator on `Client` selects which workspace tabs show. Recruitment clients get a dedicated `/clients/[id]/recruitment` workspace backed by two new models (`RecruitmentProfile`, `RecruitmentStage`) plus an `excelUrl` field on `Client` and a `source` tag on `Payment`. Stage progression mirrors the journeys pattern (`locked`/`active`/`done`, advance/revert in a `$transaction`) but in a focused, video-free module. Pricing flows through the existing `Payment` model so it appears in finance cards and metrics automatically.

**Tech Stack:** Next.js 15 App Router, Prisma + PostgreSQL, Zod, React (server + client components), Hebrew RTL. No test suite — verification is `pnpm typecheck` + manual flow.

---

## File Structure

**Create:**
- `src/lib/recruitment/stages.ts` — stage template (4 stages) + Hebrew labels. Pure, no DB.
- `src/lib/recruitment/progress.ts` — `advanceStageInTx` / `revertStageInTx` / `seedStages`.
- `src/app/api/clients/[id]/recruitment/route.ts` — `PATCH` profile (price/currency/excelUrl).
- `src/app/api/clients/[id]/recruitment/stages/route.ts` — `PATCH` advance/revert/note.
- `src/app/api/clients/[id]/recruitment/placements/route.ts` — `POST`/`DELETE` placement payment.
- `src/app/clients/[id]/recruitment/page.tsx` — server page.
- `src/app/clients/[id]/recruitment/recruitment-client.tsx` — interactive UI.

**Modify:**
- `prisma/schema.prisma` — `Client.clientType`, `Client.excelUrl`, `Client.recruitment` relation, `Payment.source`, new `RecruitmentProfile` + `RecruitmentStage` models.
- `src/app/api/clients/route.ts` — accept `clientType`/`pricePerSalesperson`/`currency`, seed recruitment.
- `src/app/clients/new-client-form.tsx` — add type-selector step + recruitment fields.
- `src/app/clients/[id]/layout.tsx` — select `clientType`, pass to `ClientTabs`.
- `src/app/clients/[id]/client-tabs.tsx` — conditional tabs by `clientType`.

---

## Task 1: Schema — add models and fields

**Files:**
- Modify: `prisma/schema.prisma` (Client model lines 11-39, Payment model lines 65-76)

- [ ] **Step 1: Add fields to `Client` model**

In `prisma/schema.prisma`, inside `model Client`, add after line 18 (`liorExpenseSharePct`):

```prisma
  clientType          String   @default("standard")  // "standard" | "recruitment"
  excelUrl            String?
```

And add to the relations block (after `targets Target[]`):

```prisma
  recruitment         RecruitmentProfile?
```

- [ ] **Step 2: Add `source` to `Payment` model**

Inside `model Payment`, add after the `note` line:

```prisma
  source     String?  // "recruitment" for auto-created placement payments
```

- [ ] **Step 3: Add the two new models**

Append to `prisma/schema.prisma`:

```prisma
model RecruitmentProfile {
  clientId            String   @id
  pricePerSalesperson Float?
  currency            String   @default("ILS")
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  client Client             @relation(fields: [clientId], references: [id], onDelete: Cascade)
  stages RecruitmentStage[]
}

model RecruitmentStage {
  id          String    @id @default(cuid())
  clientId    String
  index       Int       // 0..3
  kind        String    // "characterize" | "bring" | "interviews" | "closing"
  status      String    @default("locked")  // "locked" | "active" | "done"
  completedAt DateTime?
  note        String    @default("")

  profile RecruitmentProfile @relation(fields: [clientId], references: [clientId], onDelete: Cascade)

  @@unique([clientId, index])
  @@index([clientId])
}
```

- [ ] **Step 4: Push schema and regenerate client**

Run: `pnpm db:push && pnpm db:generate`
Expected: "Your database is now in sync with your Prisma schema." and client generated, no errors.

- [ ] **Step 5: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no references to new models yet, so no errors).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(recruitment): schema for recruitment client type"
```

---

## Task 2: Stage template module

**Files:**
- Create: `src/lib/recruitment/stages.ts`

- [ ] **Step 1: Write the module**

Create `src/lib/recruitment/stages.ts`:

```ts
// Global sequential stages for the sales-recruitment ("השמת אנשי מכירות") workspace.
// Pure data + helpers — no DB access. Mirrors the journeys template idea but video-free.

export type RecruitmentStageKind = "characterize" | "bring" | "interviews" | "closing";

export type RecruitmentStageTemplate = {
  index: number;
  kind: RecruitmentStageKind;
  label: string; // Hebrew, shown in UI
};

export const RECRUITMENT_STAGES: RecruitmentStageTemplate[] = [
  { index: 0, kind: "characterize", label: "אפיון סוג איש מכירות" },
  { index: 1, kind: "bring", label: "הבאת איש מכירות" },
  { index: 2, kind: "interviews", label: "ראיונות" },
  { index: 3, kind: "closing", label: "סגירה והכנסת איש מכירות" },
];

export function labelForStageKind(kind: string): string {
  return RECRUITMENT_STAGES.find((s) => s.kind === kind)?.label ?? kind;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/recruitment/stages.ts
git commit -m "feat(recruitment): stage template module"
```

---

## Task 3: Stage progression logic

**Files:**
- Create: `src/lib/recruitment/progress.ts`

- [ ] **Step 1: Write the module**

Create `src/lib/recruitment/progress.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RECRUITMENT_STAGES } from "@/lib/recruitment/stages";

// Seeds the 4 stages for a recruitment client. Stage 0 active, rest locked.
// Idempotent-ish: caller is responsible for not double-seeding (used at client creation).
export async function seedStages(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
  for (const t of RECRUITMENT_STAGES) {
    await tx.recruitmentStage.create({
      data: {
        clientId,
        index: t.index,
        kind: t.kind,
        status: t.index === 0 ? "active" : "locked",
      },
    });
  }
}

// Mark the active stage done and activate the next one (if any).
export async function advanceStage(clientId: string, index: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.recruitmentStage.findUniqueOrThrow({
      where: { clientId_index: { clientId, index } },
    });
    if (stage.status !== "active") throw new Error("רק שלב פעיל ניתן לסמן כהושלם");

    await tx.recruitmentStage.update({
      where: { clientId_index: { clientId, index } },
      data: { status: "done", completedAt: new Date() },
    });

    const next = RECRUITMENT_STAGES.find((t) => t.index === index + 1);
    if (next) {
      await tx.recruitmentStage.update({
        where: { clientId_index: { clientId, index: next.index } },
        data: { status: "active" },
      });
    }
  });
}

// Revert a done stage back to active; cascade all later stages back to locked.
export async function revertStage(clientId: string, index: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.recruitmentStage.findUniqueOrThrow({
      where: { clientId_index: { clientId, index } },
    });
    if (stage.status !== "done") throw new Error("ניתן להחזיר רק שלב שהושלם");

    const later = await tx.recruitmentStage.findMany({
      where: { clientId, index: { gt: index } },
    });
    for (const l of later) {
      if (l.status === "locked") continue;
      await tx.recruitmentStage.update({
        where: { id: l.id },
        data: { status: "locked", completedAt: null },
      });
    }

    await tx.recruitmentStage.update({
      where: { clientId_index: { clientId, index } },
      data: { status: "active", completedAt: null },
    });
  });
}

export async function setStageNote(clientId: string, index: number, note: string): Promise<void> {
  await prisma.recruitmentStage.update({
    where: { clientId_index: { clientId, index } },
    data: { note },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS (the `clientId_index` composite key exists from Task 1's `@@unique([clientId, index])`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/recruitment/progress.ts
git commit -m "feat(recruitment): stage advance/revert/seed logic"
```

---

## Task 4: Extend client-creation API

**Files:**
- Modify: `src/app/api/clients/route.ts`

- [ ] **Step 1: Update imports and Zod schema**

In `src/app/api/clients/route.ts`, add import at top after the existing `createJourneyForClient` import:

```ts
import { seedStages } from "@/lib/recruitment/progress";
```

Replace the `Body` schema (lines 13-18) with:

```ts
const Body = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  clientType: z.enum(["standard", "recruitment"]).default("standard"),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
  journeys: z.array(JourneyInput).optional(),
  pricePerSalesperson: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
});
```

- [ ] **Step 2: Branch the transaction on clientType**

Replace the `prisma.$transaction` block (lines 30-42) with:

```ts
  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        clientType: parsed.data.clientType,
        salesMeetingsTarget:
          parsed.data.clientType === "recruitment" ? null : parsed.data.salesMeetingsTarget ?? null,
      },
    });

    if (parsed.data.clientType === "recruitment") {
      await tx.recruitmentProfile.create({
        data: {
          clientId: created.id,
          pricePerSalesperson: parsed.data.pricePerSalesperson ?? null,
          currency: parsed.data.currency ?? "ILS",
        },
      });
      await seedStages(tx, created.id);
    } else {
      for (const j of parsed.data.journeys ?? []) {
        await createJourneyForClient(tx, created.id, j.kind, j.videoCount);
      }
    }
    return created;
  });
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clients/route.ts
git commit -m "feat(recruitment): seed profile and stages on client creation"
```

---

## Task 5: Client-creation form — type selector

**Files:**
- Modify: `src/app/clients/new-client-form.tsx`

- [ ] **Step 1: Add state and update the Step type**

In `src/app/clients/new-client-form.tsx`, change `type Step = 1 | 2;` to `type Step = 0 | 1 | 2;`.

Add state inside the component, after `const [busy, setBusy] = useState(false);`:

```tsx
  const [clientType, setClientType] = useState<"standard" | "recruitment">("standard");
  const [priceStr, setPriceStr] = useState("");
```

Change `const [step, setStep] = useState<Step>(1);` to `const [step, setStep] = useState<Step>(0);`.

- [ ] **Step 2: Reset new state in `close()`**

In `close()`, after `setStep(1);` change it to `setStep(0);` and append:

```tsx
    setClientType("standard"); setPriceStr("");
```

- [ ] **Step 3: Update `submit()` to send recruitment fields**

Replace the `submit()` body's `fetch` call body object (the `JSON.stringify({...})`) with:

```tsx
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        clientType,
        salesMeetingsTarget: clientType === "recruitment" ? null : target,
        journeys: clientType === "recruitment" || !journeys.length ? undefined : journeys,
        pricePerSalesperson:
          clientType === "recruitment" && priceStr.trim() !== "" ? Number(priceStr) : null,
        currency: "ILS",
      }),
```

And at the top of `submit()`, add a guard after `setBusy(true)` is NOT yet called — insert right before `const target =` line:

```tsx
    if (clientType === "recruitment" && priceStr.trim() !== "") {
      const p = Number(priceStr);
      if (!Number.isFinite(p) || p < 0) { alert("מחיר לאיש מכירות חייב להיות מספר ≥ 0"); return; }
    }
```

- [ ] **Step 4: Update `next()` and add a step-0 advance**

Replace `function next()` with:

```tsx
  function fromTypeStep() {
    setStep(1);
  }
  function next() {
    if (!name.trim()) { alert("חובה להזין שם"); return; }
    if (clientType === "recruitment") { submit(); return; }
    setStep(2);
  }
```

- [ ] **Step 5: Update the modal title and add Step 0 UI**

Change the `<h2>` text `לקוח חדש — שלב {step} מתוך 2` to:

```tsx
              <h2 className="text-lg font-semibold">לקוח חדש</h2>
```

Add a new block immediately after that header's closing `</div>` (before `{step === 1 && (`):

```tsx
            {step === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted">בחר את סוג הלקוח.</p>
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => { setClientType("standard"); fromTypeStep(); }}
                    className={`rounded-xl border p-4 text-right ${clientType === "standard" ? "border-accent" : "border-border"}`}
                  >
                    <div className="font-semibold">שיווק / מכירות</div>
                    <div className="text-xs text-muted">מרחבי אימון מכירות ושיווק</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setClientType("recruitment"); fromTypeStep(); }}
                    className={`rounded-xl border p-4 text-right ${clientType === "recruitment" ? "border-accent" : "border-border"}`}
                  >
                    <div className="font-semibold">השמת אנשי מכירות</div>
                    <div className="text-xs text-muted">שלבי השמה ותמחור לפי איש מכירות</div>
                  </button>
                </div>
                <div className="mt-2 flex justify-end">
                  <button onClick={close} className="btn-ghost">ביטול</button>
                </div>
              </div>
            )}
```

- [ ] **Step 6: Show price field on Step 1 for recruitment; hide meetings target**

In the `{step === 1 && (` block, wrap the "יעד פגישות מכירה" label so it only shows for standard, and add a price label for recruitment. Replace the meetings-target `<label>` (the block containing `יעד פגישות מכירה`) with:

```tsx
                {clientType === "standard" && (
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
                )}
                {clientType === "recruitment" && (
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">מחיר לאיש מכירות (₪, אופציונלי)</span>
                    <input
                      className="input w-full"
                      type="number"
                      min={0}
                      value={priceStr}
                      onChange={(e) => setPriceStr(e.target.value)}
                      placeholder="לדוגמה: 5000"
                    />
                  </label>
                )}
```

- [ ] **Step 7: Update Step 1 footer buttons**

In the `{step === 1 && (` block footer (`<div className="mt-2 flex justify-end gap-2">` with ביטול + הבא), replace with:

```tsx
                <div className="mt-2 flex justify-between gap-2">
                  <button onClick={() => setStep(0)} className="btn-ghost">← חזרה</button>
                  <button onClick={next} disabled={busy} className="btn-primary">
                    {clientType === "recruitment" ? (busy ? "יוצר…" : "סיום") : "הבא →"}
                  </button>
                </div>
```

- [ ] **Step 8: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/clients/new-client-form.tsx
git commit -m "feat(recruitment): client type selector in creation form"
```

---

## Task 6: Conditional workspace tabs

**Files:**
- Modify: `src/app/clients/[id]/layout.tsx:15-18`
- Modify: `src/app/clients/[id]/client-tabs.tsx`

- [ ] **Step 1: Select `clientType` in the layout**

In `src/app/clients/[id]/layout.tsx`, change the `select` (line 17) to include `clientType`:

```tsx
    select: { id: true, name: true, description: true, endedAt: true, clientType: true },
```

Change line 49 from `<ClientTabs clientId={client.id} />` to:

```tsx
      <ClientTabs clientId={client.id} clientType={client.clientType} />
```

- [ ] **Step 2: Add `clientType` prop and a recruitment branch in `ClientTabs`**

In `src/app/clients/[id]/client-tabs.tsx`, change the signature:

```tsx
export default function ClientTabs({ clientId, clientType }: { clientId: string; clientType: string }) {
```

Inside the `{onPortfolio && (` grid block, replace the two existing `<Link>` cards with a conditional. The grid wrapper becomes:

```tsx
        <div className="grid gap-4 md:grid-cols-2">
          {clientType === "recruitment" ? (
            <Link
              href={`${base}/recruitment`}
              className="group relative overflow-hidden rounded-2xl border border-transparent bg-accent p-6 text-white shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <span className="text-white/80 transition-transform group-hover:-translate-x-1">→</span>
              </div>
              <div className="mt-4">
                <div className="text-lg font-semibold">השמת אנשי מכירות</div>
                <div className="mt-1 text-sm text-white/80">שלבי השמה, תמחור לפי איש מכירות, אקסל הלקוח</div>
              </div>
            </Link>
          ) : (
            <>
```

…then keep the two original `<Link>` cards (sales + marketing) exactly as they were, and close with:

```tsx
            </>
          )}
        </div>
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/[id]/layout.tsx src/app/clients/[id]/client-tabs.tsx
git commit -m "feat(recruitment): conditional workspace tabs by client type"
```

---

## Task 7: Recruitment API routes

**Files:**
- Create: `src/app/api/clients/[id]/recruitment/route.ts`
- Create: `src/app/api/clients/[id]/recruitment/stages/route.ts`
- Create: `src/app/api/clients/[id]/recruitment/placements/route.ts`

- [ ] **Step 1: Profile PATCH route**

Create `src/app/api/clients/[id]/recruitment/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  pricePerSalesperson: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
  excelUrl: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().formErrors.join(", ") || "קלט לא תקין" }, { status: 400 });
  }

  const { pricePerSalesperson, currency, excelUrl } = parsed.data;

  if (excelUrl !== undefined) {
    await prisma.client.update({ where: { id }, data: { excelUrl } });
  }
  if (pricePerSalesperson !== undefined || currency !== undefined) {
    await prisma.recruitmentProfile.update({
      where: { clientId: id },
      data: {
        ...(pricePerSalesperson !== undefined ? { pricePerSalesperson } : {}),
        ...(currency !== undefined ? { currency } : {}),
      },
    });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Stages PATCH route**

Create `src/app/api/clients/[id]/recruitment/stages/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { advanceStage, revertStage, setStageNote } from "@/lib/recruitment/progress";

export const runtime = "nodejs";

const Body = z.object({
  index: z.number().int().min(0).max(3),
  action: z.enum(["advance", "revert", "note"]),
  note: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "קלט לא תקין" }, { status: 400 });
  }
  const { index, action, note } = parsed.data;
  try {
    if (action === "advance") await advanceStage(id, index);
    else if (action === "revert") await revertStage(id, index);
    else await setStageNote(id, index, note ?? "");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Placements POST/DELETE route**

Create `src/app/api/clients/[id]/recruitment/placements/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.recruitmentProfile.findUnique({ where: { clientId: id } });
  if (!profile) return NextResponse.json({ error: "לקוח השמה לא נמצא" }, { status: 404 });
  if (profile.pricePerSalesperson == null) {
    return NextResponse.json({ error: "יש להגדיר מחיר לאיש מכירות תחילה" }, { status: 409 });
  }
  await prisma.payment.create({
    data: {
      clientId: id,
      type: "closed",
      amount: profile.pricePerSalesperson,
      currency: profile.currency,
      source: "recruitment",
      note: "השמת איש מכירות",
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const last = await prisma.payment.findFirst({
    where: { clientId: id, source: "recruitment" },
    orderBy: { occurredAt: "desc" },
  });
  if (!last) return NextResponse.json({ error: "אין תשלומי השמה לביטול" }, { status: 409 });
  await prisma.payment.delete({ where: { id: last.id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clients/[id]/recruitment
git commit -m "feat(recruitment): profile, stages, and placements API routes"
```

---

## Task 8: Recruitment workspace — server page

**Files:**
- Create: `src/app/clients/[id]/recruitment/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/clients/[id]/recruitment/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { labelForStageKind } from "@/lib/recruitment/stages";
import RecruitmentClient from "./recruitment-client";

export const dynamic = "force-dynamic";

export default async function RecruitmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, clientType: true, excelUrl: true },
  });
  if (!client) notFound();
  if (client.clientType !== "recruitment") redirect(`/clients/${id}`);

  const profile = await prisma.recruitmentProfile.findUnique({ where: { clientId: id } });
  if (!profile) notFound();

  const [stages, closedCount] = await Promise.all([
    prisma.recruitmentStage.findMany({ where: { clientId: id }, orderBy: { index: "asc" } }),
    prisma.payment.count({ where: { clientId: id, source: "recruitment" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${id}`} className="text-xs text-muted hover:text-accent">← חזרה לפורטפוליו</Link>
        <h1 className="mt-1 text-2xl font-semibold">השמת אנשי מכירות</h1>
      </div>
      <RecruitmentClient
        clientId={id}
        excelUrl={client.excelUrl}
        pricePerSalesperson={profile.pricePerSalesperson}
        currency={profile.currency}
        closedCount={closedCount}
        stages={stages.map((s) => ({
          index: s.index,
          kind: s.kind,
          label: labelForStageKind(s.kind),
          status: s.status,
          note: s.note,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: FAIL — `./recruitment-client` not found yet. That's expected; Task 9 creates it. Skip to commit after Task 9 passes, OR continue directly to Task 9 before committing.

---

## Task 9: Recruitment workspace — client component

**Files:**
- Create: `src/app/clients/[id]/recruitment/recruitment-client.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/clients/[id]/recruitment/recruitment-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = { index: number; kind: string; label: string; status: string; note: string };

export default function RecruitmentClient({
  clientId,
  excelUrl,
  pricePerSalesperson,
  currency,
  closedCount,
  stages,
}: {
  clientId: string;
  excelUrl: string | null;
  pricePerSalesperson: number | null;
  currency: string;
  closedCount: number;
  stages: Stage[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [priceStr, setPriceStr] = useState(pricePerSalesperson?.toString() ?? "");
  const [excelStr, setExcelStr] = useState(excelUrl ?? "");

  const base = `/api/clients/${clientId}/recruitment`;

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    const r = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (r.ok) router.refresh();
    else alert(`שגיאה: ${(await r.json().catch(() => ({}))).error ?? r.statusText}`);
  }

  const doneCount = stages.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / stages.length) * 100);
  const totalRevenue = (pricePerSalesperson ?? 0) * closedCount;

  return (
    <div className="space-y-6">
      {/* Stage tracker */}
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">שלבי ההשמה</h2>
          <span className="text-xs text-muted">{doneCount}/{stages.length} הושלמו</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <ol className="space-y-3">
          {stages.map((s) => (
            <li key={s.index} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                    s.status === "done" ? "bg-accent text-white"
                    : s.status === "active" ? "bg-accent-soft text-accent-ink"
                    : "bg-border text-muted"
                  }`}>{s.index + 1}</span>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-muted">
                    {s.status === "done" ? "· הושלם" : s.status === "active" ? "· פעיל" : "· נעול"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {s.status === "active" && (
                  <button disabled={busy} onClick={() => call(`${base}/stages`, "PATCH", { index: s.index, action: "advance" })} className="btn-primary text-xs">
                    סמן כהושלם
                  </button>
                )}
                {s.status === "done" && (
                  <button disabled={busy} onClick={() => call(`${base}/stages`, "PATCH", { index: s.index, action: "revert" })} className="btn-ghost text-xs">
                    החזר
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Pricing + counter */}
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">תמחור ואנשי מכירות שנסגרו</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">מחיר לאיש מכירות ({currency})</span>
            <input className="input w-40" type="number" min={0} value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
          </label>
          <button
            disabled={busy}
            onClick={() => {
              const p = priceStr.trim() === "" ? null : Number(priceStr);
              if (p !== null && (!Number.isFinite(p) || p < 0)) { alert("מחיר חייב להיות מספר ≥ 0"); return; }
              call(base, "PATCH", { pricePerSalesperson: p });
            }}
            className="btn-ghost"
          >שמור מחיר</button>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
          <div>
            <div className="text-3xl font-bold">{closedCount}</div>
            <div className="text-xs text-muted">אנשי מכירות שנסגרו</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{totalRevenue.toLocaleString("he-IL")} {currency}</div>
            <div className="text-xs text-muted">סה״כ הכנסה</div>
          </div>
          <div className="ms-auto flex gap-2">
            <button disabled={busy} onClick={() => call(`${base}/placements`, "POST")} className="btn-primary">+ נסגר איש מכירות</button>
            <button disabled={busy || closedCount === 0} onClick={() => call(`${base}/placements`, "DELETE")} className="btn-ghost">בטל אחרון</button>
          </div>
        </div>
      </section>

      {/* Excel link */}
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">האקסל של הלקוח</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-muted">קישור לאקסל</span>
            <input className="input w-full" type="url" placeholder="https://docs.google.com/…" value={excelStr} onChange={(e) => setExcelStr(e.target.value)} />
          </label>
          <button
            disabled={busy}
            onClick={() => call(base, "PATCH", { excelUrl: excelStr.trim() === "" ? null : excelStr.trim() })}
            className="btn-ghost"
          >שמור</button>
          {excelUrl && (
            <a href={excelUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">פתח אקסל</a>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify the full app compiles (Tasks 8 + 9 together)**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/clients/[id]/recruitment
git commit -m "feat(recruitment): workspace page and interactive UI"
```

---

## Task 10: Manual end-to-end verification

**Files:** none (manual).

- [ ] **Step 1: Start the app**

Run: `pnpm dev`
Open `http://localhost:3000/clients`.

- [ ] **Step 2: Create a recruitment client**

Click "+ לקוח חדש" → choose "השמת אנשי מכירות" → enter name + price 5000 → "סיום".
Expected: client created, redirected/refreshed; opening it shows a single "השמת אנשי מכירות" card (no sales/marketing cards).

- [ ] **Step 3: Verify standard client unaffected**

Create another client choosing "שיווק / מכירות".
Expected: both "אימון מכירות" and "שיווק" cards still appear; journeys step still works.

- [ ] **Step 4: Exercise the recruitment workspace**

Open the recruitment client → `/clients/[id]/recruitment`.
- Mark stage 1 "סמן כהושלם" → progress bar advances, stage 2 becomes פעיל.
- Click "החזר" on stage 1 → stage 2 returns to נעול, stage 1 פעיל.
- Click "+ נסגר איש מכירות" twice → counter = 2, סה״כ הכנסה = 10,000 ₪.
- Click "בטל אחרון" → counter = 1.
- Go back to portfolio → top "נסגר" finance card reflects the placement payment(s).
- Paste an Excel URL → "שמור" → "פתח אקסל" appears and opens in a new tab.

- [ ] **Step 5: Final typecheck**

Run: `pnpm typecheck`
Expected: PASS.

---

## Self-Review Notes

- **Spec coverage:** clientType + excelUrl + Payment.source + two models (Task 1); type selector + pricing on creation (Tasks 4–5); conditional tabs (Task 6); global sequential stages with advance/revert (Tasks 2–3, 7, 9); counter + auto-payment as `type:"closed"` flowing to finance (Tasks 7, 9, verified Task 10 Step 4); Excel field recruitment-only (Tasks 8–9). All spec sections mapped.
- **Type consistency:** `advanceStage`/`revertStage`/`setStageNote`/`seedStages` signatures match between `progress.ts` (Task 3) and their callers (Tasks 4, 7). `RecruitmentStage` composite key `clientId_index` used consistently. Stage prop shape (`index/kind/label/status/note`) matches between page (Task 8) and client (Task 9).
- **Note on Task 8 typecheck:** Task 8 Step 2 fails in isolation because it imports the Task 9 file; this is intentional — commit only after Task 9. Subagent executors should run Tasks 8 and 9 as a pair.

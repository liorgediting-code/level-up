# Business Metrics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/metrics` page with time-period filtering (year/month/week/day) showing marketing KPIs, sales conversion rates, and a P&L report (revenue, ad spend, manual expenses, net profit).

**Architecture:** New top-level route `/metrics`. A pure utility `src/lib/metrics/date-range.ts` parses URL search params into a `{ start, end }` date range. The server component runs all Prisma queries in parallel and passes serialized data to a client component that handles the period picker and expense form. Expenses are stored in a new `BusinessExpense` model.

**Tech Stack:** Next.js 15 App Router, Prisma (SQLite), Zod, React `useState` for forms.

**Note:** Run this plan **after** `2026-06-08-team-roles.md` — both plans modify `app-shell.tsx` and `schema.prisma`, so apply them sequentially to avoid conflicts.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Modify | `src/app/_shell/app-shell.tsx` |
| Create | `src/lib/metrics/date-range.ts` |
| Create | `src/app/metrics/page.tsx` |
| Create | `src/app/metrics/metrics-client.tsx` |
| Create | `src/app/api/expenses/route.ts` |
| Create | `src/app/api/expenses/[id]/route.ts` |

---

## Task 1: Schema — Add BusinessExpense model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add model to schema**

Open `prisma/schema.prisma` and append at the end:

```prisma
model BusinessExpense {
  id        String   @id @default(cuid())
  label     String
  amount    Float    // whole shekels, same convention as Payment.amount
  date      DateTime
  category  String   @default("other") // salary | tools | office | other
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Push schema and regenerate**

```bash
pnpm db:push && pnpm db:generate
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma tsconfig.tsbuildinfo
git commit -m "feat(schema): add BusinessExpense model"
```

---

## Task 2: Date range utility

**Files:**
- Create: `src/lib/metrics/date-range.ts`

- [ ] **Step 1: Create the utility**

Create `src/lib/metrics/date-range.ts`:

```typescript
export type PeriodKind = "year" | "month" | "week" | "day";

export type DateRange = {
  start: Date;
  end: Date;
  label: string;
  periodKind: PeriodKind;
  periodKey: string; // normalised key used in URL ?date= param
};

/** Parse URL search params `period` and `date` into a UTC date range. Falls back to current month. */
export function parseDateRange(kind: string, date: string): DateRange {
  const now = new Date();
  const k: PeriodKind = (["year", "month", "week", "day"] as const).includes(kind as PeriodKind)
    ? (kind as PeriodKind)
    : "month";

  if (k === "year") {
    const y = /^\d{4}$/.test(date) ? Number(date) : now.getUTCFullYear();
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      end: new Date(Date.UTC(y + 1, 0, 1)),
      label: `${y}`,
      periodKind: k,
      periodKey: String(y),
    };
  }

  if (k === "month") {
    const defaultKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = /^\d{4}-\d{2}$/.test(date) ? date : defaultKey;
    const [y, mo] = key.split("-").map(Number);
    const start = new Date(Date.UTC(y, mo - 1, 1));
    const end = new Date(Date.UTC(y, mo, 1));
    const label = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(start);
    return { start, end, label, periodKind: k, periodKey: key };
  }

  if (k === "week") {
    let year: number;
    let week: number;
    const m = /^(\d{4})-W(\d{2})$/.exec(date);
    if (m) {
      year = Number(m[1]);
      week = Number(m[2]);
    } else {
      // current ISO week
      const d = new Date();
      const dow = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dow);
      year = d.getUTCFullYear();
      const jan1 = new Date(Date.UTC(year, 0, 1));
      week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
    }
    const start = isoWeekStart(year, week);
    const end = new Date(start.getTime() + 7 * 86400000);
    const periodKey = `${year}-W${String(week).padStart(2, "0")}`;
    return { start, end, label: `שבוע ${week}, ${year}`, periodKind: k, periodKey };
  }

  // day
  const defaultDay = now.toISOString().slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : defaultDay;
  const [dy, dm, dd] = day.split("-").map(Number);
  const start = new Date(Date.UTC(dy, dm - 1, dd));
  const end = new Date(Date.UTC(dy, dm - 1, dd + 1));
  const label = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
  return { start, end, label, periodKind: k, periodKey: day };
}

function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4.getTime() - (dow - 1) * 86400000);
  return new Date(firstMonday.getTime() + (week - 1) * 7 * 86400000);
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/metrics/
git commit -m "feat(lib): add parseDateRange utility for metrics page"
```

---

## Task 3: API routes — Expenses (POST, DELETE)

**Files:**
- Create: `src/app/api/expenses/route.ts`
- Create: `src/app/api/expenses/[id]/route.ts`

- [ ] **Step 1: Create POST /api/expenses**

Create `src/app/api/expenses/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const CATEGORIES = ["salary", "tools", "office", "other"] as const;

const Body = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().positive(),
  date: z.string().min(8), // ISO date string YYYY-MM-DD
  category: z.enum(CATEGORIES).default("other"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const d = parsed.data;
  const expense = await prisma.businessExpense.create({
    data: {
      label: d.label.trim(),
      amount: d.amount,
      date: new Date(d.date),
      category: d.category,
    },
  });
  return NextResponse.json(
    {
      id: expense.id,
      label: expense.label,
      amount: expense.amount,
      date: expense.date.toISOString(),
      category: expense.category,
    },
    { status: 201 }
  );
}
```

- [ ] **Step 2: Create DELETE /api/expenses/[id]**

Create `src/app/api/expenses/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.businessExpense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/expenses/
git commit -m "feat(api): expense CRUD routes for /metrics P&L"
```

---

## Task 4: Nav item + server page

**Files:**
- Modify: `src/app/_shell/app-shell.tsx`
- Create: `src/app/metrics/page.tsx`

- [ ] **Step 1: Add "מדדים" nav item**

In `src/app/_shell/app-shell.tsx`, add the "מדדים" entry after `{ href: "/team", ... }` (which was added by the team-roles plan). If running this plan standalone (without the team plan), insert after `{ href: "/campaigns", ... }` instead.

Also add a `ChartIcon` function at the bottom of the file:

In the NAV array, add:
```typescript
{ href: "/metrics", label: "מדדים", icon: ChartIcon },
```

At the bottom of the file, add the icon function:
```typescript
function ChartIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 4 4 4-5" />
    </svg>
  );
}
```

- [ ] **Step 2: Create the server page component**

Create `src/app/metrics/page.tsx`:

```typescript
import { prisma } from "@/lib/db";
import { parseDateRange } from "@/lib/metrics/date-range";
import MetricsClient from "./metrics-client";

export const dynamic = "force-dynamic";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const range = parseDateRange(sp.period ?? "month", sp.date ?? "");

  const [
    marketingAgg,
    topCampaigns,
    leadsIn,
    meetingsScheduled,
    meetingsHeld,
    dealsClosed,
    revenueReceived,
    revenueClosed,
    adSpendAgg,
    expenses,
  ] = await Promise.all([
    prisma.campaignDailyStat.aggregate({
      where: { date: { gte: range.start, lt: range.end } },
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
    }),
    prisma.campaign.findMany({
      where: { stats: { some: { date: { gte: range.start, lt: range.end } } } },
      select: {
        id: true,
        name: true,
        stats: {
          where: { date: { gte: range.start, lt: range.end } },
          select: { spend: true, leads: true },
        },
      },
    }),
    prisma.lead.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
    prisma.meeting.count({ where: { scheduledAt: { gte: range.start, lt: range.end } } }),
    prisma.meeting.count({
      where: { scheduledAt: { gte: range.start, lt: range.end }, status: "held" },
    }),
    prisma.payment.count({
      where: { occurredAt: { gte: range.start, lt: range.end }, type: "closed" },
    }),
    prisma.payment.aggregate({
      where: { occurredAt: { gte: range.start, lt: range.end }, type: "paid" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { occurredAt: { gte: range.start, lt: range.end }, type: "closed" },
      _sum: { amount: true },
    }),
    prisma.campaignDailyStat.aggregate({
      where: { date: { gte: range.start, lt: range.end } },
      _sum: { spend: true },
    }),
    prisma.businessExpense.findMany({
      where: { date: { gte: range.start, lt: range.end } },
      orderBy: { date: "desc" },
    }),
  ]);

  const spend = marketingAgg._sum.spend ?? 0;
  const impressions = marketingAgg._sum.impressions ?? 0;
  const clicks = marketingAgg._sum.clicks ?? 0;
  const leads = marketingAgg._sum.leads ?? 0;
  const totalAdSpend = adSpendAgg._sum.spend ?? 0;
  const totalRevReceived = revenueReceived._sum.amount ?? 0;
  const totalGeneralExp = expenses.reduce((s, e) => s + e.amount, 0);

  const campaignRows = topCampaigns
    .map((c) => ({
      id: c.id,
      name: c.name,
      spend: c.stats.reduce((s, r) => s + (r.spend ?? 0), 0),
      leads: c.stats.reduce((s, r) => s + (r.leads ?? 0), 0),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  return (
    <MetricsClient
      range={{
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label,
        periodKind: range.periodKind,
        periodKey: range.periodKey,
      }}
      marketing={{
        spend,
        impressions,
        clicks,
        leads,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        cpl: leads ? spend / leads : 0,
        cpm: impressions ? (spend / impressions) * 1000 : 0,
      }}
      campaigns={campaignRows}
      sales={{
        leadsIn,
        meetingsScheduled,
        meetingsHeld,
        dealsClosed,
        revenueReceived: totalRevReceived,
        revenueClosed: revenueClosed._sum.amount ?? 0,
        convLeadToMeeting: leadsIn ? (meetingsScheduled / leadsIn) * 100 : 0,
        convMeetingToClose: meetingsHeld ? (dealsClosed / meetingsHeld) * 100 : 0,
      }}
      pnl={{
        revenueReceived: totalRevReceived,
        adSpend: totalAdSpend,
        generalExpenses: totalGeneralExp,
        netProfit: totalRevReceived - totalAdSpend - totalGeneralExp,
      }}
      expenses={expenses.map((e) => ({
        id: e.id,
        label: e.label,
        amount: e.amount,
        date: e.date.toISOString(),
        category: e.category,
      }))}
    />
  );
}
```

- [ ] **Step 3: Typecheck (will fail on missing client — that's expected)**

```bash
pnpm typecheck 2>&1 | grep -v "metrics-client"
```

If the only errors mention `./metrics-client`, proceed to Task 5.

- [ ] **Step 4: Commit nav (hold page commit until client is ready)**

```bash
git add src/app/_shell/app-shell.tsx
git commit -m "feat(nav): add מדדים nav item"
```

---

## Task 5: Metrics client component

**Files:**
- Create: `src/app/metrics/metrics-client.tsx`

- [ ] **Step 1: Create metrics-client.tsx**

Create `src/app/metrics/metrics-client.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtIls, fmtInt, fmtPct } from "@/lib/utils";

type PeriodKind = "year" | "month" | "week" | "day";

type RangeProps = {
  start: string;
  end: string;
  label: string;
  periodKind: PeriodKind;
  periodKey: string;
};

type Marketing = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
  cpl: number;
  cpm: number;
};

type Sales = {
  leadsIn: number;
  meetingsScheduled: number;
  meetingsHeld: number;
  dealsClosed: number;
  revenueReceived: number;
  revenueClosed: number;
  convLeadToMeeting: number;
  convMeetingToClose: number;
};

type Pnl = {
  revenueReceived: number;
  adSpend: number;
  generalExpenses: number;
  netProfit: number;
};

type Expense = {
  id: string;
  label: string;
  amount: number;
  date: string;
  category: string;
};

type Campaign = {
  id: string;
  name: string;
  spend: number;
  leads: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  salary: "שכר",
  tools: "כלים ומנויים",
  office: "משרד",
  other: "אחר",
};

const PERIOD_LABELS: Record<PeriodKind, string> = {
  year: "שנה",
  month: "חודש",
  week: "שבוע",
  day: "יום",
};

export default function MetricsClient({
  range,
  marketing,
  campaigns,
  sales,
  pnl,
  expenses,
}: {
  range: RangeProps;
  marketing: Marketing;
  campaigns: Campaign[];
  sales: Sales;
  pnl: Pnl;
  expenses: Expense[];
}) {
  const router = useRouter();

  function nav(kind: PeriodKind, key: string) {
    const params = new URLSearchParams();
    params.set("period", kind);
    params.set("date", key);
    router.push(`/metrics?${params}`);
  }

  function shiftPeriod(dir: 1 | -1) {
    const k = range.periodKind;
    const key = range.periodKey;
    if (k === "year") {
      nav("year", String(Number(key) + dir));
    } else if (k === "month") {
      const [y, m] = key.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1));
      nav("month", `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    } else if (k === "week") {
      const match = /^(\d{4})-W(\d{2})$/.exec(key);
      if (match) {
        const wYear = Number(match[1]);
        const wWeek = Number(match[2]) + dir;
        // Simplified: let the server normalise week overflow
        nav("week", `${wYear}-W${String(wWeek).padStart(2, "0")}`);
      }
    } else {
      const d = new Date(key);
      d.setUTCDate(d.getUTCDate() + dir);
      nav("day", d.toISOString().slice(0, 10));
    }
  }

  return (
    <div className="space-y-8">
      {/* Header + period picker */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מדדים עסקיים</h1>
          <p className="mt-1 text-sm text-muted">{range.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(["year", "month", "week", "day"] as PeriodKind[]).map((k) => (
              <button
                key={k}
                onClick={() => nav(k, "")}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  range.periodKind === k
                    ? "bg-accent text-white"
                    : "bg-surface text-muted hover:bg-elevated hover:text-fg"
                }`}
              >
                {PERIOD_LABELS[k]}
              </button>
            ))}
          </div>
          <button onClick={() => shiftPeriod(-1)} className="btn-ghost px-2">←</button>
          <button onClick={() => shiftPeriod(1)} className="btn-ghost px-2">→</button>
        </div>
      </header>

      {/* Marketing section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">שיווק</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <MetricCard label="הוצאה" value={fmtIls(marketing.spend)} tone="red" />
          <MetricCard label="חשיפות" value={fmtInt(marketing.impressions)} tone="blue" />
          <MetricCard label="קליקים" value={fmtInt(marketing.clicks)} tone="violet" />
          <MetricCard label="CTR" value={fmtPct(marketing.ctr)} tone="violet" />
          <MetricCard label="לידים" value={fmtInt(marketing.leads)} tone="pink" />
          <MetricCard label="CPL" value={fmtIls(marketing.cpl)} tone="pink" />
          <MetricCard label="CPM" value={fmtIls(marketing.cpm)} tone="amber" />
        </div>
        {campaigns.length > 0 && (
          <div className="card p-0 overflow-hidden">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold">קמפיינים</div>
            <table className="w-full text-sm">
              <thead className="bg-elevated">
                <tr>
                  <th className="table-th">קמפיין</th>
                  <th className="table-th">הוצאה</th>
                  <th className="table-th">לידים</th>
                  <th className="table-th">CPL</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="table-td">{c.name}</td>
                    <td className="table-td num">{fmtIls(c.spend)}</td>
                    <td className="table-td num">{fmtInt(c.leads)}</td>
                    <td className="table-td num">{c.leads ? fmtIls(c.spend / c.leads) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sales section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">מכירות</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          <MetricCard label="לידים נכנסו" value={fmtInt(sales.leadsIn)} tone="pink" />
          <MetricCard label="פגישות שנקבעו" value={fmtInt(sales.meetingsScheduled)} tone="blue" />
          <MetricCard label="פגישות שנערכו" value={fmtInt(sales.meetingsHeld)} tone="blue" />
          <MetricCard label="עסקאות נסגרו" value={fmtInt(sales.dealsClosed)} tone="green" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="הכנסות שנסגרו" value={fmtIls(sales.revenueClosed)} tone="amber" />
          <MetricCard label="הכנסות שהתקבלו" value={fmtIls(sales.revenueReceived)} tone="green" />
          <MetricCard
            label="המרה ליד→פגישה"
            value={fmtPct(sales.convLeadToMeeting)}
            tone="violet"
          />
          <MetricCard
            label="המרה פגישה→סגירה"
            value={fmtPct(sales.convMeetingToClose)}
            tone="violet"
          />
        </div>
      </section>

      {/* P&L section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">רווח והפסד</h2>
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <PnlRow label="הכנסות (התקבלו)" value={fmtIls(pnl.revenueReceived)} positive />
              <PnlRow label="הוצאות פרסום (Meta)" value={`−${fmtIls(pnl.adSpend)}`} />
              <PnlRow label="הוצאות כלליות" value={`−${fmtIls(pnl.generalExpenses)}`} />
              <PnlRow
                label="רווח נקי"
                value={fmtIls(pnl.netProfit)}
                bold
                positive={pnl.netProfit >= 0}
                negative={pnl.netProfit < 0}
              />
            </tbody>
          </table>
        </div>

        <ExpenseList
          expenses={expenses}
          rangeStart={range.start}
          rangeEnd={range.end}
          onRefresh={() => router.refresh()}
        />
      </section>
    </div>
  );
}

/* ---------- sub-components ---------- */

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "blue" | "violet" | "pink" | "amber" | "green";
}) {
  const dot: Record<typeof tone, string> = {
    red: "oklch(0.62 0.22 25)",
    blue: "oklch(0.56 0.22 258)",
    violet: "oklch(0.58 0.22 295)",
    pink: "oklch(0.65 0.22 0)",
    amber: "oklch(0.74 0.16 75)",
    green: "oklch(0.65 0.18 145)",
  };
  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot[tone] }} />
        <span className="label truncate">{label}</span>
      </div>
      <div className="num mt-2 text-xl font-bold leading-none tracking-tight">{value}</div>
    </div>
  );
}

function PnlRow({
  label,
  value,
  bold,
  positive,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <tr className={`border-t border-border first:border-t-0 ${bold ? "bg-elevated" : ""}`}>
      <td className={`px-5 py-3 ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td
        className={`px-5 py-3 text-left num ${
          bold ? "text-base font-bold" : ""
        } ${positive ? "text-good" : ""} ${negative ? "text-bad" : ""}`}
        dir="ltr"
      >
        {value}
      </td>
    </tr>
  );
}

function ExpenseList({
  expenses,
  rangeStart,
  rangeEnd,
  onRefresh,
}: {
  expenses: Expense[];
  rangeStart: string;
  rangeEnd: string;
  onRefresh: () => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(rangeStart.slice(0, 10));
  const [category, setCategory] = useState("other");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addExpense() {
    const n = parseFloat(amount);
    if (!label.trim() || isNaN(n) || n <= 0) return;
    setBusy(true);
    await fetch("/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: label.trim(), amount: n, date, category }),
    });
    setBusy(false);
    setLabel("");
    setAmount("");
    setAdding(false);
    onRefresh();
  }

  async function deleteExpense(id: string) {
    if (!confirm("למחוק הוצאה זו?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-sm font-semibold">הוצאות כלליות</span>
        <button onClick={() => setAdding(true)} className="btn-soft text-sm">
          + הוסף הוצאה
        </button>
      </div>

      {adding && (
        <div className="flex flex-wrap gap-2 border-b border-border bg-elevated px-5 py-3">
          <input
            autoFocus
            className="input flex-1 min-w-32 text-sm"
            placeholder="תיאור (למשל: שכר ליאב)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="input w-28 text-sm"
            type="number"
            placeholder="סכום ₪"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="input w-36 text-sm"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <select
            className="input w-36 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="salary">שכר</option>
            <option value="tools">כלים ומנויים</option>
            <option value="office">משרד</option>
            <option value="other">אחר</option>
          </select>
          <button
            onClick={addExpense}
            disabled={busy || !label.trim() || !amount}
            className="btn-primary text-sm"
          >
            {busy ? "…" : "שמור"}
          </button>
          <button onClick={() => setAdding(false)} className="btn-ghost text-sm">ביטול</button>
        </div>
      )}

      {expenses.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr>
              <th className="table-th">תיאור</th>
              <th className="table-th">קטגוריה</th>
              <th className="table-th">תאריך</th>
              <th className="table-th">סכום</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td className="table-td">{e.label}</td>
                <td className="table-td text-muted">{CATEGORY_LABEL[e.category] ?? e.category}</td>
                <td className="table-td num text-muted">
                  {new Date(e.date).toLocaleDateString("he-IL")}
                </td>
                <td className="table-td num">{fmtIls(e.amount)}</td>
                <td className="table-td">
                  <button
                    onClick={() => deleteExpense(e.id)}
                    className="text-xs text-muted hover:text-bad"
                  >
                    מחק
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-5 py-6 text-sm text-muted">אין הוצאות כלליות לתקופה זו.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Run dev server and verify manually**

```bash
pnpm dev
```

Open `http://localhost:3000/metrics`. Verify:
1. Page loads with current month data
2. Period buttons (שנה/חודש/שבוע/יום) switch the displayed period; URL updates
3. ← / → arrows shift the period backward/forward
4. Marketing section shows Meta campaign aggregates (zeros if no data synced)
5. Sales section shows lead/meeting/payment counts
6. P&L table shows הכנסות, הוצאות פרסום, הוצאות כלליות, רווח נקי
7. "+ הוסף הוצאה" opens the form; saving adds a row to the expenses table and updates the P&L totals after refresh
8. "מחק" on an expense removes it

- [ ] **Step 4: Commit**

```bash
git add src/app/metrics/ src/app/api/expenses/
git commit -m "feat(metrics): add /metrics page with marketing, sales, and P&L dashboard"
```

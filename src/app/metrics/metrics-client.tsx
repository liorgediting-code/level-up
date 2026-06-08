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
  onRefresh,
}: {
  expenses: Expense[];
  rangeStart: string;
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

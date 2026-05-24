"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PERIOD_TYPES,
  PERIOD_LABEL,
  periodLabelHe,
  currentPeriodStart,
  type PeriodType,
} from "@/lib/periods";
import { formatValue, type MetricUnit } from "@/lib/metrics";

type Lite = { id: string; name: string };
type Scope = "income" | "client" | "metric";

type Target = {
  id: string;
  periodType: PeriodType;
  periodStart: string;
  scope: Scope;
  clientId: string | null;
  clientName: string | null;
  label: string;
  unit: MetricUnit;
  targetValue: number;
  actualValue: number;
};

const SCOPE_LABEL: Record<Scope, string> = {
  income: "הכנסות",
  client: "לקוח",
  metric: "מדד",
};

function toDateInput(unit: MetricUnit, v: number): string {
  return String(unit === "currency" ? Math.round(v / 100) : v);
}
function fromInput(unit: MetricUnit, raw: string): number {
  const n = Number(raw.replace(/[^\d.-]/g, "")) || 0;
  return unit === "currency" ? Math.round(n * 100) : Math.round(n);
}

export default function GoalsClient(props: { clients: Lite[]; targets: Target[] }) {
  const router = useRouter();
  const [active, setActive] = useState<PeriodType>("month");

  // add form
  const [scope, setScope] = useState<Scope>("income");
  const [clientId, setClientId] = useState("");
  const [label, setLabel] = useState("הכנסות");
  const [unit, setUnit] = useState<MetricUnit>("currency");
  const [periodDate, setPeriodDate] = useState(currentPeriodStart("month").toISOString().slice(0, 10));
  const [targetValue, setTargetValue] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = props.targets.filter((t) => t.periodType === active);

  function onScopeChange(s: Scope) {
    setScope(s);
    if (s === "income") {
      setLabel("הכנסות");
      setUnit("currency");
    } else if (s === "client") {
      setLabel("");
      setUnit("currency");
    } else {
      setLabel("");
      setUnit("number");
    }
  }

  async function add() {
    if (scope === "client" && !clientId) {
      alert("בחר לקוח");
      return;
    }
    if (!label.trim()) {
      alert("הזן שם מדד");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodType: active,
          periodStart: new Date(periodDate).toISOString(),
          scope,
          clientId: scope === "client" ? clientId : null,
          label: label.trim(),
          unit,
          targetValue: fromInput(unit, targetValue),
          actualValue: 0,
        }),
      });
      setTargetValue("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, field: "targetValue" | "actualValue", unit: MetricUnit, raw: string) {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: fromInput(unit, raw) }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("למחוק את המטרה?")) return;
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    router.refresh();
  }

  // group by period within the active tab
  const groups = new Map<string, Target[]>();
  for (const t of visible) {
    const key = t.periodStart;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-border bg-surface p-1">
        {PERIOD_TYPES.map((pt) => {
          const on = active === pt;
          return (
            <button
              key={pt}
              onClick={() => {
                setActive(pt);
                setPeriodDate(currentPeriodStart(pt).toISOString().slice(0, 10));
              }}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                on ? "bg-accent text-white" : "text-muted hover:text-fg"
              }`}
            >
              {PERIOD_LABEL[pt]}
            </button>
          );
        })}
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">מטרה חדשה ({PERIOD_LABEL[active]})</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <select
            value={scope}
            onChange={(e) => onScopeChange(e.target.value as Scope)}
            className="rounded-md border border-border bg-bg px-2 py-2 text-sm"
          >
            <option value="income">הכנסות</option>
            <option value="client">לקוח</option>
            <option value="metric">מדד</option>
          </select>
          {scope === "client" ? (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-md border border-border bg-bg px-2 py-2 text-sm"
            >
              <option value="">בחר לקוח</option>
              {props.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="שם המדד"
              className="rounded-md border border-border bg-bg px-2 py-2 text-sm"
            />
          )}
          {scope === "client" && (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="שם המדד (למשל הכנסות)"
              className="rounded-md border border-border bg-bg px-2 py-2 text-sm"
            />
          )}
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as MetricUnit)}
            className="rounded-md border border-border bg-bg px-2 py-2 text-sm"
          >
            <option value="currency">מטבע (₪)</option>
            <option value="number">מספר</option>
            <option value="percent">אחוז</option>
          </select>
          <input
            type="date"
            value={periodDate}
            onChange={(e) => setPeriodDate(e.target.value)}
            className="rounded-md border border-border bg-bg px-2 py-2 text-sm"
            title="תאריך בתוך התקופה"
          />
          <input
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="יעד"
            className="rounded-md border border-border bg-bg px-2 py-2 text-sm"
          />
        </div>
        <button
          onClick={add}
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          הוסף מטרה
        </button>
      </section>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          אין מטרות לתקופה זו עדיין.
        </div>
      ) : (
        [...groups.entries()].map(([periodStart, items]) => (
          <section key={periodStart} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">{periodLabelHe(active, new Date(periodStart))}</h2>
            <div className="space-y-2">
              {items.map((t) => {
                const pct = t.targetValue > 0 ? Math.min(100, Math.round((t.actualValue / t.targetValue) * 100)) : 0;
                return (
                  <div key={t.id} className="rounded-xl border border-border bg-bg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-ink">
                          {SCOPE_LABEL[t.scope]}
                        </span>
                        <span className="font-medium">
                          {t.scope === "client" && t.clientName ? `${t.clientName} · ` : ""}
                          {t.label}
                        </span>
                      </div>
                      <button onClick={() => remove(t.id)} className="text-xs text-rose-500 hover:underline">
                        מחק
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex items-center gap-1">
                        <span className="text-[11px] text-muted">בוצע</span>
                        <input
                          defaultValue={toDateInput(t.unit, t.actualValue)}
                          onBlur={(e) => patch(t.id, "actualValue", t.unit, e.target.value)}
                          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        <span className="text-[11px] text-muted">יעד</span>
                        <input
                          defaultValue={toDateInput(t.unit, t.targetValue)}
                          onBlur={(e) => patch(t.id, "targetValue", t.unit, e.target.value)}
                          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right"
                        />
                      </label>
                      <span className="text-xs text-muted">
                        {formatValue(t.actualValue, t.unit)} / {formatValue(t.targetValue, t.unit)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 text-left text-[11px] text-muted">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

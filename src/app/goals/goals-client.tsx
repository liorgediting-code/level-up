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
type TaskStatus = "todo" | "in_progress" | "problem" | "done";

type TargetTaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
};

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
  tasks: TargetTaskRow[];
};

const SCOPE_LABEL: Record<Scope, string> = {
  income: "הכנסות",
  client: "לקוח",
  metric: "מדד",
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "צריך לעשות",
  in_progress: "בעשייה",
  problem: "בעיה",
  done: "הושלמה",
};

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-surface text-muted border border-border",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  problem: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const TASK_STATUS_ORDER: TaskStatus[] = ["problem", "in_progress", "todo", "done"];

function toDateInput(unit: MetricUnit, v: number): string {
  return String(unit === "currency" ? Math.round(v / 100) : v);
}
function fromInput(unit: MetricUnit, raw: string): number {
  const n = Number(raw.replace(/[^\d.-]/g, "")) || 0;
  return unit === "currency" ? Math.round(n * 100) : Math.round(n);
}

function TargetTasksSection({ target }: { target: Target }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TargetTaskRow[]>(target.tasks);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/goals/${target.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) {
      const { task } = await res.json();
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
      router.refresh();
    }
    setAdding(false);
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    const res = await fetch(`/api/goals/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    }
  }

  async function handleDelete(taskId: string) {
    const res = await fetch(`/api/goals/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      router.refresh();
    }
  }

  const sorted = [...tasks].sort(
    (a, b) => TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status)
  );

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-2">
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">משימות</p>

      {sorted.length > 0 && (
        <div className="space-y-1.5">
          {sorted.map((task) => (
            <div
              key={task.id}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                task.status === "done" ? "opacity-50" : ""
              }`}
            >
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                className="rounded border border-border bg-bg px-1.5 py-0.5 text-[11px] text-fg focus:outline-none"
              >
                {TASK_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TASK_STATUS_COLORS[task.status]}`}
              >
                {TASK_STATUS_LABEL[task.status]}
              </span>
              <span
                className={`flex-1 text-sm ${task.status === "done" ? "line-through text-muted" : "text-fg"}`}
              >
                {task.title}
              </span>
              <button
                onClick={() => handleDelete(task.id)}
                className="opacity-0 group-hover:opacity-100 text-xs text-rose-400 hover:text-rose-600 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="הוסף משימה..."
          disabled={adding}
          className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          +
        </button>
      </form>
    </div>
  );
}

function TargetCard({
  t,
  onPatch,
  onRemove,
}: {
  t: Target;
  onPatch: (id: string, field: "targetValue" | "actualValue", unit: MetricUnit, raw: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pct = t.targetValue > 0 ? Math.min(100, Math.round((t.actualValue / t.targetValue) * 100)) : 0;
  const problemCount = t.tasks.filter((tk) => tk.status === "problem").length;

  return (
    <div className="rounded-xl border border-border bg-bg">
      <div className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-right"
          >
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-ink">
              {SCOPE_LABEL[t.scope]}
            </span>
            <span className="font-medium">
              {t.scope === "client" && t.clientName ? `${t.clientName} · ` : ""}
              {t.label}
            </span>
            {t.tasks.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <span>{t.tasks.length} משימות</span>
                {problemCount > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-300">
                    {problemCount} בעיה
                  </span>
                )}
              </span>
            )}
            <ChevronIcon
              className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          <button onClick={() => onRemove(t.id)} className="text-xs text-rose-500 hover:underline">
            מחק
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-[11px] text-muted">בוצע</span>
            <input
              defaultValue={toDateInput(t.unit, t.actualValue)}
              onBlur={(e) => onPatch(t.id, "actualValue", t.unit, e.target.value)}
              className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-[11px] text-muted">יעד</span>
            <input
              defaultValue={toDateInput(t.unit, t.targetValue)}
              onBlur={(e) => onPatch(t.id, "targetValue", t.unit, e.target.value)}
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

      {open && <TargetTasksSection target={t} />}
    </div>
  );
}

export default function GoalsClient(props: {
  clients: Lite[];
  targets: Target[];
  initialTab: PeriodType;
}) {
  const router = useRouter();
  const [active, setActive] = useState<PeriodType>(props.initialTab);

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
              {items.map((t) => (
                <TargetCard
                  key={t.id}
                  t={t}
                  onPatch={patch}
                  onRemove={remove}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ChevronIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

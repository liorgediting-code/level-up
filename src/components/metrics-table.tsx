"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatValue, monthKey, monthLabelHe, type MetricUnit } from "@/lib/metrics";

export type Column = { id?: string; key: string; label: string; unit: MetricUnit; builtin?: boolean };
export type Row = { id: string; periodMonth: string; values: Record<string, number> };

export default function MetricsTable(props: {
  columns: Column[];
  rows: Row[];
  // "client" → /api/clients/:targetId/metrics/*  ;  "funnel" → /api/funnels/:targetId/*
  kind: "client" | "funnel";
  targetId: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [colLabel, setColLabel] = useState("");
  const [colUnit, setColUnit] = useState<MetricUnit>("number");

  const base = props.kind === "client"
    ? `/api/clients/${props.targetId}/metrics`
    : `/api/funnels/${props.targetId}`;
  const ep = {
    addColumn: `${base}/columns`,
    deleteColumn: (colId: string) => `${base}/columns/${colId}`,
    addRow: `${base}/rows`,
    patchRow: (rowId: string) => `${base}/rows/${rowId}`,
    deleteRow: (rowId: string) => `${base}/rows/${rowId}`,
  };

  async function addColumn() {
    if (!colLabel.trim()) return;
    await fetch(ep.addColumn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: colLabel.trim(), unit: colUnit }),
    });
    setColLabel("");
    setAdding(false);
    router.refresh();
  }

  async function deleteColumn(colId: string) {
    if (!confirm("למחוק את העמודה?")) return;
    await fetch(ep.deleteColumn(colId), { method: "DELETE" });
    router.refresh();
  }

  async function addRow() {
    const now = new Date();
    const mk = monthKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
    await fetch(ep.addRow, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodMonth: mk }),
    });
    router.refresh();
  }

  async function deleteRow(rowId: string) {
    if (!confirm("למחוק את החודש?")) return;
    await fetch(ep.deleteRow(rowId), { method: "DELETE" });
    router.refresh();
  }

  async function commitCell(rowId: string, key: string, value: number, builtin: boolean) {
    let body: Record<string, unknown>;
    if (props.kind === "client") {
      body = builtin ? { [key]: value } : { extra: { [key]: value } };
    } else {
      body = { values: { [key]: value } };
    }
    await fetch(ep.patchRow(rowId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={addRow} className="rounded-md bg-accent px-3 py-1.5 text-xs text-white">
          + הוסף חודש
        </button>
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs"
          >
            + הוסף עמודה
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={colLabel}
              onChange={(e) => setColLabel(e.target.value)}
              placeholder="שם העמודה"
              className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
            />
            <select
              value={colUnit}
              onChange={(e) => setColUnit(e.target.value as MetricUnit)}
              className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
            >
              <option value="number">מספר</option>
              <option value="currency">מטבע (₪)</option>
              <option value="percent">אחוז</option>
            </select>
            <button onClick={addColumn} className="rounded-md bg-accent px-3 py-1.5 text-xs text-white">
              הוסף
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setColLabel("");
              }}
              className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs"
            >
              ביטול
            </button>
          </div>
        )}
      </div>
      {props.rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted">
          אין נתונים — הוסף חודש כדי להתחיל.
        </div>
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
                        <button
                          onClick={() => deleteColumn(c.id!)}
                          className="text-rose-500 hover:underline"
                          title="מחק עמודה"
                        >
                          ×
                        </button>
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
                      <button
                        onClick={() => deleteRow(r.id)}
                        className="text-xs text-rose-500 hover:underline"
                      >
                        מחק
                      </button>
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
  const initial = String(props.unit === "currency" ? Math.round(props.value / 100) : props.value);
  const [raw, setRaw] = useState(initial);

  if (!editing) {
    return (
      <button
        className="w-full text-right hover:underline"
        onClick={() => {
          setRaw(initial);
          setEditing(true);
        }}
      >
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
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-right text-sm"
    />
  );
}

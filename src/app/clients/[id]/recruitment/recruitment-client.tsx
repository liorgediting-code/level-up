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
    if (r.ok) {
      router.refresh();
    } else {
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      alert(`שגיאה: ${data.error ?? r.statusText}`);
    }
  }

  const doneCount = stages.filter((s) => s.status === "done").length;
  const pct = stages.length ? Math.round((doneCount / stages.length) * 100) : 0;
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

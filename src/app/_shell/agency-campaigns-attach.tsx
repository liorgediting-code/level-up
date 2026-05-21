"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Camp = { id: string; name: string; isAgencyOwned: boolean };

export default function AgencyCampaignsAttach({ campaigns }: { campaigns: Camp[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return campaigns;
    return campaigns.filter((c) => c.name.toLowerCase().includes(s));
  }, [campaigns, q]);

  async function toggle(c: Camp) {
    const next = !(pending[c.id] ?? c.isAgencyOwned);
    setPending((p) => ({ ...p, [c.id]: next }));
    const r = await fetch(`/api/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isAgencyOwned: next }),
    });
    if (!r.ok) {
      setPending((p) => {
        const cp = { ...p };
        delete cp[c.id];
        return cp;
      });
      alert("עדכון נכשל");
      return;
    }
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-primary"
      >
        <span className="me-1.5">+</span> הוסף קמפיין
      </button>

      {open && (
        <div className="absolute end-0 z-30 mt-2 w-[360px] rounded-2xl border border-border bg-surface p-3 shadow-card-hover">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חפש קמפיין…"
            className="input mb-2"
          />
          <div className="max-h-72 overflow-y-auto">
            {filtered.map((c) => {
              const checked = pending[c.id] ?? c.isAgencyOwned;
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-elevated"
                >
                  <span className="min-w-0 truncate text-sm">{c.name}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c)}
                    className="h-4 w-4 cursor-pointer accent-[oklch(0.56_0.22_258)]"
                  />
                </label>
              );
            })}
            {!filtered.length && (
              <div className="px-2.5 py-6 text-center text-sm text-muted">לא נמצאו קמפיינים</div>
            )}
          </div>
          <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted">
            סמן קמפיינים ששייכים לסוכנות שלנו · מופיעים בדשבורד הסקירה
          </div>
        </div>
      )}
    </div>
  );
}

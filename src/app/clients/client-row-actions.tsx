"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientRowActions({
  clientId,
  clientName,
  endedAt,
  redirectAfterDelete,
}: {
  clientId: string;
  clientName: string;
  endedAt: string | null;
  redirectAfterDelete?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
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

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      alert("עדכון נכשל");
      return false;
    }
    return true;
  }

  async function onCloseProcess() {
    if (!date) return;
    const ok = await patch({ endedAt: new Date(date).toISOString() });
    if (ok) {
      setCloseOpen(false);
      setOpen(false);
      router.refresh();
    }
  }

  async function onReopen() {
    const ok = await patch({ endedAt: null });
    if (ok) {
      setOpen(false);
      router.refresh();
    }
  }

  async function onDelete() {
    const sure = confirm(
      `למחוק את "${clientName}" לצמיתות?\nכל הנתונים (פגישות, משימות, קמפיינים, דפי נחיתה, מסלולים) יימחקו.`,
    );
    if (!sure) return;
    setBusy(true);
    const r = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      alert("מחיקה נכשלה");
      return;
    }
    if (redirectAfterDelete) {
      router.push(redirectAfterDelete);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="פעולות"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-fg disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open && (
        <div className="absolute end-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-card-hover">
          {closeOpen ? (
            <div className="p-2">
              <div className="mb-2 text-sm font-medium">סיום תהליך</div>
              <label className="label mb-1 block">תאריך סיום</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
                max={new Date().toISOString().slice(0, 10)}
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCloseOpen(false)}
                  className="btn-ghost"
                  disabled={busy}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={onCloseProcess}
                  className="btn-primary"
                  disabled={busy || !date}
                >
                  סיום
                </button>
              </div>
            </div>
          ) : (
            <>
              {endedAt ? (
                <MenuItem onClick={onReopen} disabled={busy}>
                  <ArrowIcon className="h-4 w-4" />
                  החזר ללקוחות פעילים
                </MenuItem>
              ) : (
                <MenuItem onClick={() => setCloseOpen(true)} disabled={busy}>
                  <CheckIcon className="h-4 w-4" />
                  סיים תהליך (העבר לעבר)
                </MenuItem>
              )}
              <div className="my-1 h-px bg-border" />
              <MenuItem onClick={onDelete} danger disabled={busy}>
                <TrashIcon className="h-4 w-4" />
                מחק לצמיתות
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-right text-sm transition-colors disabled:opacity-50 ${
        danger
          ? "text-bad hover:bg-bad-soft"
          : "text-fg hover:bg-elevated"
      }`}
    >
      {children}
    </button>
  );
}

function CheckIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}
function ArrowIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M14 6 7 12l7 6" />
      <path d="M7 12h13" />
    </svg>
  );
}
function TrashIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

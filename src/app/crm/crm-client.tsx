"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ListRow = { id: string; name: string; leadCount: number; unreadCount: number; createdAt: string };

export default function CrmClient({ lists }: { lists: ListRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ id: string; webhookToken: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/crm/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      alert("יצירה נכשלה");
      return;
    }
    const data = await res.json();
    setCreated({ id: data.id, webhookToken: data.webhookToken });
    router.refresh();
  }

  function close() {
    setOpen(false);
    setName("");
    setCreated(null);
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">CRM</h1>
          <p className="text-sm text-muted">רשימות לידים שמגיעות מדפי נחיתה</p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm/metrics" className="rounded-md border px-3 py-1.5 text-sm">מדדים</Link>
          <Link href="/crm/settings" className="rounded-md border px-3 py-1.5 text-sm">הגדרות</Link>
          <button onClick={() => setOpen(true)} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white">
            + רשימה חדשה
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((l) => (
          <Link key={l.id} href={`/crm/${l.id}`} className="rounded-lg border p-4 hover:bg-border/20">
            <div className="flex items-center justify-between">
              <div className="font-medium">{l.name}</div>
              {l.unreadCount > 0 && (
                <span className="rounded-full bg-blue-500 px-2 text-xs text-white">{l.unreadCount}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-muted">{l.leadCount} לידים</div>
          </Link>
        ))}
        {lists.length === 0 && <div className="text-sm text-muted">אין רשימות עדיין. צור רשימה ראשונה.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={close}>
          <div className="w-full max-w-md rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
            {!created ? (
              <>
                <h2 className="mb-3 text-lg font-semibold">רשימה חדשה</h2>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="למשל: מגנט לידים"
                  className="w-full rounded-md border px-3 py-2"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={close} className="rounded-md border px-3 py-1.5 text-sm">ביטול</button>
                  <button
                    onClick={submit}
                    disabled={busy || !name.trim()}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    צור
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-lg font-semibold">הרשימה נוצרה</h2>
                <p className="mb-3 text-sm text-muted">העתק את ה-URL הזה והדבק אותו כיעד הוובהוק בדף הנחיתה:</p>
                <code className="block break-all rounded-md bg-gray-100 p-2 text-xs">
                  {origin}/api/webhooks/leads/{created.id}?token={created.webhookToken}
                </code>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${origin}/api/webhooks/leads/${created.id}?token=${created.webhookToken}`);
                    }}
                    className="rounded-md border px-3 py-1.5 text-sm"
                  >
                    העתק
                  </button>
                  <button onClick={close} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white">סגור</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

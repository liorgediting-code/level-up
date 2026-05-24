"use client";

import { useEffect, useState } from "react";

type Note = { id: string; body: string; createdAt: string };

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STORE_KEY = "notes-panel:open";

export default function NotesPanel(props: { scope: "client" | "funnel"; targetId: string }) {
  const [open, setOpen] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
    if (saved !== null) setOpen(saved === "1");
    else if (typeof window !== "undefined" && window.innerWidth < 768) setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORE_KEY, open ? "1" : "0");
    document.body.classList.toggle("with-notes-panel", open);
    return () => {
      document.body.classList.remove("with-notes-panel");
    };
  }, [open]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/notes?scope=${props.scope}&targetId=${encodeURIComponent(props.targetId)}`)
      .then((r) => r.json())
      .then((rows: Note[]) => {
        if (!cancel) {
          setNotes(Array.isArray(rows) ? rows : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [props.scope, props.targetId]);

  async function add() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: props.scope, targetId: props.targetId, body }),
    });
    if (res.ok) {
      const n: Note = await res.json();
      setNotes((prev) => [n, ...prev]);
    } else {
      setDraft(body);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את ההערה?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-md border border-l-0 border-border bg-surface px-2 py-3 text-xs"
        title="פתח הערות"
      >
        הערות »
      </button>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen w-80 flex-col border-l border-border bg-surface"
      dir="rtl"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">הערות</span>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-fg"
          title="סגור"
        >
          «
        </button>
      </div>
      <div className="border-b border-border p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add();
          }}
          placeholder="כתוב הערה…"
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
          <span>⌘/Ctrl + Enter לשליחה</span>
          <button
            onClick={add}
            disabled={!draft.trim()}
            className="rounded-md bg-accent px-2 py-1 text-white disabled:opacity-50"
          >
            שלח
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {loading ? (
          <div className="py-4 text-center text-xs text-muted">טוען…</div>
        ) : notes.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted">אין הערות עדיין.</div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="group rounded-md border border-border bg-bg p-2 text-sm">
              <div className="whitespace-pre-wrap break-words">{n.body}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>{fmtDateTime(n.createdAt)}</span>
                <button
                  onClick={() => remove(n.id)}
                  className="text-rose-500 opacity-0 hover:underline group-hover:opacity-100"
                >
                  מחק
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

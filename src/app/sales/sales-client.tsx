"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Folder = {
  id: string;
  name: string;
  clientId: string | null;
  sessionsCount: number;
  childrenCount: number;
};

type Session = {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  language: string;
  clientId: string | null;
  clientName: string | null;
  chunksCount: number;
};

type ClientLite = { id: string; name: string };

export default function SalesRecordingsClient({
  folderId,
  crumbs,
  folders,
  sessions,
  clients,
  initialQuery,
}: {
  folderId: string | null;
  crumbs: { id: string; name: string }[];
  folders: Folder[];
  sessions: Session[];
  clients: ClientLite[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [busy, setBusy] = useState(false);

  function go(next: { folder?: string | null; q?: string | null }) {
    const u = new URL(window.location.href);
    if ("folder" in next) {
      if (next.folder) u.searchParams.set("folder", next.folder);
      else u.searchParams.delete("folder");
    }
    if ("q" in next) {
      if (next.q) u.searchParams.set("q", next.q);
      else u.searchParams.delete("q");
    }
    router.push(u.pathname + (u.search || ""));
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/recordings/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: folderId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewFolderName("");
      setNewFolderOpen(false);
      router.refresh();
    } catch (e) {
      alert("שגיאה ביצירת תיקייה");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(id: string) {
    if (!confirm("למחוק את התיקייה? ההקלטות יישארו ויעברו לרמה העליונה.")) return;
    await fetch(`/api/recordings/folders/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function renameFolder(id: string, currentName: string) {
    const name = prompt("שם חדש לתיקייה:", currentName);
    if (!name || name === currentName) return;
    await fetch(`/api/recordings/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    router.refresh();
  }

  async function patchSession(id: string, body: Record<string, unknown>) {
    await fetch(`/api/recordings/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function deleteSession(id: string) {
    if (!confirm("למחוק את ההקלטה לצמיתות?")) return;
    await fetch(`/api/recordings/sessions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="text-xs text-muted">מכירות</div>
        <h1 className="text-2xl font-semibold">הקלטות פגישות</h1>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => go({ folder: null })}
            className={`rounded px-2 py-1 ${folderId == null ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-fg"}`}
          >
            שורש
          </button>
          {crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-muted">/</span>
              <button
                type="button"
                onClick={() => go({ folder: c.id })}
                className={`rounded px-2 py-1 ${c.id === folderId ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-fg"}`}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="חיפוש לפי שם"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go({ q: query || null }); }}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => setNewFolderOpen((v) => !v)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-bg"
          >
            + תיקייה
          </button>
        </div>
      </div>

      {newFolderOpen && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createFolder(); }}
            placeholder="שם התיקייה"
            className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={busy || !newFolderName.trim()}
            onClick={createFolder}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            צור
          </button>
          <button
            type="button"
            onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            ביטול
          </button>
        </div>
      )}

      {/* Folder grid */}
      {folders.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">תיקיות</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {folders.map((f) => (
              <div key={f.id} className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-accent">
                <button type="button" onClick={() => go({ folder: f.id })} className="flex flex-1 items-center gap-3 text-right">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent-ink">📁</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block text-[11px] text-muted">{f.sessionsCount} הקלטות · {f.childrenCount} תיקיות</span>
                  </span>
                </button>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button type="button" title="שנה שם" onClick={() => renameFolder(f.id, f.name)} className="rounded p-1 text-muted hover:bg-bg">✎</button>
                  <button type="button" title="מחק" onClick={() => deleteFolder(f.id)} className="rounded p-1 text-rose-500 hover:bg-bg">×</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sessions */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">הקלטות</h2>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
            אין הקלטות בתיקייה זו עדיין. הפעל את התוסף בפגישה כדי להתחיל לתמלל.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                <Link href={`/sales/recordings/${s.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium hover:text-accent">
                    {s.title || `הקלטה ${new Date(s.startedAt).toLocaleString("he-IL")}`}
                  </div>
                  <div className="text-[11px] text-muted">
                    {new Date(s.startedAt).toLocaleString("he-IL")} · {s.chunksCount} שורות
                    {s.clientName ? ` · ${s.clientName}` : ""}
                  </div>
                </Link>

                <select
                  value={s.clientId ?? ""}
                  onChange={(e) => patchSession(s.id, { clientId: e.target.value || null })}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
                  title="שייך ללקוח"
                >
                  <option value="">ללא לקוח</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <MoveMenu sessionId={s.id} currentFolderId={folderId} onMove={(fid) => patchSession(s.id, { folderId: fid })} />

                <button
                  type="button"
                  title="שנה שם"
                  onClick={async () => {
                    const t = prompt("שם חדש:", s.title ?? "");
                    if (t === null) return;
                    await patchSession(s.id, { title: t.trim() || null });
                  }}
                  className="rounded p-1 text-muted hover:text-fg"
                >✎</button>
                <button
                  type="button"
                  title="מחק"
                  onClick={() => deleteSession(s.id)}
                  className="rounded p-1 text-rose-500 hover:text-rose-600"
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MoveMenu({
  sessionId,
  currentFolderId,
  onMove,
}: {
  sessionId: string;
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);

  async function loadAll() {
    if (list) return;
    const r = await fetch("/api/recordings/folders");
    const j = await r.json();
    setList(j.folders.map((f: any) => ({ id: f.id, name: f.name })));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={async () => { await loadAll(); setOpen((v) => !v); }}
        className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
        title="העבר לתיקייה"
      >
        העבר ↪
      </button>
      {open && (
        <div className="absolute end-0 z-30 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-border bg-surface p-1 shadow-card">
          <button
            type="button"
            onClick={() => { onMove(null); setOpen(false); }}
            className={`block w-full rounded px-2 py-1 text-right text-xs hover:bg-bg ${currentFolderId == null ? "bg-bg" : ""}`}
          >
            (שורש)
          </button>
          {(list ?? []).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { onMove(f.id); setOpen(false); }}
              className={`block w-full rounded px-2 py-1 text-right text-xs hover:bg-bg ${currentFolderId === f.id ? "bg-bg" : ""}`}
            >
              {f.name}
            </button>
          ))}
          {(list ?? []).length === 0 && (
            <div className="px-2 py-2 text-center text-[11px] text-muted">אין תיקיות עדיין</div>
          )}
        </div>
      )}
    </div>
  );
}

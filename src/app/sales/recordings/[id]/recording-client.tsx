"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Chunk = { id: string; text: string; startMs: number; speaker: string };
type Lite = { id: string; name: string };

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function RecordingClient(props: {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  language: string;
  clientId: string | null;
  folderId: string | null;
  summary: string | null;
  transcribeStatus: string;
  transcribeError: string | null;
  clients: Lite[];
  folders: Lite[];
  chunks: Chunk[];
  hasMic?: boolean;
  hasTab?: boolean;
  hasLegacy?: boolean;
}) {
  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    pending: { label: "ממתין להעלאת אודיו", cls: "bg-amber-500/15 text-amber-500" },
    transcribing: { label: "מתמלל…", cls: "bg-blue-500/15 text-blue-500" },
    ready: { label: "תמלול עברי מוכן", cls: "bg-emerald-500/15 text-emerald-500" },
    failed: { label: "שגיאה בתמלול", cls: "bg-rose-500/15 text-rose-500" },
  };
  const s = STATUS_LABEL[props.transcribeStatus] ?? STATUS_LABEL.pending;
  const router = useRouter();
  const [title, setTitle] = useState(props.title ?? "");
  const [clientId, setClientId] = useState(props.clientId ?? "");
  const [folderId, setFolderId] = useState(props.folderId ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeNote, setAnalyzeNote] = useState<string | null>(null);

  async function save() {
    await fetch(`/api/recordings/sessions/${props.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || null,
        clientId: clientId || null,
        folderId: folderId || null,
      }),
    });
    router.refresh();
  }

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeNote(null);
    try {
      const res = await fetch(`/api/recordings/sessions/${props.id}/analyze`, { method: "POST" });
      if (res.status === 501) {
        setAnalyzeNote("ניתוח AI עדיין לא מוגדר. הוסף הוראות כדי להפעיל.");
      } else if (!res.ok) {
        setAnalyzeNote("שגיאה בניתוח");
      } else {
        router.refresh();
      }
    } finally {
      setAnalyzing(false);
    }
  }

  const [retranscribing, setRetranscribing] = useState(false);
  async function retranscribe() {
    setRetranscribing(true);
    try {
      const res = await fetch(`/api/sessions/${props.id}/retranscribe`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        alert("שגיאה: " + t.slice(0, 300));
      }
      router.refresh();
    } finally {
      setRetranscribing(false);
    }
  }

  async function copyTranscript() {
    const txt = props.chunks
      .map((c) => `${c.speaker === "user" ? "אני" : "משתתפים"}: ${c.text}`)
      .join("\n");
    await navigator.clipboard.writeText(txt);
    setAnalyzeNote("התמלול הועתק");
    setTimeout(() => setAnalyzeNote(null), 2000);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="שם ההקלטה"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-lg font-semibold"
          />
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
          <button onClick={save} className="rounded-md bg-accent px-3 py-2 text-sm text-white">שמור</button>
        </div>
        {props.transcribeStatus === "failed" && props.transcribeError && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-500">
            {props.transcribeError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
          <div>
            <div className="text-[11px] text-muted">תאריך</div>
            <div>{new Date(props.startedAt).toLocaleString("he-IL")}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">משך</div>
            <div>{props.durationMs > 0 ? fmtClock(props.durationMs) : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">לקוח</div>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm"
            >
              <option value="">ללא לקוח</option>
              {props.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] text-muted">תיקייה</div>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm"
            >
              <option value="">(שורש)</option>
              {props.folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {(props.hasMic || props.hasTab || props.hasLegacy) && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">השמעת הקלטה</h2>
          {props.hasMic && (
            <div className="space-y-1">
              <div className="text-[11px] text-muted">המיקרופון שלי</div>
              <audio
                controls
                preload="metadata"
                src={`/api/sessions/${props.id}/audio?track=mic`}
                className="w-full"
              />
              <div className="text-[11px]">
                <a href={`/api/sessions/${props.id}/audio?track=mic`} download={`${props.id}-mic.wav`} className="text-accent-ink hover:underline">
                  הורד
                </a>
              </div>
            </div>
          )}
          {props.hasTab && (
            <div className="space-y-1">
              <div className="text-[11px] text-muted">משתתפים (אודיו מהטאב)</div>
              <audio
                controls
                preload="metadata"
                src={`/api/sessions/${props.id}/audio?track=tab`}
                className="w-full"
              />
              <div className="text-[11px]">
                <a href={`/api/sessions/${props.id}/audio?track=tab`} download={`${props.id}-tab.wav`} className="text-accent-ink hover:underline">
                  הורד
                </a>
              </div>
            </div>
          )}
          {props.hasLegacy && !props.hasMic && !props.hasTab && (
            <div className="space-y-1">
              <div className="text-[11px] text-muted">הקלטה</div>
              <audio
                controls
                preload="metadata"
                src={`/api/sessions/${props.id}/audio`}
                className="w-full"
              />
              <div className="text-[11px]">
                <a href={`/api/sessions/${props.id}/audio`} download className="text-accent-ink hover:underline">
                  הורד
                </a>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">ניתוח AI</h2>
          <div className="flex items-center gap-2">
            <button onClick={copyTranscript} className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs">העתק תמלול</button>
            <button
              onClick={analyze}
              disabled={analyzing}
              className="rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {analyzing ? "מנתח…" : "נתח עם AI"}
            </button>
          </div>
        </div>
        {props.summary ? (
          <div className="whitespace-pre-wrap rounded-md bg-bg p-3 text-sm">{props.summary}</div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted">
            עדיין לא בוצע ניתוח. ההוראות יתווספו בהמשך. {analyzeNote && <span className="text-amber-500">— {analyzeNote}</span>}
          </div>
        )}
        {props.summary && analyzeNote && (
          <div className="text-xs text-amber-500">{analyzeNote}</div>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">תמלול מלא ({props.chunks.length} שורות)</h2>
          <button
            onClick={retranscribe}
            disabled={retranscribing}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs disabled:opacity-50"
            title="הרץ שוב את התמלול על הקלטת האודיו השמורה"
          >
            {retranscribing ? "מתמלל…" : "תמלל מחדש"}
          </button>
        </div>
        {props.chunks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted">
            אין תמלול עדיין.
          </div>
        ) : (
          <ol className="space-y-1.5 text-sm leading-relaxed" dir="rtl">
            {props.chunks.map((c) => {
              const isUser = c.speaker === "user";
              return (
                <li key={c.id} className="flex items-baseline gap-3">
                  <span className="shrink-0 font-mono text-[11px] text-muted num">
                    {fmtClock(c.startMs)}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      isUser
                        ? "bg-accent-soft text-accent-ink"
                        : "bg-emerald-500/15 text-emerald-500"
                    }`}
                  >
                    {isUser ? "אני" : "משתתפים"}
                  </span>
                  <span className="min-w-0">{c.text}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

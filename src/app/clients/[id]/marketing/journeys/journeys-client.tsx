"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  KIND_BADGE_COLOR, KIND_LABEL, STAGE_LABEL,
  type JourneyKind, type StageKind, type StageMode,
} from "@/lib/journeys/templates";

export type JourneyView = {
  id: string;
  kind: JourneyKind;
  videoCount: number;
  status: "active" | "completed";
  currentStageIndex: number;
  stages: Array<{
    id: string;
    index: number;
    kind: StageKind;
    mode: StageMode;
    status: "locked" | "active" | "done";
    docLink: string | null;
    filmingDate: string | null;
    videoItems: Array<{ index: number; done: boolean }>;
  }>;
};

export default function JourneysClient({ clientId, journeys }: { clientId: string; journeys: JourneyView[] }) {
  const router = useRouter();
  const [addKind, setAddKind] = useState<JourneyKind | null>(null);

  const hasOrganic = journeys.some((j) => j.kind === "organic");
  const hasPaid = journeys.some((j) => j.kind === "paid");

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href={`/clients/${clientId}/marketing/tasks`} className="btn-ghost text-xs">+ משימה חופשית</Link>
      </div>
      {journeys.length === 0 && (
        <div className="card text-center">
          <p className="mb-4 text-sm text-muted">עדיין לא הוגדר מסלול שיווק ללקוח.</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => setAddKind("organic")} className="btn-primary">+ הוסף מסלול אורגני</button>
            <button onClick={() => setAddKind("paid")} className="btn-primary">+ הוסף מסלול ממומן</button>
          </div>
        </div>
      )}

      {journeys.map((j) => (
        <JourneyCard key={j.id} clientId={clientId} journey={j} onChanged={() => router.refresh()} />
      ))}

      {journeys.length > 0 && (!hasOrganic || !hasPaid) && (
        <div className="flex justify-center gap-2">
          {!hasOrganic && <button onClick={() => setAddKind("organic")} className="btn-ghost">+ הוסף מסלול אורגני</button>}
          {!hasPaid && <button onClick={() => setAddKind("paid")} className="btn-ghost">+ הוסף מסלול ממומן</button>}
        </div>
      )}

      {addKind && (
        <AddJourneyDialog
          clientId={clientId}
          kind={addKind}
          onClose={() => setAddKind(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function AddJourneyDialog({
  clientId, kind, onClose, onCreated,
}: { clientId: string; kind: JourneyKind; onClose: () => void; onCreated: () => void }) {
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) { alert("חייב להיות מספר ≥ 1"); return; }
    setBusy(true);
    const r = await fetch(`/api/clients/${clientId}/journeys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, videoCount: n }),
    });
    setBusy(false);
    if (!r.ok) { alert(await r.text()); return; }
    onClose();
    onCreated();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">הוסף מסלול {KIND_LABEL[kind]}</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">{kind === "organic" ? "כמות סרטונים מתוכננת" : "כמות מודעות מתוכננת"}</span>
          <input
            className="input w-full"
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            autoFocus
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">ביטול</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? "יוצר…" : "צור מסלול"}</button>
        </div>
      </div>
    </div>
  );
}

function JourneyCard({
  clientId: _clientId, journey, onChanged,
}: { clientId: string; journey: JourneyView; onChanged: () => void }) {
  const activeStage = journey.stages.find((s) => s.status === "active") ?? null;
  const total = journey.stages.length;
  const doneCount = journey.stages.filter((s) => s.status === "done").length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const kindLabel = KIND_LABEL[journey.kind];

  async function del() {
    if (!confirm(`למחוק את המסלול ${kindLabel}?`)) return;
    await fetch(`/api/journeys/${journey.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">מסלול {kindLabel} · {journey.videoCount} {journey.kind === "organic" ? "סרטונים" : "מודעות"}</h3>
        <button onClick={del} className="text-sm text-muted hover:text-bad">מחק</button>
      </div>

      {journey.status === "completed" && (
        <div className="rounded-md bg-good/15 px-3 py-2 text-sm text-good">סיימת את כל המשימות ללקוח</div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2">
          {journey.stages.map((s) => (
            <div key={s.id} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                  s.status === "done" ? "border-good bg-good/15 text-good" :
                  s.status === "active" ? "border-accent text-accent" :
                  "border-border text-muted"
                }`}
              >
                {s.status === "done" ? "✓" : s.index + 1}
              </div>
              <div className={`text-xs ${s.status === "locked" ? "text-muted" : ""}`}>{STAGE_LABEL[s.kind]}</div>
              {s.index < journey.stages.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {activeStage && (
        <ActiveStagePanel
          journeyId={journey.id}
          journeyKind={journey.kind}
          stage={activeStage}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function ActiveStagePanel({
  journeyId, journeyKind, stage, onChanged,
}: {
  journeyId: string;
  journeyKind: JourneyKind;
  stage: JourneyView["stages"][number];
  onChanged: () => void;
}) {
  const [docLink, setDocLink] = useState(stage.docLink ?? "");
  const [filmingDate, setFilmingDate] = useState(stage.filmingDate ? stage.filmingDate.slice(0, 10) : "");

  const isFilming = stage.kind === "filming" || stage.kind === "ad_filming";
  const filmingPassed = stage.filmingDate ? new Date(stage.filmingDate) <= new Date() : false;

  async function patchStage(body: Record<string, unknown>) {
    const r = await fetch(`/api/journeys/${journeyId}/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "שגיאה"); return false; }
    onChanged();
    return true;
  }

  async function saveDocLink() {
    if ((stage.docLink ?? "") === docLink) return;
    await patchStage({ docLink: docLink.trim() === "" ? null : docLink.trim() });
  }
  async function saveFilmingDate() {
    const iso = filmingDate ? new Date(`${filmingDate}T00:00:00`).toISOString() : null;
    await patchStage({ filmingDate: iso });
  }
  async function markDone() {
    await patchStage({ markDone: true });
  }
  async function toggleVideo(index: number, done: boolean) {
    const r = await fetch(`/api/journeys/${journeyId}/stages/${stage.id}/videos/${index}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "שגיאה"); return; }
    onChanged();
  }

  const linkPlaceholder =
    stage.kind === "writing" ? "לינק לדוק עם התסריטים" :
    stage.kind === "editing" ? "לינק לתיקייה עם הסרטונים הערוכים" :
    stage.kind === "strategy" ? "לינק לדוק האסטרטגיה" :
    stage.kind === "ads_writing" ? "לינק לדוק עם המודעות" :
    stage.kind === "creative" ? "לינק לתיקיית הקריאייטיב" :
    "לינק";

  return (
    <div
      className="rounded-md border-2 p-4"
      style={{ borderColor: KIND_BADGE_COLOR[journeyKind] }}
    >
      <div className="mb-3 text-sm font-medium">{STAGE_LABEL[stage.kind]}</div>

      {!isFilming && (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">לינק</span>
          <input
            className="input w-full"
            dir="ltr"
            value={docLink}
            onChange={(e) => setDocLink(e.target.value)}
            onBlur={saveDocLink}
            placeholder={linkPlaceholder}
          />
        </label>
      )}

      {isFilming && (
        <div className="mb-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">תאריך צילום</span>
            <input
              className="input w-full"
              type="date"
              value={filmingDate}
              onChange={(e) => setFilmingDate(e.target.value)}
              onBlur={saveFilmingDate}
            />
          </label>
        </div>
      )}

      {stage.mode === "per_video" && (
        <div className="mb-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted">סרטונים</span>
            <span className="text-xs text-muted">
              {stage.videoItems.filter((v) => v.done).length} / {stage.videoItems.length} הושלמו
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {stage.videoItems.map((v) => (
              <label key={v.index} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={v.done}
                  onChange={(e) => toggleVideo(v.index, e.target.checked)}
                />
                סרטון {v.index}
              </label>
            ))}
          </div>
        </div>
      )}

      {stage.mode === "single" && (
        <div className="flex justify-end">
          <button
            onClick={markDone}
            disabled={isFilming && !filmingPassed}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            title={isFilming && !filmingPassed ? "תאריך הצילום עדיין לא הגיע" : ""}
          >
            סמן בוצע
          </button>
        </div>
      )}
    </div>
  );
}

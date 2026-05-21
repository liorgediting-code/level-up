"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Asset = {
  id: string;
  kind: string;
  label: string;
  text: string | null;
  mimeType: string | null;
  fileUrl: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  creative_image: "תמונת מודעה",
  creative_video: "וידאו של מודעה",
  brief: "בריף / אסטרטגיה",
  note: "הערה",
};

export default function MaterialsClient({
  clientId,
  assets,
}: {
  clientId: string;
  assets: Asset[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState("creative_image");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsFile = kind === "creative_image" || kind === "creative_video";
  const allowsText = kind === "brief" || kind === "note";
  const acceptType =
    kind === "creative_image" ? "image/*" : kind === "creative_video" ? "video/*" : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("label", label || KIND_LABEL[kind]);
    if (file) fd.set("file", file);
    if (text) fd.set("text", text);
    const r = await fetch(`/api/clients/${clientId}/assets`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "שגיאה בהעלאה");
      return;
    }
    setLabel("");
    setText("");
    setFile(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הפריט?")) return;
    await fetch(`/api/clients/${clientId}/assets?assetId=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const grouped = {
    creative_image: assets.filter((a) => a.kind === "creative_image"),
    creative_video: assets.filter((a) => a.kind === "creative_video"),
    brief: assets.filter((a) => a.kind === "brief"),
    note: assets.filter((a) => a.kind === "note"),
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="mb-3 font-semibold">הוסף חומר</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`btn-ghost ${kind === k ? "border-accent text-accent" : ""}`}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder={`כותרת (אופציונלי, ברירת מחדל: ${KIND_LABEL[kind]})`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          {needsFile && (
            <input
              type="file"
              accept={acceptType}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          )}
          {allowsText && (
            <textarea
              className="input min-h-[120px]"
              placeholder={kind === "brief" ? "תיאור אסטרטגיה, קהל יעד, פוזיציה תחרותית, נקודות מפתח…" : "הערה חופשית — הקשר עסקי, היסטוריה, מה חשוב לדעת"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          {kind === "brief" && (
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          )}
          {err && <div className="text-sm text-bad">{err}</div>}
          <button className="btn-primary" disabled={busy}>
            {busy ? "שומר…" : "שמור"}
          </button>
        </form>
      </div>

      {(["creative_image", "creative_video", "brief", "note"] as const).map((k) => (
        <Section
          key={k}
          title={KIND_LABEL[k]}
          assets={grouped[k]}
          onDelete={remove}
        />
      ))}
    </div>
  );
}

function Section({
  title,
  assets,
  onDelete,
}: {
  title: string;
  assets: Asset[];
  onDelete: (id: string) => void;
}) {
  if (!assets.length) return null;
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => (
          <div key={a.id} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{a.label}</div>
              <button onClick={() => onDelete(a.id)} className="text-xs text-bad hover:underline">
                מחק
              </button>
            </div>
            {a.fileUrl && a.kind === "creative_image" && (
              <img src={a.fileUrl} alt={a.label} className="mb-2 max-h-48 w-full rounded object-contain bg-black/30" />
            )}
            {a.fileUrl && a.kind === "creative_video" && (
              <video src={a.fileUrl} controls className="mb-2 max-h-48 w-full rounded bg-black/30" />
            )}
            {a.fileUrl && a.kind === "brief" && (
              <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-accent text-xs hover:underline" dir="ltr">
                {a.fileUrl.split("/").pop()}
              </a>
            )}
            {a.text && (
              <p className="whitespace-pre-wrap text-xs text-muted">{a.text}</p>
            )}
            <div className="mt-2 text-xs text-muted">
              {new Date(a.createdAt).toLocaleDateString("he-IL")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

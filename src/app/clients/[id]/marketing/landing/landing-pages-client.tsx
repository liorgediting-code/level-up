"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LP = {
  id: string;
  label: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotUrl: string | null;
  createdAt: string;
};

const SOURCE_LABEL: Record<string, string> = {
  url: "מ-URL",
  html: "קובץ HTML",
  image: "תמונה",
};

export default function LandingPagesClient({
  clientId,
  pages,
}: {
  clientId: string;
  pages: LP[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/landing-pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceType: "url", clientId, label: label || url, url }),
    });
    setBusy(false);
    if (r.ok) {
      setUrl("");
      setLabel("");
      router.refresh();
    } else setErr(await r.text());
  }
  async function submitFile(file: File) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("label", label || file.name);
    fd.set("file", file);
    const r = await fetch("/api/landing-pages", { method: "POST", body: fd });
    setBusy(false);
    if (r.ok) {
      setLabel("");
      router.refresh();
    } else setErr(await r.text());
  }
  async function del(id: string) {
    if (!confirm("למחוק את דף הנחיתה?")) return;
    await fetch(`/api/landing-pages/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">הוסף דף נחיתה</h2>
          <div className="flex gap-1 text-xs">
            <button
              className={`btn-ghost ${mode === "url" ? "border-accent text-accent" : ""}`}
              onClick={() => setMode("url")}
            >
              כתובת URL
            </button>
            <button
              className={`btn-ghost ${mode === "file" ? "border-accent text-accent" : ""}`}
              onClick={() => setMode("file")}
            >
              העלאת HTML / תמונה / PDF
            </button>
          </div>
        </div>
        <form onSubmit={submitUrl} className="flex flex-col gap-2 md:flex-row">
          <input
            className="input md:max-w-xs"
            placeholder="תווית (אופציונלי)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          {mode === "url" ? (
            <>
              <input
                className="input flex-1"
                placeholder="https://example.com/lp"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                dir="ltr"
              />
              <button disabled={busy} className="btn-primary whitespace-nowrap">
                {busy ? "מושך…" : "הוסף מ-URL"}
              </button>
            </>
          ) : (
            <input
              type="file"
              accept=".html,.htm,.pdf,image/*"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && submitFile(e.target.files[0])}
              className="input flex-1"
            />
          )}
        </form>
        {err && <div className="mt-2 text-sm text-bad">{err}</div>}
        <p className="mt-3 text-xs text-muted">
          URL: השרת ישלוף את הדף בדפדפן Playwright וישמור צילום מסך + HTML. תמונה: תשמר כצילום מסך ישיר. שני המקורות יוזנו ל-AI בעת ניתוח.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">דפי נחיתה קיימים</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((lp) => (
            <div key={lp.id} className="overflow-hidden rounded-lg border border-border bg-bg">
              {lp.screenshotUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={lp.screenshotUrl} alt={lp.label} className="h-48 w-full object-cover object-top" />
              ) : (
                <div className="flex h-48 items-center justify-center text-xs text-muted">אין תצוגה מקדימה</div>
              )}
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">{lp.label}</div>
                  <button onClick={() => del(lp.id)} className="text-xs text-muted hover:text-bad">
                    מחק
                  </button>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {SOURCE_LABEL[lp.sourceType] ?? lp.sourceType}
                  {lp.sourceUrl ? ` · ${safeHost(lp.sourceUrl)}` : ""}
                </div>
                {lp.sourceUrl && (
                  <a
                    href={lp.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block truncate text-xs text-accent hover:underline"
                    dir="ltr"
                  >
                    {lp.sourceUrl}
                  </a>
                )}
              </div>
            </div>
          ))}
          {!pages.length && (
            <div className="col-span-full text-sm text-muted">אין עדיין דפי נחיתה.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeHost(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

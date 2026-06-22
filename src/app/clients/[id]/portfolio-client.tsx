"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { summarizeClientFinance } from "@/lib/finance";
import { coachingStatus } from "@/lib/clients/coaching";

type LinkRow = { id: string; label: string; url: string };
type Payment = { id: string; type: string; amount: number; currency: string; note: string | null; occurredAt: string };
type LP = { id: string; label: string; sourceType: string; sourceUrl: string | null; screenshotUrl: string | null; createdAt: string };
type Run = { id: string; status: string; startedAt: string; finishedAt: string | null; model: string };

const PAYMENT_LABEL: Record<string, string> = {
  closed: "נסגר",
  paid: "שולם",
  owed: "להמתנה",
  expense: "הוצאה",
  lior_paid: "שולם לליאור",
};

const fmtIls = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });
const STATUS_LABEL: Record<string, string> = {
  done: "הושלם",
  error: "שגיאה",
  running: "רץ",
};
const SOURCE_LABEL: Record<string, string> = {
  url: "כתובת URL",
  html: "קובץ HTML",
  image: "תמונה",
};

export default function ClientPortfolio(props: {
  clientId: string;
  description: string | null;
  links: LinkRow[];
  liorRevenueSharePct: number | null;
  liorExpenseSharePct: number | null;
  payments: Payment[];
  landingPages: LP[];
  analysisRuns: Run[];
  createdAt: string;
  coachingMonths: number | null;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <DescriptionEditor clientId={props.clientId} initial={props.description ?? ""} onSaved={refresh} />
      <CoachingBox clientId={props.clientId} createdAt={props.createdAt} coachingMonths={props.coachingMonths} onChange={refresh} />
      <LinksBox clientId={props.clientId} links={props.links} onChange={refresh} />
      <PaymentsBox clientId={props.clientId} payments={props.payments} onChange={refresh} />
      <ExpensesBox clientId={props.clientId} payments={props.payments} onChange={refresh} />
      <LiorBox
        clientId={props.clientId}
        payments={props.payments}
        liorRevenueSharePct={props.liorRevenueSharePct}
        liorExpenseSharePct={props.liorExpenseSharePct}
        onChange={refresh}
      />
      <LandingPagesBox clientId={props.clientId} pages={props.landingPages} onChange={refresh} />
      <AnalysisHistory clientId={props.clientId} runs={props.analysisRuns} />
    </div>
  );
}

function DescriptionEditor({ clientId, initial, onSaved }: { clientId: string; initial: string; onSaved: () => void }) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: val }),
    });
    setSaving(false);
    onSaved();
  }
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">תיאור / הצעה</h2>
      <textarea className="input min-h-[120px]" value={val} onChange={(e) => setVal(e.target.value)} placeholder="מה הלקוח מוכר? מי קהל היעד? מה ההצעה?" />
      <div className="mt-3 flex justify-start">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "שומר…" : "שמור"}</button>
      </div>
    </div>
  );
}

function LinksBox({ clientId, links, onChange }: { clientId: string; links: LinkRow[]; onChange: () => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  async function add() {
    if (!label || !url) return;
    const r = await fetch(`/api/clients/${clientId}/links`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, url }) });
    if (r.ok) { setLabel(""); setUrl(""); onChange(); }
  }
  async function del(id: string) {
    await fetch(`/api/links/${id}`, { method: "DELETE" });
    onChange();
  }
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">קישורים</h2>
      <ul className="mb-3 space-y-2">
        {links.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
            <a className="hover:text-accent" target="_blank" rel="noreferrer" href={l.url}>{l.label}</a>
            <button onClick={() => del(l.id)} className="text-xs text-muted hover:text-bad">הסר</button>
          </li>
        ))}
        {!links.length && <li className="text-sm text-muted">אין עדיין קישורים.</li>}
      </ul>
      <div className="flex gap-2">
        <input className="input" placeholder="תווית" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" />
        <button onClick={add} className="btn-ghost whitespace-nowrap">הוסף קישור</button>
      </div>
    </div>
  );
}

async function addPayment(clientId: string, type: string, amount: string, note: string) {
  const n = Number(amount);
  if (!isFinite(n)) return false;
  const r = await fetch(`/api/clients/${clientId}/payments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, amount: n, note, currency: "ILS" }),
  });
  return r.ok;
}

async function delPayment(id: string) {
  await fetch(`/api/payments/${id}`, { method: "DELETE" });
}

function PaymentRow({ p, onDelete }: { p: Payment; onDelete: (id: string) => void }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span><span className="rounded bg-border/60 px-1.5 py-0.5 text-xs">{PAYMENT_LABEL[p.type] ?? p.type}</span> {fmtIls.format(p.amount)} {p.note && <span className="text-muted">— {p.note}</span>}</span>
      <button onClick={() => onDelete(p.id)} className="text-xs text-muted hover:text-bad">הסר</button>
    </li>
  );
}

function PaymentsBox({ clientId, payments, onChange }: { clientId: string; payments: Payment[]; onChange: () => void }) {
  const [type, setType] = useState<"closed" | "paid" | "owed">("closed");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const rows = payments.filter((p) => p.type === "closed" || p.type === "paid" || p.type === "owed");
  async function add() {
    if (await addPayment(clientId, type, amount, note)) { setAmount(""); setNote(""); onChange(); }
  }
  async function del(id: string) { await delPayment(id); onChange(); }
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">תשלומים</h2>
      <ul className="mb-3 max-h-48 space-y-1 overflow-auto text-sm">
        {rows.map((p) => <PaymentRow key={p.id} p={p} onDelete={del} />)}
        {!rows.length && <li className="text-muted">לא נרשמו תשלומים.</li>}
      </ul>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as "closed" | "paid" | "owed")}>
          <option value="closed">נסגר</option>
          <option value="paid">שולם</option>
          <option value="owed">להמתנה</option>
        </select>
        <input className="input" type="number" inputMode="decimal" placeholder="סכום (₪)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input col-span-2" placeholder="הערה (אופציונלי)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-2 flex justify-start">
        <button onClick={add} className="btn-ghost">רשום תשלום</button>
      </div>
    </div>
  );
}

function ExpensesBox({ clientId, payments, onChange }: { clientId: string; payments: Payment[]; onChange: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const rows = payments.filter((p) => p.type === "expense");
  const total = rows.reduce((s, p) => s + p.amount, 0);
  async function add() {
    if (await addPayment(clientId, "expense", amount, note)) { setAmount(""); setNote(""); onChange(); }
  }
  async function del(id: string) { await delPayment(id); onChange(); }
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">הוצאות</h2>
        <span className="text-sm text-muted">סה״כ <span className="font-semibold text-fg">{fmtIls.format(total)}</span></span>
      </div>
      <ul className="mb-3 max-h-48 space-y-1 overflow-auto text-sm">
        {rows.map((p) => <PaymentRow key={p.id} p={p} onDelete={del} />)}
        {!rows.length && <li className="text-muted">לא נרשמו הוצאות.</li>}
      </ul>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input className="input" type="number" inputMode="decimal" placeholder="סכום (₪)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input col-span-2 md:col-span-3" placeholder="על מה? (אופציונלי)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-2 flex justify-start">
        <button onClick={add} className="btn-ghost">רשום הוצאה</button>
      </div>
    </div>
  );
}

function CoachingBox({ clientId, createdAt, coachingMonths, onChange }: { clientId: string; createdAt: string; coachingMonths: number | null; onChange: () => void }) {
  const [months, setMonths] = useState(coachingMonths == null ? "" : String(coachingMonths));
  const [saving, setSaving] = useState(false);

  async function save() {
    const raw = months.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      alert("מספר חודשים לא תקין");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coachingMonths: value }),
    });
    setSaving(false);
    if (!res.ok) { alert("שמירת חודשי הליווי נכשלה"); return; }
    onChange();
  }

  const cs = coachingMonths != null ? coachingStatus(new Date(createdAt), coachingMonths) : null;
  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">ליווי</h2>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          חודשי ליווי
          <input className="input" type="number" inputMode="numeric" min={0} placeholder="מס׳ חודשים" value={months} onChange={(e) => setMonths(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button onClick={save} disabled={saving} className="btn-primary w-full">{saving ? "שומר…" : "שמור"}</button>
        </div>
      </div>
      {cs && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>תחילת ליווי: {fmt(new Date(createdAt))} · {coachingMonths} חודשים · מסתיים {fmt(cs.endsAt)}</span>
          {cs.finished ? (
            <span className="rounded px-1.5 py-0.5 text-bad ring-1 ring-bad/40">הסתיים</span>
          ) : (
            <span className="rounded px-1.5 py-0.5 text-good ring-1 ring-good/40">נותרו {cs.monthsLeft} חודשים</span>
          )}
        </div>
      )}
    </div>
  );
}

function LiorBox({
  clientId,
  payments,
  liorRevenueSharePct,
  liorExpenseSharePct,
  onChange,
}: {
  clientId: string;
  payments: Payment[];
  liorRevenueSharePct: number | null;
  liorExpenseSharePct: number | null;
  onChange: () => void;
}) {
  const [revPct, setRevPct] = useState(liorRevenueSharePct == null ? "" : String(liorRevenueSharePct));
  const [expPct, setExpPct] = useState(liorExpenseSharePct == null ? "" : String(liorExpenseSharePct));
  const [savingPct, setSavingPct] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const rows = payments.filter((p) => p.type === "lior_paid");
  const fin = summarizeClientFinance(payments, liorRevenueSharePct, liorExpenseSharePct);

  async function savePct() {
    setSavingPct(true);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        liorRevenueSharePct: revPct.trim() === "" ? null : Number(revPct),
        liorExpenseSharePct: expPct.trim() === "" ? null : Number(expPct),
      }),
    });
    setSavingPct(false);
    onChange();
  }
  async function addPaid() {
    if (await addPayment(clientId, "lior_paid", amount, note)) { setAmount(""); setNote(""); onChange(); }
  }
  async function del(id: string) { await delPayment(id); onChange(); }

  return (
    <div className="card md:col-span-2">
      <h2 className="mb-3 font-semibold">חלוקת רווח עם ליאור</h2>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          אחוז מההכנסה
          <input className="input" type="number" inputMode="decimal" min={0} max={100} placeholder="%" value={revPct} onChange={(e) => setRevPct(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          השתתפות בהוצאות
          <input className="input" type="number" inputMode="decimal" min={0} max={100} placeholder="%" value={expPct} onChange={(e) => setExpPct(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button onClick={savePct} disabled={savingPct} className="btn-primary w-full">{savingPct ? "שומר…" : "שמור אחוזים"}</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-bg p-3 text-sm md:grid-cols-4">
        <Stat label="חלק מההכנסה" value={fmtIls.format(fin.liorRevenueShare)} sub={`${liorRevenueSharePct ?? 0}% · שולם ${fmtIls.format(fin.paid)}`} />
        <Stat label="השתתפות בהוצאות" value={`− ${fmtIls.format(fin.liorExpenseShare)}`} sub={`${liorExpenseSharePct ?? 0}% · הוצאות ${fmtIls.format(fin.expenses)}`} />
        <Stat label="מגיע לליאור" value={fmtIls.format(fin.liorOwed)} sub={`שולם ${fmtIls.format(fin.liorPaid)}`} />
        <Stat label="נותר לתשלום" value={fmtIls.format(fin.liorToPay)} strong />
      </div>

      <ul className="mb-3 max-h-40 space-y-1 overflow-auto text-sm">
        {rows.map((p) => <PaymentRow key={p.id} p={p} onDelete={del} />)}
        {!rows.length && <li className="text-muted">עדיין לא נרשמו תשלומים לליאור.</li>}
      </ul>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input className="input" type="number" inputMode="decimal" placeholder="סכום ששולם (₪)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input col-span-2 md:col-span-3" placeholder="הערה (אופציונלי)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-2 flex justify-start">
        <button onClick={addPaid} className="btn-ghost">רשום תשלום לליאור</button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={strong ? "text-lg font-bold" : "font-semibold"}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function LandingPagesBox({ clientId, pages, onChange }: { clientId: string; pages: LP[]; onChange: () => void }) {
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitUrl() {
    if (!url) return;
    setBusy(true);
    const r = await fetch("/api/landing-pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceType: "url", clientId, label: label || url, url }),
    });
    setBusy(false);
    if (r.ok) { setUrl(""); setLabel(""); onChange(); }
    else alert(await r.text());
  }
  async function submitFile(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("label", label || file.name);
    fd.set("file", file);
    const r = await fetch("/api/landing-pages", { method: "POST", body: fd });
    setBusy(false);
    if (r.ok) { setLabel(""); onChange(); }
    else alert(await r.text());
  }
  async function del(id: string) {
    await fetch(`/api/landing-pages/${id}`, { method: "DELETE" });
    onChange();
  }
  return (
    <div className="card md:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">דפי נחיתה</h2>
        <div className="flex gap-1 text-xs">
          <button className={`btn-ghost ${mode === "url" ? "border-accent text-accent" : ""}`} onClick={() => setMode("url")}>כתובת URL</button>
          <button className={`btn-ghost ${mode === "file" ? "border-accent text-accent" : ""}`} onClick={() => setMode("file")}>העלאת HTML/תמונה</button>
        </div>
      </div>
      <div className="mb-3 flex flex-col gap-2 md:flex-row">
        <input className="input" placeholder="תווית (אופציונלי)" value={label} onChange={(e) => setLabel(e.target.value)} />
        {mode === "url" ? (
          <>
            <input className="input flex-1" placeholder="https://example.com/lp" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" />
            <button onClick={submitUrl} disabled={busy} className="btn-primary whitespace-nowrap">{busy ? "מושך…" : "הוסף מ-URL"}</button>
          </>
        ) : (
          <input
            type="file"
            accept=".html,.htm,image/*"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && submitFile(e.target.files[0])}
            className="input flex-1"
          />
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {pages.map((lp) => (
          <div key={lp.id} className="overflow-hidden rounded-lg border border-border bg-bg">
            {lp.screenshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lp.screenshotUrl} alt={lp.label} className="h-40 w-full object-cover object-top" />
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-muted">אין תצוגה מקדימה</div>
            )}
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-medium">{lp.label}</div>
                <button onClick={() => del(lp.id)} className="text-xs text-muted hover:text-bad">מחק</button>
              </div>
              <div className="mt-1 text-xs text-muted">{SOURCE_LABEL[lp.sourceType] ?? lp.sourceType}{lp.sourceUrl ? ` · ${new URL(lp.sourceUrl).host}` : ""}</div>
            </div>
          </div>
        ))}
        {!pages.length && <div className="text-sm text-muted">אין עדיין דפי נחיתה.</div>}
      </div>
    </div>
  );
}

function AnalysisHistory({ clientId, runs }: { clientId: string; runs: Run[] }) {
  return (
    <div className="card md:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">ניתוחי AI אחרונים</h2>
        <Link href={`/clients/${clientId}/analyze`} className="btn-primary">הרץ ניתוח חדש</Link>
      </div>
      <ul className="space-y-1 text-sm">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <Link href={`/clients/${clientId}/analyze?run=${r.id}`} className="hover:text-accent">
              {new Date(r.startedAt).toLocaleString("he-IL")} · <span className="text-muted">{r.model}</span>
            </Link>
            <span className={`text-xs ${r.status === "done" ? "text-good" : r.status === "error" ? "text-bad" : "text-muted"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
          </li>
        ))}
        {!runs.length && <li className="text-muted">אין עדיין ניתוחים.</li>}
      </ul>
    </div>
  );
}

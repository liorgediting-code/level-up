"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = 0 | 1 | 2;
type ClientType = "standard" | "recruitment";

export default function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [clientType, setClientType] = useState<ClientType>("standard");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [organicOn, setOrganicOn] = useState(false);
  const [paidOn, setPaidOn] = useState(false);
  const [organicCount, setOrganicCount] = useState("");
  const [paidCount, setPaidCount] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setStep(0);
    setClientType("standard");
    setName(""); setDescription(""); setTargetStr(""); setPriceStr("");
    setOrganicOn(false); setPaidOn(false); setOrganicCount(""); setPaidCount("");
  }

  async function submit() {
    const journeys: Array<{ kind: "organic" | "paid"; videoCount: number }> = [];
    let price: number | null = null;

    if (clientType === "recruitment") {
      if (priceStr.trim() !== "") {
        const p = Number(priceStr);
        if (!Number.isFinite(p) || p < 0) { alert("מחיר לאיש מכירות חייב להיות מספר ≥ 0"); return; }
        price = p;
      }
    } else {
      if (organicOn) {
        const n = Number(organicCount);
        if (!Number.isInteger(n) || n < 1) { alert("כמות סרטונים לאורגני חייבת להיות מספר ≥ 1"); return; }
        journeys.push({ kind: "organic", videoCount: n });
      }
      if (paidOn) {
        const n = Number(paidCount);
        if (!Number.isInteger(n) || n < 1) { alert("כמות מודעות לממומן חייבת להיות מספר ≥ 1"); return; }
        journeys.push({ kind: "paid", videoCount: n });
      }
    }

    const target = targetStr.trim() === "" ? null : Number(targetStr);
    if (clientType === "standard" && target !== null && (!Number.isInteger(target) || target < 0)) {
      alert("יעד פגישות חייב להיות מספר ≥ 0"); return;
    }

    setBusy(true);
    const r = await fetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        clientType,
        salesMeetingsTarget: clientType === "recruitment" ? null : target,
        journeys: clientType === "recruitment" || !journeys.length ? undefined : journeys,
        pricePerSalesperson: clientType === "recruitment" ? price : null,
        currency: "ILS",
      }),
    });
    setBusy(false);
    if (r.ok) {
      close();
      router.refresh();
    } else {
      alert(`Failed: ${await r.text()}`);
    }
  }

  function chooseType(t: ClientType) {
    setClientType(t);
    setStep(1);
  }

  function next() {
    if (!name.trim()) { alert("חובה להזין שם"); return; }
    if (clientType === "recruitment") { submit(); return; }
    setStep(2);
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>+ לקוח חדש</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={close}>
          <div className="w-full max-w-lg rounded-lg bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">לקוח חדש</h2>
              <button onClick={close} className="text-sm text-muted">סגור</button>
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted">בחר את סוג הלקוח.</p>
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => chooseType("standard")}
                    className={`rounded-xl border p-4 text-right ${clientType === "standard" ? "border-accent" : "border-border"}`}
                  >
                    <div className="font-semibold">שיווק / מכירות</div>
                    <div className="text-xs text-muted">מרחבי אימון מכירות ושיווק</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseType("recruitment")}
                    className={`rounded-xl border p-4 text-right ${clientType === "recruitment" ? "border-accent" : "border-border"}`}
                  >
                    <div className="font-semibold">השמת אנשי מכירות</div>
                    <div className="text-xs text-muted">שלבי השמה ותמחור לפי איש מכירות</div>
                  </button>
                </div>
                <div className="mt-2 flex justify-end">
                  <button onClick={close} className="btn-ghost">ביטול</button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">שם לקוח</span>
                  <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="שם העסק" autoFocus />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">תיאור / הצעה (אופציונלי)</span>
                  <textarea className="input h-20 w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                {clientType === "standard" && (
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">יעד פגישות מכירה (אופציונלי)</span>
                    <input
                      className="input w-full"
                      type="number"
                      min={0}
                      value={targetStr}
                      onChange={(e) => setTargetStr(e.target.value)}
                      placeholder="לדוגמה: 12"
                    />
                  </label>
                )}
                {clientType === "recruitment" && (
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">מחיר לאיש מכירות (₪, אופציונלי)</span>
                    <input
                      className="input w-full"
                      type="number"
                      min={0}
                      value={priceStr}
                      onChange={(e) => setPriceStr(e.target.value)}
                      placeholder="לדוגמה: 5000"
                    />
                  </label>
                )}
                <div className="mt-2 flex justify-between gap-2">
                  <button onClick={() => setStep(0)} className="btn-ghost">← חזרה</button>
                  <button onClick={next} disabled={busy} className="btn-primary">
                    {clientType === "recruitment" ? (busy ? "יוצר…" : "סיום") : "הבא →"}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-muted">בחר אילו מסלולי שיווק להפעיל עבור הלקוח. אפשר גם להשאיר ריק ולהוסיף בהמשך.</p>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={organicOn} onChange={(e) => setOrganicOn(e.target.checked)} />
                  <span className="text-sm font-medium">מסלול אורגני</span>
                </label>
                {organicOn && (
                  <input
                    className="input w-full"
                    type="number"
                    min={1}
                    placeholder="כמות סרטונים מתוכננת"
                    value={organicCount}
                    onChange={(e) => setOrganicCount(e.target.value)}
                  />
                )}

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={paidOn} onChange={(e) => setPaidOn(e.target.checked)} />
                  <span className="text-sm font-medium">מסלול ממומן</span>
                </label>
                {paidOn && (
                  <input
                    className="input w-full"
                    type="number"
                    min={1}
                    placeholder="כמות מודעות מתוכננת"
                    value={paidCount}
                    onChange={(e) => setPaidCount(e.target.value)}
                  />
                )}

                <div className="mt-2 flex justify-between gap-2">
                  <button onClick={() => setStep(1)} className="btn-ghost">← חזרה</button>
                  <button onClick={submit} disabled={busy} className="btn-primary">{busy ? "יוצר…" : "סיום"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

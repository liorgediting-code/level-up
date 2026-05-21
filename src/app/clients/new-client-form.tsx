"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = 1 | 2;

export default function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const [organicOn, setOrganicOn] = useState(false);
  const [paidOn, setPaidOn] = useState(false);
  const [organicCount, setOrganicCount] = useState("");
  const [paidCount, setPaidCount] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setStep(1);
    setName(""); setDescription(""); setTargetStr("");
    setOrganicOn(false); setPaidOn(false); setOrganicCount(""); setPaidCount("");
  }

  async function submit() {
    const journeys: Array<{ kind: "organic" | "paid"; videoCount: number }> = [];
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
    const target = targetStr.trim() === "" ? null : Number(targetStr);
    if (target !== null && (!Number.isInteger(target) || target < 0)) { alert("יעד פגישות חייב להיות מספר ≥ 0"); return; }

    setBusy(true);
    const r = await fetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        salesMeetingsTarget: target,
        journeys: journeys.length ? journeys : undefined,
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

  function next() {
    if (!name.trim()) { alert("חובה להזין שם"); return; }
    setStep(2);
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>+ לקוח חדש</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={close}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">לקוח חדש — שלב {step} מתוך 2</h2>
              <button onClick={close} className="text-sm text-muted">סגור</button>
            </div>

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
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={close} className="btn-ghost">ביטול</button>
                  <button onClick={next} className="btn-primary">הבא →</button>
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

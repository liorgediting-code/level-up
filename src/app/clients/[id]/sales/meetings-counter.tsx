"use client";
import { useRouter } from "next/navigation";

export default function MeetingsCounter({
  clientId, held, target,
}: { clientId: string; held: number; target: number | null }) {
  const router = useRouter();
  async function editTarget() {
    const current = target == null ? "" : String(target);
    const next = prompt("יעד פגישות מכירה (השאר ריק למחיקה):", current);
    if (next === null) return;
    const trimmed = next.trim();
    let value: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) { alert("מספר לא תקין"); return; }
      value = n;
    }
    const r = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ salesMeetingsTarget: value }),
    });
    if (!r.ok) { alert(await r.text()); return; }
    const body = await r.json().catch(() => null) as { sync?: { created: number; deleted: number; warning?: string } } | null;
    if (body?.sync) {
      const parts: string[] = [];
      if (body.sync.created > 0) parts.push(`נוספו ${body.sync.created} פלייסהולדרים`);
      if (body.sync.deleted > 0) parts.push(`הוסרו ${body.sync.deleted} פלייסהולדרים`);
      if (body.sync.warning) parts.push(body.sync.warning);
      if (parts.length > 0) alert(parts.join(" · "));
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-good/15 px-3 py-1 text-xs text-good">
      פגישות שהתקיימו: {target == null ? held : `${held} / ${target}`}
      <button onClick={editTarget} className="opacity-60 hover:opacity-100" title="עדכן יעד">✎</button>
    </span>
  );
}

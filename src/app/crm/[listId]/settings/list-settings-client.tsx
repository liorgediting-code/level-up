"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = {
  id: string; name: string; color: string; order: number;
  isDefault: boolean; isConvertedTarget: boolean; listId: string | null;
};

export default function ListSettingsClient(props: {
  list: { id: string; name: string; webhookToken: string };
  overrides: Status[];
  globals: Status[];
}) {
  const router = useRouter();
  const [name, setName] = useState(props.list.name);
  // Derived from props so a router.refresh() reliably picks up rotations.
  const token = props.list.webhookToken;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/webhooks/leads/${props.list.id}?token=${token}`;

  async function saveName() {
    if (name === props.list.name) return;
    await fetch(`/api/crm/lists/${props.list.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    router.refresh();
  }
  async function rotate() {
    if (!confirm("החלפת הטוקן תשבור דפי נחיתה שמשתמשים בטוקן הישן. להמשיך?")) return;
    const res = await fetch(`/api/crm/lists/${props.list.id}/token`, { method: "POST" });
    router.refresh();
  }
  async function deleteList() {
    if (!confirm("למחוק את הרשימה וכל הלידים שבה?")) return;
    await fetch(`/api/crm/lists/${props.list.id}`, { method: "DELETE" });
    router.push("/crm");
  }

  const activeSet = props.overrides.length > 0 ? props.overrides : props.globals;

  return (
    <div>
      <Link href={`/crm/${props.list.id}`} className="text-xs text-muted hover:underline">← חזרה</Link>
      <h1 className="mb-6 text-2xl font-semibold">הגדרות רשימה</h1>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">פרטי רשימה</h2>
        <div className="flex gap-2">
          <input value={name} onChange={(e)=>setName(e.target.value)} onBlur={saveName} className="flex-1 rounded-md border px-3 py-1.5 text-sm" />
          <button onClick={deleteList} className="rounded-md border border-red-500 px-3 py-1.5 text-sm text-red-600">מחק רשימה</button>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Webhook</h2>
        <code className="block break-all rounded-md bg-elevated p-2 text-xs">{webhookUrl}</code>
        <div className="mt-2 flex gap-2">
          <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="rounded-md border px-3 py-1 text-sm">העתק</button>
          <button onClick={rotate} className="rounded-md border px-3 py-1 text-sm">החלף טוקן</button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">סטטוסים</h2>
        <p className="mb-2 text-xs text-muted">
          {props.overrides.length > 0
            ? "הרשימה משתמשת בסטטוסים מותאמים. מחיקת כולם תחזיר אותה לסטטוסים הגלובליים."
            : "הרשימה משתמשת בסטטוסים הגלובליים. הוספת סטטוס תיצור סט מותאם לרשימה זו."}
        </p>
        <StatusEditor scope={{ listId: props.list.id }} statuses={activeSet} canEditCurrent={props.overrides.length > 0} />
      </section>
    </div>
  );
}

export function StatusEditor({
  scope, statuses, canEditCurrent,
}: {
  scope: { listId: string | null };
  statuses: Status[];
  canEditCurrent: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", color: "#3b82f6" });

  async function add() {
    if (!draft.name.trim()) return;
    await fetch(`/api/crm/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...draft,
        order: statuses.length,
        isDefault: statuses.length === 0,
        isConvertedTarget: false,
        listId: scope.listId,
      }),
    });
    setAdding(false);
    setDraft({ name: "", color: "#3b82f6" });
    router.refresh();
  }
  async function patch(id: string, body: Partial<Status>) {
    await fetch(`/api/crm/statuses/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("למחוק את הסטטוס?")) return;
    const res = await fetch(`/api/crm/statuses/${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); alert(j.error ?? "מחיקה נכשלה"); return; }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {statuses.map((s) => {
        const editable = canEditCurrent || scope.listId === null;
        return (
          <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            <input
              defaultValue={s.name}
              disabled={!editable}
              onBlur={(e)=>e.target.value!==s.name && patch(s.id, { name: e.target.value })}
              className="flex-1 rounded-md border px-2 py-1 text-sm disabled:bg-elevated"
            />
            <label className="flex items-center gap-1 text-xs">
              <input type="radio" name={`def-${scope.listId ?? "g"}`} disabled={!editable} checked={s.isDefault} onChange={() => patch(s.id, { isDefault: true })} />
              ברירת מחדל
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="radio" name={`conv-${scope.listId ?? "g"}`} disabled={!editable} checked={s.isConvertedTarget} onChange={() => patch(s.id, { isConvertedTarget: true })} />
              סגור (יעד המרה)
            </label>
            <button onClick={() => remove(s.id)} disabled={!editable} className="text-xs text-red-600 disabled:opacity-30">מחק</button>
          </div>
        );
      })}

      {adding ? (
        <div className="flex items-center gap-2 rounded-md border p-2">
          <input type="color" value={draft.color} onChange={(e)=>setDraft({...draft, color: e.target.value})} className="h-7 w-10" />
          <input value={draft.name} onChange={(e)=>setDraft({...draft, name: e.target.value})} placeholder="שם סטטוס" className="flex-1 rounded-md border px-2 py-1 text-sm" />
          <button onClick={add} className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white">הוסף</button>
          <button onClick={()=>setAdding(false)} className="text-xs">ביטול</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="rounded-md border px-3 py-1 text-sm">+ סטטוס</button>
      )}
    </div>
  );
}

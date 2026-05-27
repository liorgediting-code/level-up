"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Status = { id: string; name: string; color: string; order: number; isDefault: boolean };
type Activity = { id: string; type: string; payload: Record<string, unknown>; createdAt: string };
type Lead = {
  id: string; name: string; phone: string | null; email: string | null;
  statusId: string; statusName: string; statusColor: string;
  utm: Record<string, string> | null; customFields: Record<string, unknown>;
  notes: string; viewedAt: string | null; convertedClientId: string | null;
  createdAt: string; activities: Activity[];
};

export default function ListClient(props: {
  list: { id: string; name: string };
  statuses: Status[];
  leads: Lead[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(search.get("lead"));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.leads.filter((l) => {
      if (statusFilter !== "all" && l.statusId !== statusFilter) return false;
      if (!q) return true;
      const hay = [l.name, l.phone ?? "", l.email ?? "", JSON.stringify(l.customFields)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [props.leads, statusFilter, query]);

  const openLead = openId ? props.leads.find((l) => l.id === openId) ?? null : null;

  useEffect(() => {
    if (!openLead || openLead.viewedAt) return;
    fetch(`/api/crm/leads/${openLead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markViewed: true }),
    }).then(() => router.refresh());
  }, [openLead, router]);

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/crm" className="text-xs text-muted hover:underline">← חזרה ל-CRM</Link>
          <h1 className="text-2xl font-semibold">{props.list.name}</h1>
        </div>
        <Link href={`/crm/${props.list.id}/settings`} className="rounded-md border px-3 py-1.5 text-sm">
          הגדרות רשימה
        </Link>
      </header>

      <div className="mb-3 flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="all">כל הסטטוסים</option>
          {props.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש…"
          className="flex-1 rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      <table className="w-full text-sm">
        <thead className="text-right text-xs text-muted">
          <tr>
            <th className="p-2">שם</th>
            <th className="p-2">טלפון</th>
            <th className="p-2">אימייל</th>
            <th className="p-2">הגיע</th>
            <th className="p-2">סטטוס</th>
            <th className="p-2">הערות</th>
            <th className="p-2">מקור</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((l) => (
            <tr
              key={l.id}
              onClick={() => setOpenId(l.id)}
              className={`cursor-pointer border-t hover:bg-border/20 ${!l.viewedAt ? "font-semibold" : ""}`}
            >
              <td className="p-2">{l.name}</td>
              <td className="p-2">{l.phone || "-"}</td>
              <td className="p-2">{l.email || "-"}</td>
              <td className="p-2 text-xs">{new Date(l.createdAt).toLocaleString("he-IL")}</td>
              <td className="p-2">
                <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: l.statusColor }}>
                  {l.statusName}
                </span>
              </td>
              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                <NotesCell lead={l} onChanged={() => router.refresh()} />
              </td>
              <td className="p-2 text-xs">{l.utm?.source ?? "-"}</td>
              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                <DeleteLeadButton
                  leadId={l.id}
                  leadName={l.name}
                  onDeleted={() => { if (openId === l.id) setOpenId(null); router.refresh(); }}
                />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={8} className="p-4 text-center text-sm text-muted">אין לידים בתצוגה זו.</td></tr>
          )}
        </tbody>
      </table>

      {openLead && (
        <LeadDrawer
          lead={openLead}
          statuses={props.statuses}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function LeadDrawer({
  lead, statuses, onClose, onChanged,
}: {
  lead: Lead; statuses: Status[]; onClose: () => void; onChanged: () => void;
}) {
  const [notes, setNotes] = useState(lead.notes);
  const [statusId, setStatusId] = useState(lead.statusId);
  const [converting, setConverting] = useState(false);
  const [convertName, setConvertName] = useState(lead.name);

  async function saveNotes() {
    if (notes === lead.notes) return;
    await fetch(`/api/crm/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    onChanged();
  }
  async function changeStatus(next: string) {
    setStatusId(next);
    await fetch(`/api/crm/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statusId: next }),
    });
    onChanged();
  }
  async function convert() {
    const res = await fetch(`/api/crm/leads/${lead.id}/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: convertName }),
    });
    if (!res.ok) { alert("המרה נכשלה"); return; }
    setConverting(false);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{lead.name}</h2>
          <div className="flex items-center gap-3">
            <DeleteLeadButton
              leadId={lead.id}
              leadName={lead.name}
              onDeleted={() => { onClose(); onChanged(); }}
            />
            <button onClick={onClose} className="text-sm text-muted">סגור</button>
          </div>
        </div>

        <dl className="mb-4 space-y-1 text-sm">
          {lead.phone && <div><dt className="inline text-muted">טלפון: </dt><dd className="inline">{lead.phone}</dd></div>}
          {lead.email && <div><dt className="inline text-muted">אימייל: </dt><dd className="inline">{lead.email}</dd></div>}
          {lead.utm && <div><dt className="inline text-muted">UTM: </dt><dd className="inline text-xs">{Object.entries(lead.utm).map(([k,v])=>`${k}=${v}`).join(" / ")}</dd></div>}
          <div><dt className="inline text-muted">הגיע: </dt><dd className="inline">{new Date(lead.createdAt).toLocaleString("he-IL")}</dd></div>
        </dl>

        {Object.keys(lead.customFields).length > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-xs font-medium text-muted">שדות נוספים</div>
            <div className="rounded-md bg-elevated p-2 text-xs">
              {Object.entries(lead.customFields).map(([k, v]) => (
                <div key={k}><span className="text-muted">{k}: </span>{String(v)}</div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted">סטטוס</label>
          <select
            value={statusId}
            onChange={(e) => changeStatus(e.target.value)}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          >
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted">הערות</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            className="h-28 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </div>

        <div className="mb-4">
          {lead.convertedClientId ? (
            <Link href={`/clients/${lead.convertedClientId}`} className="block rounded-md bg-green-100 px-3 py-2 text-sm dark:bg-green-950/50 dark:text-green-300">
              הומר ללקוח →
            </Link>
          ) : converting ? (
            <div className="rounded-md border p-3">
              <label className="mb-1 block text-xs text-muted">שם הלקוח</label>
              <input value={convertName} onChange={(e)=>setConvertName(e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm" />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setConverting(false)} className="rounded-md border px-3 py-1 text-sm">ביטול</button>
                <button onClick={convert} className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white">אישור</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConverting(true)} className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm text-white">
              המר ללקוח
            </button>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted">היסטוריה</div>
          <ul className="space-y-1 text-xs">
            {lead.activities.map((a) => (
              <li key={a.id} className="rounded bg-elevated px-2 py-1">
                <span className="font-medium">{labelForActivity(a.type)}</span>
                <span className="text-muted"> · {new Date(a.createdAt).toLocaleString("he-IL")}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function NotesCell({ lead, onChanged }: { lead: Lead; onChanged: () => void }) {
  const [value, setValue] = useState(lead.notes);
  const [editing, setEditing] = useState(false);

  // Keep in sync if the server data changes underneath us.
  useEffect(() => { if (!editing) setValue(lead.notes); }, [lead.notes, editing]);

  async function save() {
    setEditing(false);
    if (value === lead.notes) return;
    await fetch(`/api/crm/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: value }),
    });
    onChanged();
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        className="h-16 w-44 rounded-md border px-2 py-1 text-xs"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="block w-44 truncate text-right text-xs text-muted hover:text-foreground"
      title={lead.notes || "הוסף הערה"}
    >
      {lead.notes || <span className="italic">+ הוסף הערה</span>}
    </button>
  );
}

function DeleteLeadButton({
  leadId, leadName, onDeleted,
}: { leadId: string; leadName: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm(`למחוק את הליד "${leadName}" לצמיתות?`)) return;
    setBusy(true);
    const r = await fetch(`/api/crm/leads/${leadId}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) { alert("מחיקה נכשלה"); return; }
    onDeleted();
  }
  return (
    <button
      onClick={del}
      disabled={busy}
      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      מחק
    </button>
  );
}

function labelForActivity(type: string): string {
  if (type === "created") return "נוצר";
  if (type === "status_change") return "סטטוס שונה";
  if (type === "note") return "הערה עודכנה";
  if (type === "converted") return "הומר ללקוח";
  return type;
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MEETING_STATUS_COLOR, MEETING_STATUS_LABEL, type MeetingStatus,
} from "@/lib/sales/meetings";
import WhatsappSummaryModal from "@/components/whatsapp-summary-modal";

type PersistedStatus = "scheduled" | "held" | "cancelled" | "no_show";
export type MeetingRow = {
  id: string;
  title: string;
  scheduledAt: string | null;
  persistedStatus: PersistedStatus;
  effectiveStatus: MeetingStatus;
  attendees: string;
  notes: string;
  outcome: string;
  whatWorked: string;
  whatToImprove: string;
  link: string | null;
};

type Range = "all" | "upcoming" | "past";

export default function SalesClient({
  clientId, clientName, range, meetings, target,
}: {
  clientId: string; clientName: string; range: Range; meetings: MeetingRow[]; target: number | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function changeRange(next: Range) {
    const url = next === "all" ? `/clients/${clientId}/sales` : `/clients/${clientId}/sales?range=${next}`;
    router.push(url);
  }

  const openMeeting = openId ? meetings.find((m) => m.id === openId) ?? null : null;
  // The counter strip and "N מתוך M" numbering only make sense against the full ordered
  // list. On upcoming/past tabs the placeholders are filtered out by scheduledAt, so we
  // hide them there to avoid showing misleading counts and wrong row numbers.
  const showFullView = range === "all";
  const total = target ?? meetings.length;

  const counts = showFullView ? {
    done: meetings.filter((m) => m.persistedStatus === "held").length,
    scheduled: meetings.filter((m) => m.persistedStatus === "scheduled" && m.scheduledAt !== null).length,
    awaiting: meetings.filter((m) => m.scheduledAt === null).length,
    cancelled: meetings.filter((m) => m.persistedStatus === "cancelled").length,
    noShow: meetings.filter((m) => m.persistedStatus === "no_show").length,
  } : null;

  return (
    <div>
      {counts && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span><b className="text-foreground">{counts.done}</b> בוצעו</span>
          <span><b className="text-foreground">{counts.scheduled}</b> מתוזמנות</span>
          <span><b className="text-foreground">{counts.awaiting}</b> ממתינות לתזמון</span>
          {counts.cancelled > 0 && <span><b className="text-foreground">{counts.cancelled}</b> בוטלו</span>}
          {counts.noShow > 0 && <span><b className="text-foreground">{counts.noShow}</b> לא הגיעו</span>}
          {target != null && <span>· יעד: <b className="text-foreground">{target}</b></span>}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 text-xs">
          {(["all", "upcoming", "past"] as const).map((r) => (
            <button
              key={r}
              onClick={() => changeRange(r)}
              className={`btn-ghost ${range === r ? "border-accent text-accent" : ""}`}
            >
              {r === "all" ? "כולן" : r === "upcoming" ? "עתידיות" : "עבר"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/clients/${clientId}/sales/tasks`} className="btn-ghost text-xs">+ משימה</Link>
          <button onClick={() => setCreating(true)} className="btn-primary">+ פגישה חדשה</button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-right text-xs text-muted">
          <tr>
            {showFullView && <th className="p-2">#</th>}
            <th className="p-2">תאריך</th>
            <th className="p-2">כותרת</th>
            <th className="p-2">סטטוס</th>
            <th className="p-2">משתתפים</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m, i) => (
            <tr
              key={m.id}
              onClick={() => setOpenId(m.id)}
              className={`cursor-pointer border-t border-border hover:bg-border/20 ${m.scheduledAt === null ? "text-muted" : ""}`}
            >
              {showFullView && <td className="p-2 text-xs whitespace-nowrap">פגישה {i + 1} מתוך {total}</td>}
              <td className="p-2 text-xs">
                {m.scheduledAt
                  ? new Date(m.scheduledAt).toLocaleString("he-IL")
                  : <span className="text-amber-600">— לחץ לתזמון</span>}
              </td>
              <td className="p-2">{m.title}</td>
              <td className="p-2">
                {m.scheduledAt === null ? (
                  <span className="rounded-full border border-amber-400 px-2 py-0.5 text-xs text-amber-700">לא תוזמנה</span>
                ) : (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs text-white"
                    style={{ background: MEETING_STATUS_COLOR[m.effectiveStatus] }}
                  >
                    {MEETING_STATUS_LABEL[m.effectiveStatus]}
                  </span>
                )}
              </td>
              <td className="p-2 text-xs">{m.attendees || "-"}</td>
            </tr>
          ))}
          {meetings.length === 0 && (
            <tr><td colSpan={showFullView ? 5 : 4} className="p-4 text-center text-sm text-muted">אין פגישות בתצוגה זו.</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <NewMeetingDialog
          clientId={clientId}
          onClose={() => setCreating(false)}
          onCreated={() => router.refresh()}
        />
      )}
      {openMeeting && (
        <MeetingDrawer
          clientId={clientId}
          clientName={clientName}
          meeting={openMeeting}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function NewMeetingDialog({
  clientId, onClose, onCreated,
}: { clientId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [attendees, setAttendees] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    if (!title.trim() || !date || !time) return;
    const iso = new Date(`${date}T${time}:00`).toISOString();
    const res = await fetch(`/api/clients/${clientId}/meetings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        scheduledAt: iso,
        attendees,
        notes,
        outcome: "",
        link: link.trim() || null,
      }),
    });
    if (!res.ok) { alert("יצירה נכשלה"); return; }
    onClose();
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">פגישה חדשה</h2>
        <input className="input mb-2 w-full" placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <input className="input mb-2 w-full" placeholder="משתתפים" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        <input className="input mb-2 w-full" placeholder="קישור (zoom/calendly, אופציונלי)" value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" />
        <textarea className="input mb-3 h-20 w-full" placeholder="הערות" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">ביטול</button>
          <button onClick={submit} className="btn-primary">צור</button>
        </div>
      </div>
    </div>
  );
}

function MeetingDrawer({
  clientId, clientName, meeting, onClose, onChanged,
}: { clientId: string; clientName: string; meeting: MeetingRow; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(meeting.title);
  const pad = (n: number) => String(n).padStart(2, "0");
  const initial = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const [date, setDate] = useState(
    initial ? `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}-${pad(initial.getDate())}` : "",
  );
  const [time, setTime] = useState(
    initial ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}` : "",
  );
  const [attendees, setAttendees] = useState(meeting.attendees);
  const [notes, setNotes] = useState(meeting.notes);
  const [outcome, setOutcome] = useState(meeting.outcome);
  const [whatWorked, setWhatWorked] = useState(meeting.whatWorked);
  const [whatToImprove, setWhatToImprove] = useState(meeting.whatToImprove);
  const [link, setLink] = useState(meeting.link ?? "");
  const [status, setStatus] = useState<PersistedStatus>(meeting.persistedStatus);
  const [followUp, setFollowUp] = useState("");
  const [adding, setAdding] = useState(false);
  const [showWhatsapp, setShowWhatsapp] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { alert("עדכון נכשל"); return false; }
    return true;
  }

  async function save() {
    let scheduledAt: string | null = null;
    if (date && time) {
      scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    } else if (date || time) {
      alert("יש למלא גם תאריך וגם שעה, או להשאיר את שניהם ריקים");
      return;
    }
    const ok = await patch({
      title, scheduledAt, attendees, notes, outcome,
      whatWorked, whatToImprove,
      link: link.trim() || null,
      status,
    });
    if (ok) { onClose(); onChanged(); }
  }

  async function addFollowUp() {
    const t = followUp.trim();
    if (!t) return;
    setAdding(true);
    const res = await fetch(`/api/clients/${clientId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ space: "sales", title: t, description: `מתוך פגישה: ${meeting.title}` }),
    });
    setAdding(false);
    if (!res.ok) { alert("הוספת המשימה נכשלה"); return; }
    setFollowUp("");
    onChanged();
  }

  async function quickSet(s: PersistedStatus) {
    setStatus(s);
    const ok = await patch({ status: s });
    if (ok) onChanged();
  }

  async function del() {
    if (!confirm("למחוק את הפגישה?")) return;
    await fetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
    onClose(); onChanged();
  }

  const showResolve = meeting.effectiveStatus === "pending_update";
  const isPlaceholder = meeting.scheduledAt === null;
  const summaryReady =
    meeting.persistedStatus === "held" ||
    Boolean(
      meeting.notes.trim() ||
      meeting.outcome.trim() ||
      meeting.whatWorked.trim() ||
      meeting.whatToImprove.trim(),
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isPlaceholder ? "פגישה (לא תוזמנה)" : "פגישה"}</h2>
          <button onClick={onClose} className="text-sm text-muted">סגור</button>
        </div>

        {showResolve && (
          <div className="mb-4 rounded-md border border-amber-500 bg-amber-50 p-2 text-xs">
            פגישה זו כבר עברה. עדכן סטטוס:
            <div className="mt-2 flex gap-1">
              <button onClick={() => quickSet("held")} className="btn-ghost">התקיימה</button>
              <button onClick={() => quickSet("cancelled")} className="btn-ghost">בוטלה</button>
              <button onClick={() => quickSet("no_show")} className="btn-ghost">לא הגיעו</button>
            </div>
          </div>
        )}

        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">כותרת</span>
          <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">תאריך</span>
            <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">שעה</span>
            <input type="time" className="input w-full" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">סטטוס</span>
          <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as PersistedStatus)}>
            <option value="scheduled">נקבעה</option>
            <option value="held">התקיימה</option>
            <option value="cancelled">בוטלה</option>
            <option value="no_show">לא הגיעו</option>
          </select>
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">משתתפים</span>
          <input className="input w-full" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">קישור</span>
          <input className="input w-full" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">הערות</span>
          <textarea className="input h-24 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">תוצאת הפגישה</span>
          <textarea className="input h-20 w-full" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </label>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-muted">מה עבד טוב</span>
          <textarea className="input h-20 w-full" value={whatWorked} onChange={(e) => setWhatWorked(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-muted">מה צריך לשפר</span>
          <textarea className="input h-20 w-full" value={whatToImprove} onChange={(e) => setWhatToImprove(e.target.value)} />
        </label>

        <div className="mb-4 rounded-md border border-border p-2">
          <div className="mb-2 text-xs text-muted">משימת המשך</div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="כותרת משימה ולחץ Enter"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFollowUp()}
            />
            <button onClick={addFollowUp} disabled={adding || !followUp.trim()} className="btn-primary disabled:opacity-50">
              הוסף
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {summaryReady && (
            <button
              type="button"
              onClick={() => setShowWhatsapp(true)}
              className="btn-soft"
            >
              📋 סיכום לוואטסאפ
            </button>
          )}
          <button onClick={del} className="text-sm text-bad">מחק</button>
          <button onClick={save} className="btn-primary">שמור</button>
        </div>

        <WhatsappSummaryModal
          open={showWhatsapp}
          onClose={() => setShowWhatsapp(false)}
          clientId={clientId}
          clientName={clientName}
          meeting={{
            title: meeting.title,
            scheduledAt: meeting.scheduledAt,
            attendees: meeting.attendees,
            notes: meeting.notes,
            outcome: meeting.outcome,
            whatWorked: meeting.whatWorked,
            whatToImprove: meeting.whatToImprove,
          }}
        />
      </aside>
    </div>
  );
}

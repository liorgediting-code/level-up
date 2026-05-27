"use client";

import { useEffect, useState } from "react";

type OpenTask = {
  id: string;
  title: string;
  dueDate: string | null;
};

type MeetingSummaryInput = {
  title: string;
  scheduledAt: string | null;
  attendees: string;
  notes: string;
  outcome: string;
  whatWorked: string;
  whatToImprove: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  meeting: MeetingSummaryInput;
};

function fmtHebrewDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

function buildSummary(
  clientName: string,
  meeting: MeetingSummaryInput,
  tasks: OpenTask[],
  tasksError: boolean,
): string {
  const lines: string[] = [];
  lines.push(`📋 סיכום פגישה — ${clientName}`);

  const dateLine = meeting.scheduledAt ? `🗓 ${fmtHebrewDate(meeting.scheduledAt)}` : `🗓 ${meeting.title}`;
  const attendees = meeting.attendees.trim();
  lines.push(attendees ? `${dateLine} · 👥 ${attendees}` : dateLine);

  const section = (header: string, body: string) => {
    const t = body.trim();
    if (!t) return;
    lines.push("");
    lines.push(header);
    lines.push(t);
  };

  section("📝 הערות", meeting.notes);
  section("✅ מה עבד טוב", meeting.whatWorked);
  section("🔧 מה לשפר", meeting.whatToImprove);
  section("🎯 תוצאה", meeting.outcome);

  if (tasksError) {
    lines.push("");
    lines.push("📌 משימות פתוחות");
    lines.push("(לא נטענו משימות)");
  } else if (tasks.length > 0) {
    lines.push("");
    lines.push("📌 משימות פתוחות");
    for (const t of tasks) {
      const due = t.dueDate ? ` (עד ${fmtShortDate(t.dueDate)})` : "";
      lines.push(`• ${t.title}${due}`);
    }
  }

  return lines.join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function WhatsappSummaryModal({ open, onClose, clientId, clientName, meeting }: Props) {
  const [tasks, setTasks] = useState<OpenTask[]>([]);
  const [tasksError, setTasksError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setTasksError(false);
    fetch(`/api/clients/${clientId}/tasks?space=sales&status=open`)
      .then((r) => {
        if (!r.ok) throw new Error("bad response");
        return r.json();
      })
      .then((data: { tasks: OpenTask[] }) => {
        if (!cancelled) setTasks(data.tasks ?? []);
      })
      .catch(() => {
        if (!cancelled) setTasksError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  if (!open) return null;

  const text = buildSummary(clientName, meeting, tasks, tasksError);

  async function onCopy() {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      alert("ההעתקה נכשלה. אפשר לבחור ולהעתיק ידנית.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose}>
      <div
        className="fixed left-1/2 top-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">סיכום לוואטסאפ</h3>
          <button onClick={onClose} className="text-sm text-muted">סגור</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-sm text-muted">טוען משימות…</div>
          ) : (
            <pre dir="rtl" className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-fg">
              {text}
            </pre>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="btn-ghost">סגור</button>
          <button onClick={onCopy} disabled={loading} className="btn-primary disabled:opacity-50">
            {copied ? "הועתק ✓" : "העתק לקליפבורד"}
          </button>
        </div>
      </div>
    </div>
  );
}

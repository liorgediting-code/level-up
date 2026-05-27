"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Priority = "low" | "normal" | "high";
type Status = "open" | "done";
type Space = "sales" | "marketing";

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  status: Status;
  completedAt: string | null;
  linkedKind: "organic" | "paid" | null;
};

const PRIORITY_LABEL: Record<Priority, string> = { low: "נמוכה", normal: "רגילה", high: "גבוהה" };
const PRIORITY_COLOR: Record<Priority, string> = { low: "#94a3b8", normal: "#3b82f6", high: "#ef4444" };
const LINKED_LABEL: Record<"organic" | "paid", string> = { organic: "אורגני", paid: "ממומן" };
const LINKED_COLOR: Record<"organic" | "paid", string> = { organic: "#ec4899", paid: "#a855f7" };

export default function TasksShared({
  clientId, space, tasks,
}: {
  clientId: string; space: Space; tasks: TaskRow[];
}) {
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState("");
  const [quickDue, setQuickDue] = useState("");
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = tasks.filter((t) => filter === "all" ? true : t.status === filter);
  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null;

  async function createQuick() {
    const title = quickAdd.trim();
    if (!title) return;
    await fetch(`/api/clients/${clientId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        space,
        title,
        dueDate: quickDue ? new Date(quickDue).toISOString() : null,
      }),
    });
    setQuickAdd("");
    setQuickDue("");
    router.refresh();
  }

  async function toggleDone(t: TaskRow) {
    const r = await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: t.status === "open" ? "done" : "open" }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ error: "שגיאה" }));
      alert(typeof j.error === "string" ? j.error : "שגיאה בעדכון המשימה");
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createQuick()}
          placeholder="הוסף משימה ולחץ Enter"
          className="input flex-1 min-w-0"
        />
        <input
          type="date"
          value={quickDue}
          onChange={(e) => setQuickDue(e.target.value)}
          className="input"
          title="תאריך יעד (לא חובה)"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as "open" | "done" | "all")} className="input">
          <option value="open">פתוחות</option>
          <option value="done">הושלמו</option>
          <option value="all">הכל</option>
        </select>
      </div>

      <ul className="space-y-1">
        {visible.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-border/20"
          >
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => toggleDone(t)}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className={`flex-1 text-right ${t.status === "done" ? "text-muted line-through" : ""}`}
              onClick={() => setOpenId(t.id)}
            >
              {t.title}
            </button>
            {t.linkedKind && (
              <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: LINKED_COLOR[t.linkedKind] }}>
                {LINKED_LABEL[t.linkedKind]}
              </span>
            )}
            <span
              className="rounded-full px-2 py-0.5 text-xs text-white"
              style={{ background: PRIORITY_COLOR[t.priority] }}
            >
              {PRIORITY_LABEL[t.priority]}
            </span>
            {t.dueDate && (() => {
              const due = new Date(t.dueDate);
              const overdue = t.status !== "done" && due.getTime() < Date.now();
              return (
                <span className={`text-xs ${overdue ? "text-amber-500 font-medium" : "text-muted"}`}>
                  {due.toLocaleDateString("he-IL")}
                </span>
              );
            })()}
          </li>
        ))}
        {visible.length === 0 && <li className="text-sm text-muted">אין משימות בתצוגה זו.</li>}
      </ul>

      {openTask && (
        <TaskDrawer
          task={openTask}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function TaskDrawer({
  task, onClose, onChanged,
}: { task: TaskRow; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [status, setStatus] = useState<Status>(task.status);

  async function save() {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        status,
      }),
    });
    onClose();
    onChanged();
  }

  async function del() {
    if (!confirm("למחוק את המשימה?")) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onClose();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">משימה</h2>
          <button onClick={onClose} className="text-sm text-muted">סגור</button>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">כותרת</span>
          <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">תיאור</span>
          <textarea className="input h-24 w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">עדיפות</span>
            <select className="input w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">{PRIORITY_LABEL.low}</option>
              <option value="normal">{PRIORITY_LABEL.normal}</option>
              <option value="high">{PRIORITY_LABEL.high}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">תאריך יעד</span>
            <input type="date" className="input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-muted">סטטוס</span>
          <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="open">פתוחה</option>
            <option value="done">הושלמה</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button
            onClick={del}
            disabled={task.linkedKind !== null}
            title={task.linkedKind ? "מקושר למסלול — מחק דרך טאב המסלולים" : ""}
            className="text-sm text-bad disabled:opacity-40"
          >
            מחק
          </button>
          <button onClick={save} className="btn-primary">שמור</button>
        </div>
      </aside>
    </div>
  );
}

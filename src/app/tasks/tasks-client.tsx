"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

type Status = "todo" | "in_progress" | "problem" | "done";
type Assignee = "liav" | "lior";

export type TeamTask = {
  id: string;
  assignee: Assignee;
  title: string;
  description: string;
  status: Status;
  createdAt: string;
};

const STATUS_LABEL: Record<Status, string> = {
  todo: "צריך לעשות",
  in_progress: "בעשייה",
  problem: "בעיה",
  done: "הושלמה",
};

const STATUS_ORDER: Status[] = ["problem", "in_progress", "todo", "done"];

const STATUS_COLORS: Record<Status, string> = {
  todo: "bg-surface-2 text-muted border border-border",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  problem: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const ASSIGNEE_LABEL: Record<Assignee, string> = {
  liav: "ליאב",
  lior: "ליאור",
};

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatusPicker({
  value,
  onChange,
}: {
  value: Status;
  onChange: (s: Status) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function TaskCard({
  task,
  onUpdate,
  onDelete,
}: {
  task: TeamTask;
  onUpdate: (id: string, patch: Partial<Pick<TeamTask, "status" | "title" | "description">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleStatusChange(status: Status) {
    await onUpdate(task.id, { status });
  }

  async function handleSaveEdit() {
    if (!title.trim()) return;
    setSaving(true);
    await onUpdate(task.id, { title: title.trim(), description });
    setSaving(false);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`למחוק את המשימה "${task.title}"?`)) return;
    setDeleting(true);
    await onDelete(task.id);
  }

  return (
    <div
      className={`group rounded-xl border border-border bg-surface p-3 shadow-card transition-opacity ${
        deleting ? "opacity-40 pointer-events-none" : ""
      } ${task.status === "done" ? "opacity-60" : ""}`}
    >
      {editing ? (
        <div className="space-y-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="כותרת"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 text-xs text-fg resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="פרטים (אופציונלי)"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={saving || !title.trim()}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setTitle(task.title);
                setDescription(task.description);
              }}
              className="rounded-lg border border-border px-3 py-1 text-xs text-muted"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium text-fg leading-snug ${
                  task.status === "done" ? "line-through text-muted" : ""
                }`}
              >
                {task.title}
              </p>
              {task.description && (
                <p className="mt-0.5 text-xs text-muted leading-relaxed">{task.description}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditing(true)}
                title="עריכה"
                className="rounded p-1 text-muted hover:bg-elevated hover:text-fg"
              >
                <EditIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleDelete}
                title="מחיקה"
                className="rounded p-1 text-muted hover:bg-elevated hover:text-red-500"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <StatusPicker value={task.status} onChange={handleStatusChange} />
            <StatusBadge status={task.status} />
          </div>
        </>
      )}
    </div>
  );
}

function AddTaskForm({
  assignee,
  onAdd,
}: {
  assignee: Assignee;
  onAdd: (assignee: Assignee, title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    await onAdd(assignee, title.trim());
    setTitle("");
    setAdding(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`הוסף משימה ל${ASSIGNEE_LABEL[assignee]}...`}
        className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        disabled={adding}
      />
      <button
        type="submit"
        disabled={adding || !title.trim()}
        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        +
      </button>
    </form>
  );
}

function Column({
  assignee,
  tasks,
  onAdd,
  onUpdate,
  onDelete,
}: {
  assignee: Assignee;
  tasks: TeamTask[];
  onAdd: (assignee: Assignee, title: string) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Pick<TeamTask, "status" | "title" | "description">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const sorted = [...tasks].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  );

  const counts = {
    problem: tasks.filter((t) => t.status === "problem").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    todo: tasks.filter((t) => t.status === "todo").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-fg">{ASSIGNEE_LABEL[assignee]}</h2>
        <div className="flex items-center gap-1.5">
          {counts.problem > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {counts.problem} בעיה
            </span>
          )}
          {counts.in_progress > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {counts.in_progress} בעשייה
            </span>
          )}
          <span className="text-xs text-muted">{tasks.length} סה״כ</span>
        </div>
      </div>

      <AddTaskForm assignee={assignee} onAdd={onAdd} />

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            אין משימות
          </p>
        ) : (
          sorted.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function TasksClient({ initialTasks }: { initialTasks: TeamTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TeamTask[]>(initialTasks);

  async function handleAdd(assignee: Assignee, title: string) {
    const res = await fetch("/api/team-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee, title }),
    });
    if (!res.ok) return;
    const { task } = await res.json();
    setTasks((prev) => [...prev, task]);
    router.refresh();
  }

  async function handleUpdate(
    id: string,
    patch: Partial<Pick<TeamTask, "status" | "title" | "description">>
  ) {
    const res = await fetch(`/api/team-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const { task } = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...task } : t)));
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/team-tasks/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    router.refresh();
  }

  const liavTasks = tasks.filter((t) => t.assignee === "liav");
  const liorTasks = tasks.filter((t) => t.assignee === "lior");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">משימות צוות</h1>
        <p className="text-sm text-muted">{tasks.length} משימות בסך הכל</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted self-center">מטרות:</span>
        {(
          [
            { tab: "week", label: "שבועיות" },
            { tab: "month", label: "חודשיות" },
            { tab: "quarter", label: "רבעוניות" },
          ] as const
        ).map(({ tab, label }) => (
          <Link
            key={tab}
            href={`/goals?tab=${tab}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-elevated hover:border-border-strong transition-colors"
          >
            <TargetIcon className="h-3.5 w-3.5 text-accent" />
            {label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Column
          assignee="liav"
          tasks={liavTasks}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
        <Column
          assignee="lior"
          tasks={liorTasks}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

function EditIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </svg>
  );
}

function TrashIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}
function TargetIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

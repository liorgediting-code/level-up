import { listTasksForClient } from "@/lib/sales/tasks";
import TasksShared, { type TaskRow } from "../../tasks-shared";

export const dynamic = "force-dynamic";

export default async function SalesTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await listTasksForClient(id, "sales");
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskRow["priority"],
    dueDate: t.dueDate?.toISOString() ?? null,
    status: t.status as TaskRow["status"],
    completedAt: t.completedAt?.toISOString() ?? null,
    linkedKind: null,
  }));
  return <TasksShared clientId={id} space="sales" tasks={rows} />;
}

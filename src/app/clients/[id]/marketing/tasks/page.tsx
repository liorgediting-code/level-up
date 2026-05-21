import { prisma } from "@/lib/db";
import TasksShared, { type TaskRow } from "../../tasks-shared";

export const dynamic = "force-dynamic";

export default async function MarketingTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await prisma.task.findMany({
    where: { clientId: id, space: "marketing" },
    orderBy: [{ createdAt: "desc" }],
    include: {
      linkedStage: {
        include: { journey: true },
      },
    },
  });
  const rank: Record<string, number> = { high: 0, normal: 1, low: 2 };
  tasks.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const pa = rank[a.priority] ?? 1; const pb = rank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ? a.dueDate.getTime() : Infinity;
    const db = b.dueDate ? b.dueDate.getTime() : Infinity;
    if (da !== db) return da - db;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskRow["priority"],
    dueDate: t.dueDate?.toISOString() ?? null,
    status: t.status as TaskRow["status"],
    completedAt: t.completedAt?.toISOString() ?? null,
    linkedKind: t.linkedStage?.journey.kind === "organic"
      ? "organic" : t.linkedStage?.journey.kind === "paid"
      ? "paid" : null,
  }));
  return <TasksShared clientId={id} space="marketing" tasks={rows} />;
}

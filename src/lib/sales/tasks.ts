import { prisma } from "@/lib/db";

export type TaskSpace = "sales" | "marketing";
export type TaskStatus = "open" | "done";
export type TaskPriority = "low" | "normal" | "high";

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const TASK_STATUSES = ["open", "done"] as const;
export const TASK_SPACES = ["sales", "marketing"] as const;

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "נמוכה",
  normal: "רגילה",
  high: "גבוהה",
};

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

export async function listTasksForClient(clientId: string, space: TaskSpace) {
  const rows = await prisma.task.findMany({
    where: { clientId, space },
    orderBy: [{ createdAt: "desc" }],
  });
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const pa = TASK_PRIORITY_RANK[a.priority as TaskPriority] ?? 1;
    const pb = TASK_PRIORITY_RANK[b.priority as TaskPriority] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
    const db = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return rows;
}

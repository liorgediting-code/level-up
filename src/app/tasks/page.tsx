import { prisma } from "@/lib/db";
import TasksClient from "./tasks-client";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tasks = await prisma.teamTask.findMany({
    orderBy: [{ createdAt: "asc" }],
  });

  const serialized = tasks.map((t) => ({
    id: t.id,
    assignee: t.assignee as "liav" | "lior",
    title: t.title,
    description: t.description,
    status: t.status as "todo" | "in_progress" | "problem" | "done",
    createdAt: t.createdAt.toISOString(),
  }));

  return <TasksClient initialTasks={serialized} />;
}

import { prisma } from "@/lib/db";
import { advanceActiveStage, revertCompletedStage } from "@/lib/journeys/advance";

export async function syncFromTaskStatusChange(
  taskId: string,
  newStatus: "open" | "done",
): Promise<{ handled: boolean }> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !task.linkedStageId) return { handled: false };
  if (task.status === newStatus) return { handled: true };

  if (newStatus === "done") {
    await advanceActiveStage(task.linkedStageId);
  } else {
    await revertCompletedStage(task.linkedStageId);
  }
  return { handled: true };
}

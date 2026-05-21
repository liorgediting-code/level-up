import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    const stages = await tx.journeyStage.findMany({
      where: { journeyId: id },
      select: { taskId: true },
    });
    const taskIds = stages.map((s) => s.taskId).filter((x): x is string => !!x);
    if (taskIds.length > 0) {
      await tx.task.deleteMany({ where: { id: { in: taskIds } } });
    }
    await tx.journey.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}

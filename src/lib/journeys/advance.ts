import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  type JourneyKind, type StageKind, templateFor, isFilmingKind,
} from "@/lib/journeys/templates";
import { materializeActiveStage } from "@/lib/journeys/create";

type StageRow = {
  id: string;
  journeyId: string;
  index: number;
  kind: string;
  mode: string;
  status: string;
  filmingDate: Date | null;
  taskId: string | null;
};

export async function advanceActiveStage(stageId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.journeyStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.status !== "active") throw new Error("stage not active");
    if (stage.mode === "per_video") throw new Error("per_video stage cannot be marked done directly");
    if (isFilmingKind(stage.kind as StageKind)) {
      if (!stage.filmingDate) throw new Error("filmingDate required");
      if (stage.filmingDate > new Date()) throw new Error("filmingDate is in the future");
    }
    await advanceStageInTx(tx, stage);
  });
}

export async function advanceStageInTx(tx: Prisma.TransactionClient, stage: StageRow): Promise<void> {
  await tx.journeyStage.update({
    where: { id: stage.id },
    data: { status: "done" },
  });
  if (stage.taskId) {
    await tx.task.update({
      where: { id: stage.taskId },
      data: { status: "done", completedAt: new Date() },
    });
  }

  const journey = await tx.journey.findUniqueOrThrow({ where: { id: stage.journeyId } });
  const template = templateFor(journey.kind as JourneyKind);

  const next = template.find((t) => t.index === stage.index + 1);
  if (!next) {
    await tx.journey.update({
      where: { id: journey.id },
      data: { status: "completed" },
    });
    return;
  }

  const nextStage = await tx.journeyStage.findFirstOrThrow({
    where: { journeyId: journey.id, index: next.index },
  });
  await tx.journeyStage.update({
    where: { id: nextStage.id },
    data: { status: "active" },
  });
  await tx.journey.update({
    where: { id: journey.id },
    data: { currentStageIndex: next.index },
  });
  await materializeActiveStage(
    tx, journey.id, nextStage.id, next, journey.videoCount, journey.kind as JourneyKind, template.length,
  );
}

export async function revertCompletedStage(stageId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.journeyStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.status === "active") return;
    if (stage.status !== "done") throw new Error("can only revert a done stage");
    await revertStageInTx(tx, stage);
  });
}

export async function revertStageInTx(tx: Prisma.TransactionClient, stage: StageRow): Promise<void> {
  const laterStages = await tx.journeyStage.findMany({
    where: { journeyId: stage.journeyId, index: { gt: stage.index } },
    orderBy: { index: "desc" },
  });

  for (const later of laterStages) {
    if (later.status === "locked") continue;
    await tx.journeyVideoItem.deleteMany({ where: { stageId: later.id } });
    if (later.taskId) {
      await tx.task.delete({ where: { id: later.taskId } });
    }
    await tx.journeyStage.update({
      where: { id: later.id },
      data: { status: "locked", taskId: null, docLink: null, filmingDate: null },
    });
  }

  await tx.journeyStage.update({
    where: { id: stage.id },
    data: { status: "active" },
  });
  if (stage.taskId) {
    await tx.task.update({
      where: { id: stage.taskId },
      data: { status: "open", completedAt: null },
    });
  }
  await tx.journey.update({
    where: { id: stage.journeyId },
    data: { status: "active", currentStageIndex: stage.index },
  });
}

export async function toggleVideoItem(stageId: string, videoIndex: number, done: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.journeyStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.mode !== "per_video") throw new Error("stage is not per_video");

    await tx.journeyVideoItem.update({
      where: { stageId_index: { stageId, index: videoIndex } },
      data: { done, doneAt: done ? new Date() : null },
    });

    const items = await tx.journeyVideoItem.findMany({ where: { stageId } });
    const allDone = items.length > 0 && items.every((i) => i.done);

    if (allDone && stage.status === "active") {
      await advanceStageInTx(tx, stage);
    } else if (!allDone && stage.status === "done") {
      await revertStageInTx(tx, stage);
    }
  });
}

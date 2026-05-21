import type { Prisma } from "@prisma/client";
import {
  type JourneyKind, templateFor, taskTitleFor, taskDescriptionFor,
  type StageKind, type StageMode,
} from "@/lib/journeys/templates";

export async function createJourneyForClient(
  tx: Prisma.TransactionClient,
  clientId: string,
  kind: JourneyKind,
  videoCount: number,
): Promise<string> {
  if (videoCount < 1 || !Number.isInteger(videoCount)) {
    throw new Error(`videoCount must be a positive integer, got ${videoCount}`);
  }
  const template = templateFor(kind);

  const journey = await tx.journey.create({
    data: {
      clientId,
      kind,
      videoCount,
      status: "active",
      currentStageIndex: 0,
    },
  });

  for (const t of template) {
    await tx.journeyStage.create({
      data: {
        journeyId: journey.id,
        index: t.index,
        kind: t.kind,
        mode: t.mode,
        status: t.index === 0 ? "active" : "locked",
      },
    });
  }

  const activeStage = await tx.journeyStage.findFirstOrThrow({
    where: { journeyId: journey.id, index: 0 },
  });
  await materializeActiveStage(
    tx, journey.id, activeStage.id, template[0], videoCount, kind, template.length,
  );

  return journey.id;
}

export async function materializeActiveStage(
  tx: Prisma.TransactionClient,
  journeyId: string,
  stageId: string,
  template: { index: number; kind: StageKind; mode: StageMode },
  videoCount: number,
  journeyKind: JourneyKind,
  totalStages: number,
): Promise<void> {
  const journey = await tx.journey.findUniqueOrThrow({ where: { id: journeyId } });

  // Idempotency guard: any stray Task previously linked to this stage must be
  // removed first, otherwise the unique linkedStageId constraint blocks us.
  await tx.task.deleteMany({ where: { linkedStageId: stageId } });

  const task = await tx.task.create({
    data: {
      clientId: journey.clientId,
      space: "marketing",
      title: taskTitleFor(template.kind, journeyKind),
      description: taskDescriptionFor(template.index, totalStages, journeyKind),
      priority: "normal",
      status: "open",
      linkedStageId: stageId,
    },
  });
  await tx.journeyStage.update({
    where: { id: stageId },
    data: { taskId: task.id },
  });

  if (template.mode === "per_video") {
    await tx.journeyVideoItem.createMany({
      data: Array.from({ length: videoCount }, (_, i) => ({
        stageId,
        index: i + 1,
        done: false,
      })),
    });
  }
}

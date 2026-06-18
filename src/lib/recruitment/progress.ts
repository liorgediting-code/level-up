import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RECRUITMENT_STAGES } from "@/lib/recruitment/stages";

// Seeds the 4 stages for a recruitment client. Stage 0 active, rest locked.
// Caller is responsible for not double-seeding (used at client creation).
export async function seedStages(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
  for (const t of RECRUITMENT_STAGES) {
    await tx.recruitmentStage.create({
      data: {
        clientId,
        index: t.index,
        kind: t.kind,
        status: t.index === 0 ? "active" : "locked",
      },
    });
  }
}

// Mark the active stage done and activate the next one (if any).
export async function advanceStage(clientId: string, index: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.recruitmentStage.findUniqueOrThrow({
      where: { clientId_index: { clientId, index } },
    });
    if (stage.status !== "active") throw new Error("רק שלב פעיל ניתן לסמן כהושלם");

    await tx.recruitmentStage.update({
      where: { clientId_index: { clientId, index } },
      data: { status: "done", completedAt: new Date() },
    });

    const next = RECRUITMENT_STAGES.find((t) => t.index === index + 1);
    if (next) {
      await tx.recruitmentStage.update({
        where: { clientId_index: { clientId, index: next.index } },
        data: { status: "active" },
      });
    }
  });
}

// Revert a done stage back to active; cascade all later stages back to locked.
export async function revertStage(clientId: string, index: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stage = await tx.recruitmentStage.findUniqueOrThrow({
      where: { clientId_index: { clientId, index } },
    });
    if (stage.status !== "done") throw new Error("ניתן להחזיר רק שלב שהושלם");

    const later = await tx.recruitmentStage.findMany({
      where: { clientId, index: { gt: index } },
    });
    for (const l of later) {
      if (l.status === "locked") continue;
      await tx.recruitmentStage.update({
        where: { id: l.id },
        data: { status: "locked", completedAt: null },
      });
    }

    await tx.recruitmentStage.update({
      where: { clientId_index: { clientId, index } },
      data: { status: "active", completedAt: null },
    });
  });
}

export async function setStageNote(clientId: string, index: number, note: string): Promise<void> {
  await prisma.recruitmentStage.update({
    where: { clientId_index: { clientId, index } },
    data: { note },
  });
}

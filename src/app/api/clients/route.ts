import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createJourneyForClient } from "@/lib/journeys/create";
import { seedStages } from "@/lib/recruitment/progress";

export const runtime = "nodejs";

const JourneyInput = z.object({
  kind: z.enum(["organic", "paid"]),
  videoCount: z.number().int().min(1),
});

const Body = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  clientType: z.enum(["standard", "recruitment"]).default("standard"),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
  journeys: z.array(JourneyInput).optional(),
  pricePerSalesperson: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const kinds = (parsed.data.journeys ?? []).map((j) => j.kind);
  if (new Set(kinds).size !== kinds.length) {
    return NextResponse.json({ error: "duplicate journey kinds" }, { status: 400 });
  }

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        clientType: parsed.data.clientType,
        salesMeetingsTarget:
          parsed.data.clientType === "recruitment" ? null : parsed.data.salesMeetingsTarget ?? null,
      },
    });

    if (parsed.data.clientType === "recruitment") {
      await tx.recruitmentProfile.create({
        data: {
          clientId: created.id,
          pricePerSalesperson: parsed.data.pricePerSalesperson ?? null,
          currency: parsed.data.currency ?? "ILS",
        },
      });
      await seedStages(tx, created.id);
    } else {
      for (const j of parsed.data.journeys ?? []) {
        await createJourneyForClient(tx, created.id, j.kind, j.videoCount);
      }
    }
    return created;
  });

  return NextResponse.json(client);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createJourneyForClient } from "@/lib/journeys/create";

export const runtime = "nodejs";

const JourneyInput = z.object({
  kind: z.enum(["organic", "paid"]),
  videoCount: z.number().int().min(1),
});

const Body = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
  journeys: z.array(JourneyInput).optional(),
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
        salesMeetingsTarget: parsed.data.salesMeetingsTarget ?? null,
      },
    });
    for (const j of parsed.data.journeys ?? []) {
      await createJourneyForClient(tx, created.id, j.kind, j.videoCount);
    }
    return created;
  });

  return NextResponse.json(client);
}

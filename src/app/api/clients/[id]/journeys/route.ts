import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createJourneyForClient } from "@/lib/journeys/create";

export const runtime = "nodejs";

const Body = z.object({
  kind: z.enum(["organic", "paid"]),
  videoCount: z.number().int().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const existing = await prisma.journey.findUnique({
    where: { clientId_kind: { clientId, kind: parsed.data.kind } },
  });
  if (existing) {
    return NextResponse.json({ error: `client already has a ${parsed.data.kind} journey` }, { status: 409 });
  }

  const journeyId = await prisma.$transaction((tx) =>
    createJourneyForClient(tx, clientId, parsed.data.kind, parsed.data.videoCount),
  );
  return NextResponse.json({ id: journeyId });
}

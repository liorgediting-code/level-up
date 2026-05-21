import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  isAgencyOwned: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { isAgencyOwned: parsed.data.isAgencyOwned },
    select: { id: true, isAgencyOwned: true },
  });
  return NextResponse.json(updated);
}

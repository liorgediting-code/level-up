import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z
  .object({
    isAgencyOwned: z.boolean().optional(),
    kind: z.enum(["boost", "cta"]).nullable().optional(),
  })
  .refine((b) => b.isAgencyOwned !== undefined || b.kind !== undefined, {
    message: "nothing to update",
  });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const data: { isAgencyOwned?: boolean; kind?: string | null } = {};
  if (parsed.data.isAgencyOwned !== undefined) data.isAgencyOwned = parsed.data.isAgencyOwned;
  if (parsed.data.kind !== undefined) data.kind = parsed.data.kind;

  const updated = await prisma.campaign.update({
    where: { id },
    data,
    select: { id: true, isAgencyOwned: true, kind: true },
  });
  return NextResponse.json(updated);
}

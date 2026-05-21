import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { syncMeetingsToTarget } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  salesMeetingsTarget: z.number().int().min(0).nullable().optional(),
  endedAt: z.union([z.string(), z.null()]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const { endedAt, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (endedAt !== undefined) {
    if (endedAt === null || endedAt === "") {
      data.endedAt = null;
    } else {
      const d = new Date(endedAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "invalid endedAt" }, { status: 400 });
      }
      data.endedAt = d;
    }
  }

  const targetInBody = Object.prototype.hasOwnProperty.call(parsed.data, "salesMeetingsTarget");
  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.update({ where: { id }, data });
    const sync = targetInBody
      ? await syncMeetingsToTarget(tx, id, parsed.data.salesMeetingsTarget ?? null)
      : { created: 0, deleted: 0 };
    return { client, sync };
  });

  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

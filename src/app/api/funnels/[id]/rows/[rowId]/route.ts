import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Patch = z.object({ values: z.record(z.string(), z.number()) });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; rowId: string }> }
) {
  const { rowId } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const current = await prisma.funnelMetricRow.findUnique({
    where: { id: rowId },
    select: { valuesJson: true },
  });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const merged = {
    ...(JSON.parse(current.valuesJson || "{}") as Record<string, number>),
    ...parsed.data.values,
  };
  const row = await prisma.funnelMetricRow.update({
    where: { id: rowId },
    data: { valuesJson: JSON.stringify(merged) },
  });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; rowId: string }> }
) {
  const { rowId } = await ctx.params;
  await prisma.funnelMetricRow.delete({ where: { id: rowId } });
  return NextResponse.json({ ok: true });
}

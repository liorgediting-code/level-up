import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Patch = z.object({
  leads: z.number().int().nonnegative().optional(),
  revenue: z.number().int().nonnegative().optional(),
  customers: z.number().int().nonnegative().optional(),
  extra: z.record(z.string(), z.number()).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; rowId: string }> }
) {
  const { rowId } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { extra, ...builtins } = parsed.data;
  const current = await prisma.clientMetricRow.findUnique({
    where: { id: rowId },
    select: { extraJson: true },
  });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const merged = {
    ...(JSON.parse(current.extraJson || "{}") as Record<string, number>),
    ...(extra ?? {}),
  };
  const row = await prisma.clientMetricRow.update({
    where: { id: rowId },
    data: { ...builtins, extraJson: JSON.stringify(merged) },
  });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; rowId: string }> }
) {
  const { rowId } = await ctx.params;
  await prisma.clientMetricRow.delete({ where: { id: rowId } });
  return NextResponse.json({ ok: true });
}

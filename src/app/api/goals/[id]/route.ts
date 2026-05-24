import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Patch = z.object({
  label: z.string().min(1).max(120).optional(),
  unit: z.enum(["number", "currency", "percent"]).optional(),
  targetValue: z.number().int().nonnegative().optional(),
  actualValue: z.number().int().nonnegative().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const t = await prisma.target.update({ where: { id }, data: parsed.data });
  return NextResponse.json(t);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.target.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

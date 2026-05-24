import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = await prisma.funnel.findUnique({
    where: { id },
    include: {
      campaigns: { include: { campaign: { select: { id: true, name: true } } } },
      columns: { orderBy: { sortOrder: "asc" } },
      rows: { orderBy: { periodMonth: "desc" } },
    },
  });
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: f.id,
    name: f.name,
    description: f.description,
    campaigns: f.campaigns.map((c) => c.campaign),
    columns: f.columns,
    rows: f.rows.map((r) => ({
      id: r.id,
      periodMonth: r.periodMonth.toISOString(),
      values: JSON.parse(r.valuesJson || "{}") as Record<string, number>,
    })),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const f = await prisma.funnel.update({ where: { id }, data: parsed.data });
  return NextResponse.json(f);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.funnel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

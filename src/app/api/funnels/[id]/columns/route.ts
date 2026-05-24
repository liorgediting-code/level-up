import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/metrics";

export const runtime = "nodejs";

const Body = z.object({
  label: z.string().min(1).max(60),
  unit: z.enum(["number", "currency", "percent"]).default("number"),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const existing = await prisma.funnelMetricColumn.findMany({
    where: { funnelId: id },
    select: { key: true, sortOrder: true },
  });
  const taken = new Set(existing.map((c) => c.key));
  const base = slugify(parsed.data.label);
  let key = base;
  let i = 2;
  while (taken.has(key)) key = `${base}_${i++}`;
  const sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
  const col = await prisma.funnelMetricColumn.create({
    data: { funnelId: id, key, label: parsed.data.label, unit: parsed.data.unit, sortOrder },
  });
  return NextResponse.json(col, { status: 201 });
}

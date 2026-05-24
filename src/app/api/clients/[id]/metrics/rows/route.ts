import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeMonth } from "@/lib/metrics";

export const runtime = "nodejs";

const Body = z.object({ periodMonth: z.string().min(7) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const raw = parsed.data.periodMonth.length === 7
    ? `${parsed.data.periodMonth}-01`
    : parsed.data.periodMonth;
  const monthDate = normalizeMonth(raw);
  const row = await prisma.clientMetricRow.upsert({
    where: { clientId_periodMonth: { clientId: id, periodMonth: monthDate } },
    update: {},
    create: { clientId: id, periodMonth: monthDate },
  });
  return NextResponse.json(row, { status: 201 });
}

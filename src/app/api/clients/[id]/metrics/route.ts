import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [columns, rows] = await Promise.all([
    prisma.clientMetricColumn.findMany({
      where: { clientId: id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.clientMetricRow.findMany({
      where: { clientId: id },
      orderBy: { periodMonth: "desc" },
    }),
  ]);
  return NextResponse.json({
    columns,
    rows: rows.map((r) => ({
      id: r.id,
      periodMonth: r.periodMonth.toISOString(),
      leads: r.leads,
      revenue: r.revenue,
      customers: r.customers,
      extra: JSON.parse(r.extraJson || "{}") as Record<string, number>,
    })),
  });
}

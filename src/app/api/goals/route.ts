import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePeriodStart } from "@/lib/periods";

export const runtime = "nodejs";

const PeriodType = z.enum(["week", "month", "quarter", "year"]);
const Scope = z.enum(["income", "client", "metric"]);

const Body = z.object({
  periodType: PeriodType,
  periodStart: z.string().min(8), // any date inside the period
  scope: Scope,
  clientId: z.string().nullable().optional(),
  label: z.string().min(1).max(120),
  unit: z.enum(["number", "currency", "percent"]).default("number"),
  targetValue: z.number().int().nonnegative().default(0),
  actualValue: z.number().int().nonnegative().default(0),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pt = PeriodType.safeParse(url.searchParams.get("periodType") ?? "");
  const targets = await prisma.target.findMany({
    where: pt.success ? { periodType: pt.data } : {},
    orderBy: [{ periodStart: "desc" }, { createdAt: "asc" }],
    include: { client: { select: { id: true, name: true } } },
  });
  return NextResponse.json(
    targets.map((t) => ({
      id: t.id,
      periodType: t.periodType,
      periodStart: t.periodStart.toISOString(),
      scope: t.scope,
      clientId: t.clientId,
      clientName: t.client?.name ?? null,
      label: t.label,
      unit: t.unit,
      targetValue: t.targetValue,
      actualValue: t.actualValue,
    }))
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const d = parsed.data;
  const periodStart = normalizePeriodStart(d.periodType, d.periodStart);
  const t = await prisma.target.create({
    data: {
      periodType: d.periodType,
      periodStart,
      scope: d.scope,
      clientId: d.scope === "client" ? d.clientId ?? null : null,
      label: d.label,
      unit: d.unit,
      targetValue: d.targetValue,
      actualValue: d.actualValue,
    },
  });
  return NextResponse.json(t, { status: 201 });
}

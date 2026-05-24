import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

export async function GET() {
  const funnels = await prisma.funnel.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { campaigns: true } } },
  });
  return NextResponse.json(
    funnels.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      campaignCount: f._count.campaigns,
      updatedAt: f.updatedAt.toISOString(),
    }))
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const f = await prisma.funnel.create({
    data: { name: parsed.data.name, description: parsed.data.description ?? "" },
  });
  return NextResponse.json(f, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({ campaignIds: z.array(z.string()).max(500) });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  await prisma.$transaction([
    prisma.funnelCampaign.deleteMany({ where: { funnelId: id } }),
    prisma.funnelCampaign.createMany({
      data: parsed.data.campaignIds.map((cid) => ({ funnelId: id, campaignId: cid })),
    }),
    prisma.funnel.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}

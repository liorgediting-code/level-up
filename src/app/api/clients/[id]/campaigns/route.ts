import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({ campaignId: z.string().min(1) });
const PatchBody = z.object({
  campaignId: z.string().min(1),
  kind: z.enum(["boost", "cta"]).nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  await prisma.clientCampaign.upsert({
    where: { clientId_campaignId: { clientId: id, campaignId: parsed.data.campaignId } },
    update: {},
    create: { clientId: id, campaignId: parsed.data.campaignId },
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const json = await req.json();
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  await prisma.campaign.update({
    where: { id: parsed.data.campaignId },
    data: { kind: parsed.data.kind },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  await prisma.clientCampaign.delete({
    where: { clientId_campaignId: { clientId: id, campaignId } },
  });
  return NextResponse.json({ ok: true });
}

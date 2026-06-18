import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.recruitmentProfile.findUnique({ where: { clientId: id } });
  if (!profile) return NextResponse.json({ error: "לקוח השמה לא נמצא" }, { status: 404 });
  if (profile.pricePerSalesperson == null) {
    return NextResponse.json({ error: "יש להגדיר מחיר לאיש מכירות תחילה" }, { status: 409 });
  }
  await prisma.payment.create({
    data: {
      clientId: id,
      type: "closed",
      amount: profile.pricePerSalesperson,
      currency: profile.currency,
      source: "recruitment",
      note: "השמת איש מכירות",
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const last = await prisma.payment.findFirst({
    where: { clientId: id, source: "recruitment" },
    orderBy: { occurredAt: "desc" },
  });
  if (!last) return NextResponse.json({ error: "אין תשלומי השמה לביטול" }, { status: 409 });
  await prisma.payment.delete({ where: { id: last.id } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  type: z.enum(["closed", "paid", "owed"]),
  amount: z.number().finite(),
  currency: z.string().default("ILS"),
  note: z.string().optional(),
  occurredAt: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const p = parsed.data;
  const payment = await prisma.payment.create({
    data: {
      clientId: id,
      type: p.type,
      amount: p.amount,
      currency: p.currency,
      note: p.note,
      occurredAt: p.occurredAt ? new Date(p.occurredAt) : new Date(),
    },
  });
  return NextResponse.json(payment);
}

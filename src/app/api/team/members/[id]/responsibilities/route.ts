import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  label: z.string().min(1).max(120),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const maxOrder = await prisma.responsibility.aggregate({
    where: { memberId: id },
    _max: { order: true },
  });
  const resp = await prisma.responsibility.create({
    data: {
      memberId: id,
      label: parsed.data.label.trim(),
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json(
    { id: resp.id, label: resp.label, isAiHandled: resp.isAiHandled },
    { status: 201 }
  );
}

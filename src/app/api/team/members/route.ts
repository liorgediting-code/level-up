import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(60),
  role: z.string().max(80).default(""),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const maxOrder = await prisma.teamMember.aggregate({ _max: { order: true } });
  const member = await prisma.teamMember.create({
    data: {
      name: parsed.data.name.trim(),
      role: parsed.data.role.trim(),
      isAI: false,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json(
    { id: member.id, name: member.name, role: member.role, isAI: member.isAI },
    { status: 201 }
  );
}

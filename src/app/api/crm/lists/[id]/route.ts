import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Patch = z.object({ name: z.string().trim().min(1).max(120) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const list = await prisma.leadList.update({ where: { id }, data: { name: parsed.data.name } });
  return NextResponse.json({ id: list.id, name: list.name });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.leadList.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

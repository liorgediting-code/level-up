import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(60).optional(),
  role: z.string().max(80).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const data: Record<string, string> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.role !== undefined) data.role = parsed.data.role.trim();
  const member = await prisma.teamMember.update({ where: { id }, data });
  return NextResponse.json({ id: member.id, name: member.name, role: member.role });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const member = await prisma.teamMember.findUnique({ where: { id } });
  if (!member) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (member.isAI) return NextResponse.json({ error: "cannot delete AI member" }, { status: 400 });
  await prisma.teamMember.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

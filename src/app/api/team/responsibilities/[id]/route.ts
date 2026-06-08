import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  label: z.string().min(1).max(120).optional(),
  isAiHandled: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) data.label = parsed.data.label.trim();
  if (parsed.data.isAiHandled !== undefined) data.isAiHandled = parsed.data.isAiHandled;
  const resp = await prisma.responsibility.update({ where: { id }, data });
  return NextResponse.json({ id: resp.id, label: resp.label, isAiHandled: resp.isAiHandled });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.responsibility.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const PatchBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "problem", "done"]).optional(),
  assignee: z.enum(["liav", "lior"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const task = await prisma.teamTask.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ task });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.teamTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

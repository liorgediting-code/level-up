import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(["todo", "in_progress", "problem", "done"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const task = await prisma.targetTask.update({
    where: { id: taskId },
    data: parsed.data,
  });
  return NextResponse.json({ task });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  await prisma.targetTask.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/sales/tasks";
import { syncFromTaskStatusChange } from "@/lib/journeys/sync";

export const runtime = "nodejs";

const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (existing.linkedStageId && parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    try {
      await syncFromTaskStatusChange(id, parsed.data.status);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync failed";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    const nonStatus: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) nonStatus.title = parsed.data.title;
    if (parsed.data.description !== undefined) nonStatus.description = parsed.data.description;
    if (parsed.data.priority !== undefined) nonStatus.priority = parsed.data.priority;
    if (parsed.data.dueDate !== undefined) nonStatus.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    if (Object.keys(nonStatus).length > 0) {
      await prisma.task.update({ where: { id }, data: nonStatus });
    }
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    data.status = parsed.data.status;
    data.completedAt = parsed.data.status === "done" ? new Date() : null;
  }
  await prisma.task.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ ok: true });
  if (t.linkedStageId) {
    return NextResponse.json({ error: "linked to journey stage" }, { status: 409 });
  }
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

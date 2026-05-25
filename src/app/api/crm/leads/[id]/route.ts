import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveStatusesForList } from "@/lib/crm/statuses";

export const runtime = "nodejs";

const Patch = z.object({
  notes: z.string().optional(),
  statusId: z.string().optional(),
  markViewed: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const existing = await prisma.lead.findUnique({ where: { id }, include: { status: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Pre-validate new status is applicable to this lead's list before opening tx.
  let newStatus: { id: string; isDefault: boolean } | null = null;
  if (parsed.data.statusId && parsed.data.statusId !== existing.statusId) {
    const applicable = await resolveStatusesForList(existing.listId);
    const match = applicable.find((s) => s.id === parsed.data.statusId);
    if (!match) {
      return NextResponse.json({ error: "status not applicable to this list" }, { status: 400 });
    }
    newStatus = { id: match.id, isDefault: match.isDefault };
  }

  await prisma.$transaction(async (tx) => {
    const data: { notes?: string; statusId?: string; viewedAt?: Date; firstContactAt?: Date } = {};

    if (parsed.data.notes !== undefined && parsed.data.notes !== existing.notes) {
      data.notes = parsed.data.notes;
      await tx.leadActivity.create({
        data: {
          leadId: id,
          type: "note",
          payload: JSON.stringify({ length: parsed.data.notes.length }),
        },
      });
    }

    if (newStatus) {
      data.statusId = newStatus.id;
      if (!existing.firstContactAt && !newStatus.isDefault) {
        data.firstContactAt = new Date();
      }
      await tx.leadActivity.create({
        data: {
          leadId: id,
          type: "status_change",
          payload: JSON.stringify({ from: existing.statusId, to: newStatus.id }),
        },
      });
    }

    if (parsed.data.markViewed && !existing.viewedAt) {
      data.viewedAt = new Date();
    }

    if (Object.keys(data).length > 0) {
      await tx.lead.update({ where: { id }, data });
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: true });
  // Activities cascade-delete via the Lead relation.
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

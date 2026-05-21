import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  order: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isConvertedTarget: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const existing = await prisma.leadStatus.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Forbid demoting the only default in a scope to preserve the invariant.
  if (parsed.data.isDefault === false && existing.isDefault) {
    return NextResponse.json({ error: "set another status as default first" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault === true) {
      await tx.leadStatus.updateMany({
        where: { listId: existing.listId, NOT: { id } },
        data: { isDefault: false },
      });
    }
    if (parsed.data.isConvertedTarget === true) {
      await tx.leadStatus.updateMany({
        where: { listId: existing.listId, NOT: { id } },
        data: { isConvertedTarget: false },
      });
    }
    await tx.leadStatus.update({ where: { id }, data: parsed.data });
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.leadStatus.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const inUse = await prisma.lead.count({ where: { statusId: id } });
  if (inUse > 0) {
    return NextResponse.json({ error: `${inUse} leads still use this status` }, { status: 409 });
  }
  if (existing.isDefault) {
    // Allow only if another default exists in the same scope (e.g. just promoted).
    const otherDefault = await prisma.leadStatus.findFirst({
      where: { listId: existing.listId, isDefault: true, NOT: { id } },
    });
    if (!otherDefault) {
      return NextResponse.json({ error: "promote another status to default first" }, { status: 409 });
    }
  }
  await prisma.leadStatus.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

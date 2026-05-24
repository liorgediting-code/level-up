import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const PatchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.parentId === id) {
    return NextResponse.json({ error: "folder cannot be its own parent" }, { status: 400 });
  }
  const folder = await prisma.recordingFolder.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ folder });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Sessions detach automatically (folderId is SET NULL on delete).
  // Sub-folders also detach (parentId is SET NULL) — they become top-level.
  await prisma.recordingFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

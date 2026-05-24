import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      chunks: {
        where: { isFinal: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, text: true, startMs: true, endMs: true },
      },
    },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ session });
}

const PatchBody = z.object({
  title: z.string().max(200).nullable().optional(),
  folderId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const session = await prisma.transcriptSession.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ session });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.transcriptSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

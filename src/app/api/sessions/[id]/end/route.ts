import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTranscribeAuth } from "@/lib/transcribe/auth";

export const runtime = "nodejs";

const Body = z.object({ ended_at: z.string().nullish() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = requireTranscribeAuth(req);
  if (unauth) return unauth;
  const { id } = await ctx.params;

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json ?? {});
  const endedAt = parsed.success && parsed.data.ended_at ? new Date(parsed.data.ended_at) : new Date();

  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    select: { id: true, endedAt: true },
  });
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  await prisma.transcriptSession.update({
    where: { id },
    data: { endedAt: session.endedAt ?? endedAt },
  });

  return NextResponse.json({ ok: true });
}

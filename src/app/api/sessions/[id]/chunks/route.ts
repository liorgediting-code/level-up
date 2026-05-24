import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTranscribeAuth } from "@/lib/transcribe/auth";

export const runtime = "nodejs";

const Chunk = z.object({
  text: z.string(),
  is_final: z.boolean().default(true),
  start_ms: z.number().int().nonnegative().default(0),
  end_ms: z.number().int().nonnegative().default(0),
});
const Body = z.array(Chunk).min(1).max(500);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = requireTranscribeAuth(req);
  if (unauth) return unauth;
  const { id } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  await prisma.transcriptChunk.createMany({
    data: parsed.data.map((c) => ({
      sessionId: id,
      text: c.text,
      isFinal: c.is_final,
      startMs: c.start_ms,
      endMs: c.end_ms,
    })),
  });

  return NextResponse.json({ ok: true, count: parsed.data.length });
}

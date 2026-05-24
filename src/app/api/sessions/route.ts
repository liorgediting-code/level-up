import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTranscribeAuth } from "@/lib/transcribe/auth";

export const runtime = "nodejs";

const Body = z.object({
  title: z.string().nullish(),
  language: z.string().nullish(),
  clientId: z.string().nullish(),
  started_at: z.string().nullish(),
});

export async function POST(req: Request) {
  const unauth = requireTranscribeAuth(req);
  if (unauth) return unauth;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { title, language, clientId, started_at } = parsed.data;

  const session = await prisma.transcriptSession.create({
    data: {
      title: title || null,
      language: language || "he",
      clientId: clientId || null,
      startedAt: started_at ? new Date(started_at) : new Date(),
    },
    select: { id: true },
  });

  return NextResponse.json({ session_id: session.id });
}

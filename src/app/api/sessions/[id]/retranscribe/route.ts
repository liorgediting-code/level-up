import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { transcribe } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;

const TRANSCRIPTS_DIR = path.join(process.cwd(), "uploads", "transcripts");

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    select: { id: true, audioPath: true, audioMime: true, language: true },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Discover files: prefer dual {id}.tab.wav + {id}.mic.wav. Fall back to the
  // single legacy file at session.audioPath.
  const tabPath = path.join(TRANSCRIPTS_DIR, `${id}.tab.wav`);
  const micPath = path.join(TRANSCRIPTS_DIR, `${id}.mic.wav`);
  const haveTab = await exists(tabPath);
  const haveMic = await exists(micPath);
  const legacyPath = session.audioPath && !haveTab && !haveMic ? session.audioPath : null;

  if (!haveTab && !haveMic && !legacyPath) {
    return NextResponse.json({ error: "no audio stored for this session" }, { status: 400 });
  }

  await prisma.transcriptSession.update({
    where: { id },
    data: { transcribeStatus: "transcribing", transcribeError: null },
  });

  try {
    const lang = (session.language || "he").startsWith("he") ? "he" : (session.language || "he");
    const mime = session.audioMime || "audio/wav";

    const [tabRes, micRes, legacyRes] = await Promise.all([
      haveTab ? transcribe(tabPath, mime, lang) : Promise.resolve(null),
      haveMic ? transcribe(micPath, mime, lang) : Promise.resolve(null),
      legacyPath ? transcribe(legacyPath, mime, lang) : Promise.resolve(null),
    ]);

    type Row = { text: string; startMs: number; endMs: number; speaker: "user" | "other" };
    const rows: Row[] = [];
    const push = (res: { sentences: { text: string; start_ms: number; end_ms: number }[] } | null, sp: "user" | "other") => {
      if (!res) return;
      for (const s of res.sentences) {
        rows.push({ text: s.text, startMs: s.start_ms, endMs: s.end_ms, speaker: sp });
      }
    };
    push(tabRes, "other");
    push(micRes, "user");
    push(legacyRes, "other");
    rows.sort((a, b) => a.startMs - b.startMs);

    await prisma.$transaction([
      prisma.transcriptChunk.deleteMany({ where: { sessionId: id } }),
      prisma.transcriptChunk.createMany({
        data: rows.map((r) => ({
          sessionId: id,
          text: r.text,
          isFinal: true,
          startMs: r.startMs,
          endMs: r.endMs,
          speaker: r.speaker,
        })),
      }),
      prisma.transcriptSession.update({
        where: { id },
        data: { transcribeStatus: "ready", transcribeError: null },
      }),
    ]);

    return NextResponse.json({ ok: true, chunks: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.transcriptSession.update({
      where: { id },
      data: { transcribeStatus: "failed", transcribeError: msg.slice(0, 1000) },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function exists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

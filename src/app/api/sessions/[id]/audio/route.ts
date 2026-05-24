import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { prisma } from "@/lib/db";
import { requireTranscribeAuth } from "@/lib/transcribe/auth";
import { transcribe } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;

const TRANSCRIPTS_DIR = path.join(process.cwd(), "uploads", "transcripts");

type SpeakerLabel = "user" | "other";

// GET serves the stored audio for playback. No auth (single-user local app).
// ?track=mic|tab — defaults to mic if present, else tab, else legacy session.audioPath.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const track = url.searchParams.get("track");

  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    select: { audioPath: true, audioMime: true },
  });
  if (!session) return new NextResponse("not found", { status: 404 });

  const candidates: string[] = [];
  if (track === "mic") candidates.push(path.join(TRANSCRIPTS_DIR, `${id}.mic.wav`));
  else if (track === "tab") candidates.push(path.join(TRANSCRIPTS_DIR, `${id}.tab.wav`));
  else {
    candidates.push(path.join(TRANSCRIPTS_DIR, `${id}.mic.wav`));
    candidates.push(path.join(TRANSCRIPTS_DIR, `${id}.tab.wav`));
    if (session.audioPath) candidates.push(session.audioPath);
  }

  let filePath: string | null = null;
  let stat: import("node:fs").Stats | null = null;
  for (const p of candidates) {
    try {
      const s = await fs.stat(p);
      if (s.isFile()) { filePath = p; stat = s; break; }
    } catch {}
  }
  if (!filePath || !stat) return new NextResponse("audio not found", { status: 404 });

  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".wav" ? "audio/wav"
    : ext === ".webm" ? "audio/webm"
    : ext === ".mp3" ? "audio/mpeg"
    : (session.audioMime || "application/octet-stream");

  const size = stat.size;
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (start <= end && end < size) {
        const stream = createReadStream(filePath, { start, end });
        return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=0, must-revalidate",
          },
        });
      }
    }
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = requireTranscribeAuth(req);
  if (unauth) return unauth;
  const { id } = await ctx.params;

  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    select: { id: true, language: true },
  });
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart body" }, { status: 400 });
  }
  const mimeField = form.get("mime");
  const mime = typeof mimeField === "string" && mimeField ? mimeField : "audio/wav";

  // Accept either the new dual-file format (file_tab + file_mic) or the
  // legacy single `file` field (saved as tab).
  const fileTab = form.get("file_tab") instanceof Blob ? (form.get("file_tab") as Blob) : null;
  const fileMic = form.get("file_mic") instanceof Blob ? (form.get("file_mic") as Blob) : null;
  const legacy = form.get("file") instanceof Blob ? (form.get("file") as Blob) : null;

  const tabBlob = fileTab ?? legacy;
  const micBlob = fileMic;

  if (!tabBlob && !micBlob) {
    return NextResponse.json({ error: "missing file_tab/file_mic" }, { status: 400 });
  }

  await fs.mkdir(TRANSCRIPTS_DIR, { recursive: true });
  const tabPath = tabBlob ? path.join(TRANSCRIPTS_DIR, `${id}.tab.wav`) : null;
  const micPath = micBlob ? path.join(TRANSCRIPTS_DIR, `${id}.mic.wav`) : null;
  if (tabBlob && tabPath) await fs.writeFile(tabPath, Buffer.from(await tabBlob.arrayBuffer()));
  if (micBlob && micPath) await fs.writeFile(micPath, Buffer.from(await micBlob.arrayBuffer()));

  // Persist primary audioPath (prefer mic if available, else tab — UI just
  // uses this as a presence flag for "re-transcribe").
  await prisma.transcriptSession.update({
    where: { id },
    data: {
      audioPath: micPath ?? tabPath ?? undefined,
      audioMime: mime,
      transcribeStatus: "transcribing",
      transcribeError: null,
    },
  });

  try {
    const lang = (session.language || "he").startsWith("he") ? "he" : (session.language || "he");

    const [tabRes, micRes] = await Promise.all([
      tabPath ? transcribe(tabPath, mime, lang) : Promise.resolve(null),
      micPath ? transcribe(micPath, mime, lang) : Promise.resolve(null),
    ]);

    type Row = { text: string; isFinal: boolean; startMs: number; endMs: number; speaker: SpeakerLabel };
    const rows: Row[] = [];
    if (tabRes) {
      for (const s of tabRes.sentences) {
        rows.push({ text: s.text, isFinal: true, startMs: s.start_ms, endMs: s.end_ms, speaker: "other" });
      }
    }
    if (micRes) {
      for (const s of micRes.sentences) {
        rows.push({ text: s.text, isFinal: true, startMs: s.start_ms, endMs: s.end_ms, speaker: "user" });
      }
    }
    // Stable timeline order; preserve insertion order for ties.
    rows.sort((a, b) => a.startMs - b.startMs);

    await prisma.$transaction([
      prisma.transcriptChunk.deleteMany({ where: { sessionId: id } }),
      prisma.transcriptChunk.createMany({
        data: rows.map((r) => ({
          sessionId: id,
          text: r.text,
          isFinal: r.isFinal,
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

    return NextResponse.json({
      ok: true,
      chunks: rows.length,
      tab_chunks: tabRes?.sentences.length ?? 0,
      mic_chunks: micRes?.sentences.length ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.transcriptSession.update({
      where: { id },
      data: { transcribeStatus: "failed", transcribeError: msg.slice(0, 1000) },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

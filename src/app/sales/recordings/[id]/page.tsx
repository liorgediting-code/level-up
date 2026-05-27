import { notFound } from "next/navigation";
import Link from "next/link";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import RecordingClient from "./recording-client";

export const dynamic = "force-dynamic";

async function fileExists(p: string) {
  try { const s = await fs.stat(p); return s.isFile(); } catch { return false; }
}

export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, clients, folders] = await Promise.all([
    prisma.transcriptSession.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        chunks: {
          where: { isFinal: true },
          orderBy: [{ startMs: "asc" }, { createdAt: "asc" }],
          select: { id: true, text: true, startMs: true, endMs: true, speaker: true },
        },
      },
    }),
    prisma.client.findMany({
      where: { endedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.recordingFolder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!session) notFound();

  const durationMs =
    session.endedAt ? session.endedAt.getTime() - session.startedAt.getTime() : 0;

  const TR_DIR = path.join(process.cwd(), "uploads", "transcripts");
  const [hasMic, hasTab] = await Promise.all([
    fileExists(path.join(TR_DIR, `${session.id}.mic.wav`)),
    fileExists(path.join(TR_DIR, `${session.id}.tab.wav`)),
  ]);
  const hasLegacy = !hasMic && !hasTab && !!session.audioPath && (await fileExists(session.audioPath));

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted">
        <Link href="/sales" className="hover:text-fg">מכירות</Link> /{" "}
        <Link href="/sales" className="hover:text-fg">הקלטות</Link>
      </div>

      <RecordingClient
        id={session.id}
        title={session.title}
        startedAt={session.startedAt.toISOString()}
        endedAt={session.endedAt?.toISOString() ?? null}
        durationMs={durationMs}
        language={session.language}
        clientId={session.clientId}
        folderId={session.folderId}
        summary={session.summary}
        summaryKind={session.summaryKind}
        summaryGeneratedAt={session.summaryGeneratedAt?.toISOString() ?? null}
        transcribeStatus={session.transcribeStatus}
        transcribeError={session.transcribeError}
        clients={clients}
        folders={folders}
        chunks={session.chunks.map((c) => ({ id: c.id, text: c.text, startMs: c.startMs, endMs: c.endMs, speaker: c.speaker }))}
        hasMic={hasMic}
        hasTab={hasTab}
        hasLegacy={hasLegacy}
      />
    </div>
  );
}

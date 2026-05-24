import { prisma } from "@/lib/db";
import SalesRecordingsClient from "./sales-client";

export const dynamic = "force-dynamic";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const folderId = sp.folder || null;
  const q = (sp.q || "").trim();

  const [folders, sessions, clients, currentFolder] = await Promise.all([
    prisma.recordingFolder.findMany({
      where: { parentId: folderId },
      orderBy: { name: "asc" },
      include: { _count: { select: { sessions: true, children: true } } },
    }),
    prisma.transcriptSession.findMany({
      where: {
        folderId: folderId,
        ...(q ? { title: { contains: q } } : {}),
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        title: true,
        startedAt: true,
        endedAt: true,
        language: true,
        clientId: true,
        client: { select: { id: true, name: true } },
        _count: { select: { chunks: true } },
      },
    }),
    prisma.client.findMany({
      where: { endedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    folderId
      ? prisma.recordingFolder.findUnique({
          where: { id: folderId },
          include: { parent: { select: { id: true, name: true } } },
        })
      : Promise.resolve(null),
  ]);

  // Build breadcrumb up the tree.
  const crumbs: { id: string; name: string }[] = [];
  if (currentFolder) {
    let node: { id: string; name: string; parentId: string | null } | null = currentFolder as any;
    while (node) {
      crumbs.unshift({ id: node.id, name: node.name });
      if (!node.parentId) break;
      const next = await prisma.recordingFolder.findUnique({
        where: { id: node.parentId },
        select: { id: true, name: true, parentId: true },
      });
      node = next;
    }
  }

  return (
    <SalesRecordingsClient
      folderId={folderId}
      crumbs={crumbs}
      folders={folders.map((f) => ({
        id: f.id,
        name: f.name,
        clientId: f.clientId,
        sessionsCount: f._count.sessions,
        childrenCount: f._count.children,
      }))}
      sessions={sessions.map((s) => ({
        id: s.id,
        title: s.title,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        language: s.language,
        clientId: s.clientId,
        clientName: s.client?.name ?? null,
        chunksCount: s._count.chunks,
      }))}
      clients={clients}
      initialQuery={q}
    />
  );
}

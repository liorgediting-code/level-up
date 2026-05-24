import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const folderParam = url.searchParams.get("folderId"); // "null" | id | missing
  const clientId = url.searchParams.get("clientId");
  const q = url.searchParams.get("q")?.trim();

  const where: Record<string, unknown> = {};
  if (folderParam === "null") where.folderId = null;
  else if (folderParam) where.folderId = folderParam;
  if (clientId) where.clientId = clientId;
  if (q) where.title = { contains: q };

  const sessions = await prisma.transcriptSession.findMany({
    where,
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      title: true,
      language: true,
      startedAt: true,
      endedAt: true,
      folderId: true,
      clientId: true,
      summary: true,
      client: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      _count: { select: { chunks: true } },
    },
  });
  return NextResponse.json({ sessions });
}

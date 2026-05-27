import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  summarizeRecording,
  acquireSummaryLock,
  releaseSummaryLock,
  SummarizeError,
  MODEL_ID,
} from "@/lib/ai/summarize-recording";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ kind: z.enum(["meeting", "sales_call"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "kind חייב להיות meeting או sales_call" },
      { status: 400 }
    );
  }
  const { kind } = parsed.data;

  const session = await prisma.transcriptSession.findUnique({
    where: { id },
    include: {
      client: { select: { name: true } },
      chunks: {
        where: { isFinal: true },
        orderBy: [{ startMs: "asc" }, { createdAt: "asc" }],
        select: { text: true, startMs: true, endMs: true, speaker: true },
      },
    },
  });
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (!acquireSummaryLock(id)) {
    return NextResponse.json({ error: "כבר רץ סיכום" }, { status: 409 });
  }

  try {
    const result = await summarizeRecording({
      kind,
      chunks: session.chunks,
      clientName: session.client?.name ?? null,
      startedAt: session.startedAt,
      title: session.title,
    });

    const updated = await prisma.transcriptSession.update({
      where: { id },
      data: {
        summary: result.markdown,
        summaryJson: result.json as object,
        summaryKind: result.kind,
        summaryGeneratedAt: new Date(),
        summaryModel: MODEL_ID,
      },
      select: {
        summary: true,
        summaryJson: true,
        summaryKind: true,
        summaryGeneratedAt: true,
      },
    });

    return NextResponse.json({
      summary: updated.summary,
      summaryJson: updated.summaryJson,
      summaryKind: updated.summaryKind,
      summaryGeneratedAt: updated.summaryGeneratedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof SummarizeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[summarize] failed", err);
    return NextResponse.json({ error: "שגיאה בייצור סיכום" }, { status: 500 });
  } finally {
    releaseSummaryLock(id);
  }
}

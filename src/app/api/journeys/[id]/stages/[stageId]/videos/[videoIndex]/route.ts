import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleVideoItem } from "@/lib/journeys/advance";

export const runtime = "nodejs";

const Body = z.object({ done: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ stageId: string; videoIndex: string }> },
) {
  const { stageId, videoIndex } = await params;
  const idx = Number(videoIndex);
  if (!Number.isInteger(idx) || idx < 1) {
    return NextResponse.json({ error: "invalid videoIndex" }, { status: 400 });
  }
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  try {
    await toggleVideoItem(stageId, idx, parsed.data.done);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "toggle failed";
    const code = msg === "stage is not per_video" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
  return NextResponse.json({ ok: true });
}

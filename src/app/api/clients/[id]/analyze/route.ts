import { NextResponse } from "next/server";
import { z } from "zod";
import { runAnalysis } from "@/lib/ai/analyze-funnel";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ landingPageId: z.string().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  try {
    const result = await runAnalysis({ clientId: id, landingPageId: parsed.data.landingPageId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

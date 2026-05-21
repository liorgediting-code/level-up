import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { advanceActiveStage } from "@/lib/journeys/advance";

export const runtime = "nodejs";

// Accept any non-empty string for docLink (or null) — coerce bare domains to https://.
// Users type "example.com" and expect it to work.
const DocLink = z.string().trim().min(1).transform((v) => /^https?:\/\//i.test(v) ? v : `https://${v}`);

const Body = z.object({
  docLink: z.union([DocLink, z.null()]).optional(),
  filmingDate: z.string().datetime().nullable().optional(),
  markDone: z.literal(true).optional(),
});

function flattenZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: flattenZodError(parsed.error) }, { status: 400 });

  const stage = await prisma.journeyStage.findUnique({ where: { id: stageId } });
  if (!stage) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: { docLink?: string | null; filmingDate?: Date | null } = {};
  if (parsed.data.docLink !== undefined) data.docLink = parsed.data.docLink;
  if (parsed.data.filmingDate !== undefined) {
    data.filmingDate = parsed.data.filmingDate ? new Date(parsed.data.filmingDate) : null;
  }
  if (Object.keys(data).length > 0) {
    await prisma.journeyStage.update({ where: { id: stageId }, data });
  }

  if (parsed.data.markDone) {
    try {
      await advanceActiveStage(stageId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "advance failed";
      const code =
        msg === "stage not active" ? 409 :
        msg === "per_video stage cannot be marked done directly" ? 400 :
        msg === "filmingDate required" ? 409 :
        msg === "filmingDate is in the future" ? 409 :
        500;
      return NextResponse.json({ error: msg }, { status: code });
    }
  }
  return NextResponse.json({ ok: true });
}

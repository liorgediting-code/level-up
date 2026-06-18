import { NextResponse } from "next/server";
import { z } from "zod";
import { advanceStage, revertStage, setStageNote } from "@/lib/recruitment/progress";

export const runtime = "nodejs";

const Body = z.object({
  index: z.number().int().min(0).max(3),
  action: z.enum(["advance", "revert", "note"]),
  note: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "קלט לא תקין" }, { status: 400 });
  }
  const { index, action, note } = parsed.data;
  try {
    if (action === "advance") await advanceStage(id, index);
    else if (action === "revert") await revertStage(id, index);
    else await setStageNote(id, index, note ?? "");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

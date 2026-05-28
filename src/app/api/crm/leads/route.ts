import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { defaultStatusForList } from "@/lib/crm/statuses";

export const runtime = "nodejs";

// Keep the schema permissive — the client sends nulls for empty optional
// fields, and we don't want to bounce a real lead because the user left the
// email blank. We coerce to clean values in the handler below.
const Body = z.object({
  listId: z.string().min(1, "listId required"),
  name: z.string().min(1, "name required"),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function POST(req: Request) {
  let json: unknown = null;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return NextResponse.json({ error: msg || "invalid body" }, { status: 400 });
  }

  const name = parsed.data.name.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const phone = parsed.data.phone?.trim() || null;
  const emailRaw = parsed.data.email?.trim() || null;
  // Only enforce email shape when one was provided — empty is fine.
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  const email = emailRaw;
  const notes = parsed.data.notes?.trim() || "";

  try {
    const list = await prisma.leadList.findUnique({ where: { id: parsed.data.listId } });
    if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });

    const defaultStatus = await defaultStatusForList(list.id);

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          listId: list.id,
          name,
          phone,
          email,
          customFieldsJson: "{}",
          statusId: defaultStatus.id,
          notes,
          viewedAt: new Date(), // a manually-entered lead is inherently "seen"
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: created.id,
          type: "created",
          payload: JSON.stringify({ statusId: defaultStatus.id, source: "manual" }),
        },
      });
      return created;
    });

    return NextResponse.json({ leadId: lead.id }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[crm/leads POST] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { defaultStatusForList } from "@/lib/crm/statuses";

export const runtime = "nodejs";

const Body = z.object({
  listId: z.string().min(1),
  name: z.string().trim().min(1, "name required"),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const list = await prisma.leadList.findUnique({ where: { id: parsed.data.listId } });
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });

  const defaultStatus = await defaultStatusForList(list.id);

  const phone = parsed.data.phone?.trim() || null;
  const email = parsed.data.email?.trim() || null;

  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        listId: list.id,
        name: parsed.data.name.trim(),
        phone,
        email,
        customFieldsJson: "{}",
        statusId: defaultStatus.id,
        notes: parsed.data.notes ?? "",
        viewedAt: new Date(), // manual entries are inherently "seen" by the creator
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
}

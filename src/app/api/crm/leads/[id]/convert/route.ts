import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { convertedTargetForList } from "@/lib/crm/statuses";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (lead.convertedClientId) {
    return NextResponse.json({ error: "already converted", clientId: lead.convertedClientId }, { status: 409 });
  }

  const target = await convertedTargetForList(lead.listId);

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: { name: parsed.data.name, description: parsed.data.description ?? null },
    });
    await tx.lead.update({
      where: { id },
      data: {
        convertedClientId: client.id,
        statusId: target?.id ?? lead.statusId,
      },
    });
    await tx.leadActivity.create({
      data: {
        leadId: id,
        type: "converted",
        payload: JSON.stringify({ clientId: client.id }),
      },
    });
    return { clientId: client.id };
  });

  return NextResponse.json(result);
}

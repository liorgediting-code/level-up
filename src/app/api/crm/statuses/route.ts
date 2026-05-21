import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveStatusesForList } from "@/lib/crm/statuses";
import { ensureCrmDefaults } from "@/lib/crm/seed";

export const runtime = "nodejs";

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
  order: z.number().int().min(0).default(0),
  isDefault: z.boolean().default(false),
  isConvertedTarget: z.boolean().default(false),
  listId: z.string().nullable(),
});

export async function GET(req: Request) {
  await ensureCrmDefaults();
  const url = new URL(req.url);
  const listId = url.searchParams.get("listId");
  if (listId) {
    const set = await resolveStatusesForList(listId);
    return NextResponse.json(set);
  }
  const globals = await prisma.leadStatus.findMany({ where: { listId: null }, orderBy: { order: "asc" } });
  return NextResponse.json(globals);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Create.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.leadStatus.updateMany({
        where: { listId: parsed.data.listId },
        data: { isDefault: false },
      });
    }
    if (parsed.data.isConvertedTarget) {
      await tx.leadStatus.updateMany({
        where: { listId: parsed.data.listId },
        data: { isConvertedTarget: false },
      });
    }
    await tx.leadStatus.create({ data: parsed.data });
  });
  return NextResponse.json({ ok: true });
}

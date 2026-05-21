import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureCrmDefaults } from "@/lib/crm/seed";

export const runtime = "nodejs";

const Patch = z.object({
  notificationEmail: z.string().email().nullable(),
});

export async function GET() {
  await ensureCrmDefaults();
  const s = await prisma.crmSettings.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ notificationEmail: s?.notificationEmail ?? null });
}

export async function PATCH(req: Request) {
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  await ensureCrmDefaults();
  const s = await prisma.crmSettings.update({
    where: { id: "singleton" },
    data: { notificationEmail: parsed.data.notificationEmail },
  });
  return NextResponse.json({ notificationEmail: s.notificationEmail });
}

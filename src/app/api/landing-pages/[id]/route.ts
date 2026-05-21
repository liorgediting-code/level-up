import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lp = await prisma.landingPage.findUnique({ where: { id } });
  if (!lp) return NextResponse.json({ ok: true });
  for (const p of [lp.htmlPath, lp.imagePath, lp.screenshotPath]) {
    if (p) await fs.unlink(p).catch(() => {});
  }
  await prisma.landingPage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

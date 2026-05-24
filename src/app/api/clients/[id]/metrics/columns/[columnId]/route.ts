import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; columnId: string }> }
) {
  const { columnId } = await ctx.params;
  await prisma.clientMetricColumn.delete({ where: { id: columnId } });
  return NextResponse.json({ ok: true });
}

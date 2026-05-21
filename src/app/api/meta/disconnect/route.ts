import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  await prisma.metaConnection.deleteMany({});
  return NextResponse.json({ ok: true });
}

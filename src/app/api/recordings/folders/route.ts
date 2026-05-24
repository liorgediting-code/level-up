import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const folders = await prisma.recordingFolder.findMany({
    where: clientId ? { clientId } : {},
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ folders });
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().nullish(),
  clientId: z.string().nullish(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const folder = await prisma.recordingFolder.create({
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId || null,
      clientId: parsed.data.clientId || null,
    },
  });
  return NextResponse.json({ folder });
}

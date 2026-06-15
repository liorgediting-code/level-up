import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  title: z.string().min(1).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const task = await prisma.targetTask.create({
    data: { targetId: id, title: parsed.data.title },
  });
  return NextResponse.json({ task }, { status: 201 });
}

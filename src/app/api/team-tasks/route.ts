import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const CreateBody = z.object({
  assignee: z.enum(["liav", "lior"]),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "problem", "done"]).optional(),
});

export async function GET() {
  const tasks = await prisma.teamTask.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { assignee, title, description = "", status = "todo" } = parsed.data;
  const task = await prisma.teamTask.create({
    data: { assignee, title, description, status },
  });
  return NextResponse.json({ task }, { status: 201 });
}

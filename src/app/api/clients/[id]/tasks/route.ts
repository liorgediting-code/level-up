import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TASK_PRIORITIES, TASK_SPACES, TASK_STATUSES } from "@/lib/sales/tasks";

export const runtime = "nodejs";

const Body = z.object({
  space: z.enum(TASK_SPACES),
  title: z.string().trim().min(1).max(200),
  description: z.string().default(""),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(TASK_STATUSES).default("open"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const t = await prisma.task.create({
    data: {
      clientId,
      space: parsed.data.space,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      status: parsed.data.status,
      completedAt: parsed.data.status === "done" ? new Date() : null,
    },
  });
  return NextResponse.json({ id: t.id });
}

const Query = z.object({
  space: z.enum(TASK_SPACES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    space: url.searchParams.get("space") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const tasks = await prisma.task.findMany({
    where: {
      clientId,
      ...(parsed.data.space ? { space: parsed.data.space } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, dueDate: true, status: true, priority: true },
  });
  return NextResponse.json({ tasks });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERSISTED_MEETING_STATUSES } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Patch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(PERSISTED_MEETING_STATUSES).optional(),
  attendees: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
  whatWorked: z.string().optional(),
  whatToImprove: z.string().optional(),
  link: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.scheduledAt === null) {
    data.scheduledAt = null;
  } else if (parsed.data.scheduledAt) {
    data.scheduledAt = new Date(parsed.data.scheduledAt);
  }
  await prisma.meeting.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.meeting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERSISTED_MEETING_STATUSES } from "@/lib/sales/meetings";

export const runtime = "nodejs";

const Body = z.object({
  title: z.string().trim().min(1).max(160),
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(PERSISTED_MEETING_STATUSES).default("scheduled"),
  attendees: z.string().default(""),
  notes: z.string().default(""),
  outcome: z.string().default(""),
  whatWorked: z.string().default(""),
  whatToImprove: z.string().default(""),
  link: z.string().url().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const m = await prisma.meeting.create({
    data: {
      clientId,
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      status: parsed.data.status,
      attendees: parsed.data.attendees,
      notes: parsed.data.notes,
      outcome: parsed.data.outcome,
      whatWorked: parsed.data.whatWorked,
      whatToImprove: parsed.data.whatToImprove,
      link: parsed.data.link ?? null,
    },
  });
  return NextResponse.json({ id: m.id });
}

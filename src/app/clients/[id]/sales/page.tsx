import { prisma } from "@/lib/db";
import { effectiveStatus, listMeetingsForClient, type MeetingRange } from "@/lib/sales/meetings";
import SalesClient, { type MeetingRow } from "./sales-client";

export const dynamic = "force-dynamic";

export default async function SalesMeetingsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const range: MeetingRange = sp.range === "upcoming" || sp.range === "past" || sp.range === "all"
    ? (sp.range as MeetingRange) : "all";

  const [meetings, client] = await Promise.all([
    listMeetingsForClient(id, range),
    prisma.client.findUnique({ where: { id }, select: { name: true, salesMeetingsTarget: true } }),
  ]);

  const rows: MeetingRow[] = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
    persistedStatus: m.status as MeetingRow["persistedStatus"],
    effectiveStatus: effectiveStatus(m),
    attendees: m.attendees,
    notes: m.notes,
    outcome: m.outcome,
    whatWorked: m.whatWorked,
    whatToImprove: m.whatToImprove,
    link: m.link,
  }));

  return (
    <SalesClient
      clientId={id}
      clientName={client?.name ?? ""}
      range={range}
      meetings={rows}
      target={client?.salesMeetingsTarget ?? null}
    />
  );
}

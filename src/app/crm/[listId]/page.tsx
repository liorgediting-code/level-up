import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveStatusesForList } from "@/lib/crm/statuses";
import ListClient from "./list-client";

export const dynamic = "force-dynamic";

export default async function ListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  const list = await prisma.leadList.findUnique({ where: { id: listId } });
  if (!list) notFound();

  const [leads, statuses] = await Promise.all([
    prisma.lead.findMany({
      where: { listId },
      orderBy: { createdAt: "desc" },
      include: { status: true, activities: { orderBy: { createdAt: "desc" } } },
    }),
    resolveStatusesForList(listId),
  ]);

  return (
    <ListClient
      list={{ id: list.id, name: list.name }}
      statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, order: s.order, isDefault: s.isDefault }))}
      leads={leads.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        statusId: l.statusId,
        statusName: l.status.name,
        statusColor: l.status.color,
        utm: l.utmJson ? (JSON.parse(l.utmJson) as Record<string, string>) : null,
        customFields: JSON.parse(l.customFieldsJson) as Record<string, unknown>,
        notes: l.notes,
        viewedAt: l.viewedAt?.toISOString() ?? null,
        convertedClientId: l.convertedClientId,
        createdAt: l.createdAt.toISOString(),
        activities: l.activities.map((a) => ({
          id: a.id,
          type: a.type,
          payload: JSON.parse(a.payload),
          createdAt: a.createdAt.toISOString(),
        })),
      }))}
    />
  );
}

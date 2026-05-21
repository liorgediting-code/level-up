import { prisma } from "@/lib/db";
import { ensureCrmDefaults } from "@/lib/crm/seed";
import CrmClient from "./crm-client";

export const dynamic = "force-dynamic";

export default async function CrmIndexPage() {
  await ensureCrmDefaults();
  const lists = await prisma.leadList.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });
  const unread = await prisma.lead.groupBy({
    by: ["listId"],
    where: { viewedAt: null },
    _count: { _all: true },
  });
  const unreadMap = new Map(unread.map((u) => [u.listId, u._count._all]));
  return (
    <CrmClient
      lists={lists.map((l) => ({
        id: l.id,
        name: l.name,
        leadCount: l._count.leads,
        unreadCount: unreadMap.get(l.id) ?? 0,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}

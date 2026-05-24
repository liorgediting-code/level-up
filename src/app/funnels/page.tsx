import { prisma } from "@/lib/db";
import FunnelsClient from "./funnels-client";

export const dynamic = "force-dynamic";

export default async function FunnelsPage() {
  const funnels = await prisma.funnel.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { campaigns: true } } },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">משפכים</h1>
      </div>
      <FunnelsClient
        funnels={funnels.map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          campaignCount: f._count.campaigns,
          updatedAt: f.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}

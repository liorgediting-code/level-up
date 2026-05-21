import { prisma } from "@/lib/db";
import CampaignsClient from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function MarketingCampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, all] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: { campaigns: { include: { campaign: true } } },
    }),
    prisma.campaign.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!client) return null;
  const attached = client.campaigns.map((cc) => ({
    id: cc.campaign.id, name: cc.campaign.name, status: cc.campaign.status, objective: cc.campaign.objective,
  }));
  const allRows = all.map((c) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective }));
  return <CampaignsClient clientId={id} attached={attached} all={allRows} />;
}

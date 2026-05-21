import { prisma } from "@/lib/db";
import CampaignsClient from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [campaigns, clients, attachments] = await Promise.all([
    prisma.campaign.findMany({ orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.clientCampaign.findMany(),
  ]);
  const byCampaign = new Map<string, string[]>();
  for (const a of attachments) {
    const arr = byCampaign.get(a.campaignId) ?? [];
    arr.push(a.clientId);
    byCampaign.set(a.campaignId, arr);
  }
  const data = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective,
    isAgencyOwned: c.isAgencyOwned,
    clientIds: byCampaign.get(c.id) ?? [],
  }));
  return (
    <CampaignsClient
      campaigns={data}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}

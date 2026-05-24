import { prisma } from "@/lib/db";

export type RangeKey = "7d" | "30d" | "90d";

export function rangeStart(range: RangeKey) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function aggregateForClient(clientId: string, range: RangeKey = "30d") {
  const attached = await prisma.clientCampaign.findMany({
    where: { clientId },
    include: { campaign: true },
  });
  return aggregateForCampaigns(attached.map((a) => a.campaign), range);
}

export async function aggregateForCampaignIds(ids: string[], range: RangeKey = "30d") {
  if (!ids.length) return { totals: empty(), perCampaign: [] as PerCampaign[], campaigns: [] };
  const campaigns = await prisma.campaign.findMany({ where: { id: { in: ids } } });
  return aggregateForCampaigns(campaigns, range);
}

async function aggregateForCampaigns(
  attachedCampaigns: { id: string; name: string; status: string | null; objective: string | null }[],
  range: RangeKey
) {
  const since = rangeStart(range);
  const attached = attachedCampaigns.map((campaign) => ({ campaignId: campaign.id, campaign }));
  const ids = attached.map((a) => a.campaignId);
  if (!ids.length) {
    return { totals: empty(), perCampaign: [] as PerCampaign[], campaigns: [] };
  }
  const stats = await prisma.campaignDailyStat.findMany({
    where: { campaignId: { in: ids }, date: { gte: since } },
  });

  const totals = empty();
  const perCampaignMap = new Map<string, ReturnType<typeof empty>>();
  for (const s of stats) {
    totals.spend += s.spend;
    totals.impressions += s.impressions;
    totals.clicks += s.clicks;
    totals.leads += s.leads;
    totals.conversions += s.conversions;
    const cur = perCampaignMap.get(s.campaignId) ?? empty();
    cur.spend += s.spend;
    cur.impressions += s.impressions;
    cur.clicks += s.clicks;
    cur.leads += s.leads;
    cur.conversions += s.conversions;
    perCampaignMap.set(s.campaignId, cur);
  }
  totals.ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0;
  totals.costPerLead = totals.leads ? totals.spend / totals.leads : 0;
  totals.costPerConversion = totals.conversions ? totals.spend / totals.conversions : 0;

  const perCampaign: PerCampaign[] = attached.map((a) => {
    const t = perCampaignMap.get(a.campaignId) ?? empty();
    t.ctr = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
    t.cpm = t.impressions ? (t.spend / t.impressions) * 1000 : 0;
    t.costPerLead = t.leads ? t.spend / t.leads : 0;
    t.costPerConversion = t.conversions ? t.spend / t.conversions : 0;
    return { campaign: a.campaign, ...t };
  });

  return { totals, perCampaign, campaigns: attached.map((a) => a.campaign) };
}

function empty() {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpm: 0,
    leads: 0,
    costPerLead: 0,
    conversions: 0,
    costPerConversion: 0,
  };
}

export type PerCampaign = ReturnType<typeof empty> & {
  campaign: { id: string; name: string; status: string | null; objective: string | null };
};

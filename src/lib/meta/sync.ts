import { prisma } from "@/lib/db";
import { getActiveConnection } from "@/lib/meta/connection";
import { MetaClient } from "@/lib/meta/client";

// Meta reports the same lead under multiple action_types (e.g. `lead` is a
// rollup of `offsite_conversion.fb_pixel_lead` and `onsite_conversion.lead_grouped`).
// Summing them triple-counts. Pick a single canonical type, preferring the rollup.
const LEAD_TYPE_PRIORITY = [
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
];

function pickCanonical(
  rows: { action_type: string; value: string }[] | undefined,
  priority: string[],
): { type: string; value: number } | null {
  if (!rows) return null;
  for (const t of priority) {
    const r = rows.find((x) => x.action_type === t);
    if (r) {
      const v = Number(r.value);
      if (isFinite(v)) return { type: t, value: v };
    }
  }
  return null;
}

function num(v?: string) {
  if (!v) return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export async function runMetaSync(opts?: { days?: number }) {
  const days = opts?.days ?? 30;
  const conn = await getActiveConnection();
  if (!conn) throw new Error("Meta is not connected. Connect from Settings.");
  const client = new MetaClient(conn.accessToken);

  const accounts = await prisma.metaAccount.findMany({
    where: { connectionId: conn.id, enabled: true },
  });
  if (!accounts.length) {
    return { accounts: 0, campaigns: 0, statRows: 0 };
  }

  let totalCampaigns = 0;
  let statRows = 0;

  for (const acct of accounts) {
    const campaigns = await client.listCampaigns(acct.id);
    totalCampaigns += campaigns.length;

    for (const c of campaigns) {
      await prisma.campaign.upsert({
        where: { id: c.id },
        update: {
          adAccountId: acct.id,
          name: c.name,
          status: c.status ?? null,
          objective: c.objective ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          id: c.id,
          adAccountId: acct.id,
          name: c.name,
          status: c.status ?? null,
          objective: c.objective ?? null,
        },
      });

      const insights = await client.campaignInsights(c.id, days);
      for (const row of insights) {
        const leadPick = pickCanonical(row.actions, LEAD_TYPE_PRIORITY);
        const leads = leadPick?.value ?? 0;
        // For lead-gen campaigns "conversions" == leads; we don't sum unrelated
        // engagement actions (link_click, page_engagement, video_view, etc.)
        // because those over-count vs Meta's "All conversions" column.
        const conversions = leads;
        const cplPick = leadPick
          ? row.cost_per_action_type?.find((x) => x.action_type === leadPick.type)
          : undefined;
        const date = new Date(`${row.date_start}T00:00:00Z`);
        const spend = num(row.spend);
        const costPerLead = cplPick ? num(cplPick.value) : leads > 0 ? spend / leads : 0;
        const costPerConversion = costPerLead;
        await prisma.campaignDailyStat.upsert({
          where: { campaignId_date: { campaignId: c.id, date } },
          update: {
            spend,
            impressions: Math.round(num(row.impressions)),
            clicks: Math.round(num(row.clicks)),
            ctr: num(row.ctr),
            cpm: num(row.cpm),
            leads: Math.round(leads),
            costPerLead,
            conversions: Math.round(conversions),
            costPerConversion,
            actionsJson: JSON.stringify(row.actions ?? []),
          },
          create: {
            campaignId: c.id,
            date,
            spend,
            impressions: Math.round(num(row.impressions)),
            clicks: Math.round(num(row.clicks)),
            ctr: num(row.ctr),
            cpm: num(row.cpm),
            leads: Math.round(leads),
            costPerLead,
            conversions: Math.round(conversions),
            costPerConversion,
            actionsJson: JSON.stringify(row.actions ?? []),
          },
        });
        statRows++;
      }
    }

    await prisma.metaAccount.update({
      where: { id: acct.id },
      data: { lastSyncedAt: new Date() },
    });
  }

  return { accounts: accounts.length, campaigns: totalCampaigns, statRows };
}

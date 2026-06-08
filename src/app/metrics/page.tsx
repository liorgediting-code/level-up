import { prisma } from "@/lib/db";
import { parseDateRange } from "@/lib/metrics/date-range";
import MetricsClient from "./metrics-client";

export const dynamic = "force-dynamic";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const range = parseDateRange(sp.period ?? "month", sp.date ?? "");

  const [
    marketingAgg,
    topCampaigns,
    leadsIn,
    meetingsScheduled,
    meetingsHeld,
    dealsClosed,
    revenueReceived,
    revenueClosed,
    expenses,
  ] = await Promise.all([
    prisma.campaignDailyStat.aggregate({
      where: { date: { gte: range.start, lt: range.end } },
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
    }),
    prisma.campaign.findMany({
      where: { stats: { some: { date: { gte: range.start, lt: range.end } } } },
      select: {
        id: true,
        name: true,
        stats: {
          where: { date: { gte: range.start, lt: range.end } },
          select: { spend: true, leads: true },
        },
      },
    }),
    prisma.lead.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
    prisma.meeting.count({ where: { scheduledAt: { gte: range.start, lt: range.end } } }),
    prisma.meeting.count({
      where: { scheduledAt: { gte: range.start, lt: range.end }, status: "held" },
    }),
    prisma.payment.count({
      where: { occurredAt: { gte: range.start, lt: range.end }, type: "closed" },
    }),
    prisma.payment.aggregate({
      where: { occurredAt: { gte: range.start, lt: range.end }, type: "paid" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { occurredAt: { gte: range.start, lt: range.end }, type: "closed" },
      _sum: { amount: true },
    }),
    prisma.businessExpense.findMany({
      where: { date: { gte: range.start, lt: range.end } },
      orderBy: { date: "desc" },
    }),
  ]);

  const spend = marketingAgg._sum.spend ?? 0;
  const impressions = marketingAgg._sum.impressions ?? 0;
  const clicks = marketingAgg._sum.clicks ?? 0;
  const leads = marketingAgg._sum.leads ?? 0;
  const totalAdSpend = spend;
  const totalRevReceived = revenueReceived._sum.amount ?? 0;
  const totalGeneralExp = expenses.reduce((s, e) => s + e.amount, 0);

  const campaignRows = topCampaigns
    .map((c) => ({
      id: c.id,
      name: c.name,
      spend: c.stats.reduce((s, r) => s + (r.spend ?? 0), 0),
      leads: c.stats.reduce((s, r) => s + (r.leads ?? 0), 0),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  return (
    <MetricsClient
      range={{
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label,
        periodKind: range.periodKind,
        periodKey: range.periodKey,
      }}
      marketing={{
        spend,
        impressions,
        clicks,
        leads,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        cpl: leads ? spend / leads : 0,
        cpm: impressions ? (spend / impressions) * 1000 : 0,
      }}
      campaigns={campaignRows}
      sales={{
        leadsIn,
        meetingsScheduled,
        meetingsHeld,
        dealsClosed,
        revenueReceived: totalRevReceived,
        revenueClosed: revenueClosed._sum.amount ?? 0,
        convLeadToMeeting: leadsIn ? (meetingsScheduled / leadsIn) * 100 : 0,
        convMeetingToClose: meetingsHeld ? (dealsClosed / meetingsHeld) * 100 : 0,
      }}
      pnl={{
        revenueReceived: totalRevReceived,
        adSpend: totalAdSpend,
        generalExpenses: totalGeneralExp,
        netProfit: totalRevReceived - totalAdSpend - totalGeneralExp,
      }}
      expenses={expenses.map((e) => ({
        id: e.id,
        label: e.label,
        amount: e.amount,
        date: e.date.toISOString(),
        category: e.category,
      }))}
    />
  );
}

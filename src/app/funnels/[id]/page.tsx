import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { MetricUnit } from "@/lib/metrics";
import { aggregateForCampaignIds, type RangeKey } from "@/lib/meta/aggregate";
import { fmtInt, fmtPct, fmtIls } from "@/lib/utils";
import { StatCard } from "@/app/_shell/stat-card";
import Link from "next/link";
import FunnelClient from "./funnel-client";

export const dynamic = "force-dynamic";

export default async function FunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range: rRaw } = await searchParams;
  const range: RangeKey = rRaw === "7d" || rRaw === "90d" ? rRaw : "30d";

  const [funnel, allCampaigns] = await Promise.all([
    prisma.funnel.findUnique({
      where: { id },
      include: {
        campaigns: { include: { campaign: { select: { id: true, name: true } } } },
        columns: { orderBy: { sortOrder: "asc" } },
        rows: { orderBy: { periodMonth: "desc" } },
      },
    }),
    prisma.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!funnel) notFound();

  const attachedIds = funnel.campaigns.map((c) => c.campaign.id);
  const agg = await aggregateForCampaignIds(attachedIds, range);

  const ranges: { key: RangeKey; label: string }[] = [
    { key: "7d", label: "7 ימים" },
    { key: "30d", label: "30 ימים" },
    { key: "90d", label: "90 ימים" },
  ];

  return (
    <div className="space-y-6">
      <FunnelClient
        id={funnel.id}
        name={funnel.name}
        description={funnel.description}
        attachedCampaignIds={attachedIds}
        allCampaigns={allCampaigns}
        columns={funnel.columns.map((c) => ({
          id: c.id,
          key: c.key,
          label: c.label,
          unit: c.unit as MetricUnit,
        }))}
        rows={funnel.rows.map((r) => ({
          id: r.id,
          periodMonth: r.periodMonth.toISOString(),
          values: JSON.parse(r.valuesJson || "{}") as Record<string, number>,
        }))}
      />

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">נתוני קמפיינים (Meta)</h2>
          <div className="inline-flex rounded-xl border border-border bg-bg p-1">
            {ranges.map((r) => {
              const active = range === r.key;
              return (
                <Link
                  key={r.key}
                  href={`/funnels/${id}?range=${r.key}`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-accent text-white" : "text-muted hover:text-fg"
                  }`}
                >
                  {r.label}
                </Link>
              );
            })}
          </div>
        </div>

        {attachedIds.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted">
            שייך קמפיינים למשפך כדי לראות נתוני ביצועים מ-Meta.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <StatCard tone="red" label="הוצאה" value={fmtIls(agg.totals.spend)} />
              <StatCard tone="blue" label="חשיפות" value={fmtInt(agg.totals.impressions)} />
              <StatCard tone="violet" label="קליקים" value={fmtInt(agg.totals.clicks)} sub={`CTR ${fmtPct(agg.totals.ctr)}`} />
              <StatCard tone="amber" label="CPM" value={fmtIls(agg.totals.cpm)} />
              <StatCard tone="pink" label="לידים" value={fmtInt(agg.totals.leads)} sub={`עלות לליד ${fmtIls(agg.totals.costPerLead)}`} />
              <StatCard tone="green" label="המרות" value={fmtInt(agg.totals.conversions)} sub={`עלות להמרה ${fmtIls(agg.totals.costPerConversion)}`} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full">
                <thead className="bg-bg">
                  <tr>
                    <th className="table-th">קמפיין</th>
                    <th className="table-th">הוצאה</th>
                    <th className="table-th">חשיפות</th>
                    <th className="table-th">CTR</th>
                    <th className="table-th">CPM</th>
                    <th className="table-th">לידים</th>
                    <th className="table-th">עלות/ליד</th>
                    <th className="table-th">המרות</th>
                    <th className="table-th">עלות/המרה</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.perCampaign.map((c) => (
                    <tr key={c.campaign.id}>
                      <td className="table-td">
                        <div className="font-medium">{c.campaign.name}</div>
                        {c.campaign.objective && (
                          <div className="text-xs text-muted">{c.campaign.objective}</div>
                        )}
                      </td>
                      <td className="table-td num">{fmtIls(c.spend)}</td>
                      <td className="table-td num">{fmtInt(c.impressions)}</td>
                      <td className="table-td num">{fmtPct(c.ctr)}</td>
                      <td className="table-td num">{fmtIls(c.cpm)}</td>
                      <td className="table-td num">{fmtInt(c.leads)}</td>
                      <td className="table-td num">{fmtIls(c.costPerLead)}</td>
                      <td className="table-td num">{fmtInt(c.conversions)}</td>
                      <td className="table-td num">{fmtIls(c.costPerConversion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

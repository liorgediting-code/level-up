import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { aggregateForClient, type RangeKey } from "@/lib/meta/aggregate";
import { fmtInt, fmtPct, fmtIls } from "@/lib/utils";
import { StatCard } from "@/app/_shell/stat-card";
import type { PerCampaign } from "@/lib/meta/aggregate";

export const dynamic = "force-dynamic";

function CampaignTable({ clientId, title, rows }: { clientId: string; title: string; rows: PerCampaign[] }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="text-base font-semibold">{title}</div>
          <div className="text-xs text-muted">{rows.length} קמפיינים פעילים בטווח</div>
        </div>
        <Link href={`/clients/${clientId}/marketing/campaigns`} className="text-sm font-medium text-accent hover:text-accent-ink">
          ניהול קמפיינים →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-elevated">
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
            {rows.map((c) => (
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
            {!rows.length && (
              <tr>
                <td className="table-td text-muted" colSpan={9}>
                  אין קמפיינים בקבוצה זו.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ClientDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range: rRaw } = await searchParams;
  const range: RangeKey = rRaw === "7d" || rRaw === "90d" ? rRaw : "30d";

  const client = await prisma.client.findUnique({ where: { id }, include: { payments: true } });
  if (!client) notFound();
  const agg = await aggregateForClient(id, range);

  const closed = client.payments.filter((p) => p.type === "closed").reduce((s, p) => s + p.amount, 0);
  const paid = client.payments.filter((p) => p.type === "paid").reduce((s, p) => s + p.amount, 0);
  const outstanding = closed - paid;

  const ranges: { key: RangeKey; label: string }[] = [
    { key: "7d", label: "7 ימים" },
    { key: "30d", label: "30 ימים" },
    { key: "90d", label: "90 ימים" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">ביצועי שיווק</h2>
        <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
          {ranges.map((r) => {
            const active = range === r.key;
            return (
              <Link
                key={r.key}
                href={`/clients/${id}/marketing/dashboard?range=${r.key}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-accent text-white shadow-card" : "text-muted hover:text-fg"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard tone="red"    label="הוצאה"     value={fmtIls(agg.totals.spend)} />
        <StatCard tone="blue"   label="חשיפות"   value={fmtInt(agg.totals.impressions)} />
        <StatCard tone="violet" label="קליקים"   value={fmtInt(agg.totals.clicks)} sub={`CTR ${fmtPct(agg.totals.ctr)}`} />
        <StatCard tone="amber"  label="CPM"       value={fmtIls(agg.totals.cpm)} />
        <StatCard tone="pink"   label="לידים"    value={fmtInt(agg.totals.leads)} sub={`עלות לליד ${fmtIls(agg.totals.costPerLead)}`} />
        <StatCard tone="green"  label="המרות"    value={fmtInt(agg.totals.conversions)} sub={`עלות להמרה ${fmtIls(agg.totals.costPerConversion)}`} />
        <StatCard tone="slate"  label="נסגר"      value={fmtIls(closed)} />
        <StatCard tone="blue"   label="יתרה"      value={fmtIls(outstanding)} />
      </div>

      {!agg.perCampaign.length ? (
        <div className="card text-sm text-muted">
          לא חוברו קמפיינים.{" "}
          <Link href={`/clients/${id}/marketing/campaigns`} className="font-medium text-accent hover:text-accent-ink">
            עבור לדף הקמפיינים כדי לחבר ←
          </Link>
        </div>
      ) : (
        <>
          <CampaignTable
            clientId={id}
            title="קמפיינים"
            rows={agg.perCampaign.filter((c) => c.campaign.kind !== "boost")}
          />
          <CampaignTable
            clientId={id}
            title="הקפצות"
            rows={agg.perCampaign.filter((c) => c.campaign.kind === "boost")}
          />
        </>
      )}
    </div>
  );
}

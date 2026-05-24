import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtIls, publicUrlForUpload } from "./helpers";
import ClientPortfolio from "./portfolio-client";
import { StatCard } from "@/app/_shell/stat-card";
import MetricsTable, { type Column, type Row } from "@/components/metrics-table";
import type { MetricUnit } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      links: { orderBy: { id: "desc" } },
      payments: { orderBy: { occurredAt: "desc" } },
      landingPages: { orderBy: { createdAt: "desc" } },
      analysisRuns: { orderBy: { startedAt: "desc" }, take: 10 },
    },
  });
  if (!client) notFound();

  const [metricColumnsDb, metricRowsDb] = await Promise.all([
    prisma.clientMetricColumn.findMany({
      where: { clientId: id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.clientMetricRow.findMany({
      where: { clientId: id },
      orderBy: { periodMonth: "desc" },
    }),
  ]);
  const metricColumns: Column[] = [
    { key: "leads", label: "לידים", unit: "number", builtin: true },
    { key: "revenue", label: "הכנסות", unit: "currency", builtin: true },
    { key: "customers", label: "לקוחות", unit: "number", builtin: true },
    ...metricColumnsDb.map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      unit: c.unit as MetricUnit,
    })),
  ];
  const metricRows: Row[] = metricRowsDb.map((r) => {
    const extra = JSON.parse(r.extraJson || "{}") as Record<string, number>;
    return {
      id: r.id,
      periodMonth: r.periodMonth.toISOString(),
      values: { leads: r.leads, revenue: r.revenue, customers: r.customers, ...extra },
    };
  });

  const recordings = await prisma.transcriptSession.findMany({
    where: { clientId: id },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      startedAt: true,
      endedAt: true,
      _count: { select: { chunks: true } },
    },
  });

  const closed = client.payments.filter((p) => p.type === "closed").reduce((s, p) => s + p.amount, 0);
  const paid = client.payments.filter((p) => p.type === "paid").reduce((s, p) => s + p.amount, 0);
  const owed = client.payments.filter((p) => p.type === "owed").reduce((s, p) => s + p.amount, 0);
  const outstanding = closed - paid;

  const lps = client.landingPages.map((lp) => ({
    ...lp,
    createdAt: lp.createdAt.toISOString(),
    screenshotUrl: lp.screenshotPath ? publicUrlForUpload(lp.screenshotPath) : null,
  }));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard tone="green" label="נסגר" value={fmtIls(closed)} />
        <StatCard tone="blue"  label="שולם" value={fmtIls(paid)} />
        <StatCard tone="red"   label="יתרה לתשלום" value={fmtIls(outstanding)} />
        <StatCard tone="amber" label="הצעה" value={fmtIls(owed)} sub="ממתינה לסגירה" />
      </div>

      <ClientPortfolio
        clientId={client.id}
        description={client.description}
        links={client.links}
        payments={client.payments.map((p) => ({ ...p, occurredAt: p.occurredAt.toISOString() }))}
        landingPages={lps}
        analysisRuns={client.analysisRuns.map((r) => ({
          id: r.id,
          status: r.status,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt?.toISOString() ?? null,
          model: r.model,
        }))}
      />

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-base font-semibold">מדדים חודשיים</h2>
        <MetricsTable columns={metricColumns} rows={metricRows} kind="client" targetId={client.id} />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">הקלטות מכירה</h2>
          <a href={`/sales?folder=`} className="text-xs text-accent hover:underline">לכל ההקלטות ←</a>
        </div>
        {recordings.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted">
            עדיין לא שויכו הקלטות ללקוח זה.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recordings.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <a href={`/sales/recordings/${r.id}`} className="min-w-0 flex-1 hover:text-accent">
                  <div className="truncate">{r.title || `הקלטה ${new Date(r.startedAt).toLocaleString("he-IL")}`}</div>
                  <div className="text-[11px] text-muted">
                    {new Date(r.startedAt).toLocaleString("he-IL")} · {r._count.chunks} שורות
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}


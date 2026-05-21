import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtIls, publicUrlForUpload } from "./helpers";
import ClientPortfolio from "./portfolio-client";
import { StatCard } from "@/app/_shell/stat-card";

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
    </div>
  );
}


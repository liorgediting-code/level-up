import { prisma } from "@/lib/db";
import GoalsClient from "./goals-client";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const [targets, clients] = await Promise.all([
    prisma.target.findMany({
      orderBy: [{ periodStart: "desc" }, { createdAt: "asc" }],
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.client.findMany({
      where: { endedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">מטרות</h1>
      <GoalsClient
        clients={clients}
        targets={targets.map((t) => ({
          id: t.id,
          periodType: t.periodType as "week" | "month" | "quarter" | "year",
          periodStart: t.periodStart.toISOString(),
          scope: t.scope as "income" | "client" | "metric",
          clientId: t.clientId,
          clientName: t.client?.name ?? null,
          label: t.label,
          unit: t.unit as "number" | "currency" | "percent",
          targetValue: t.targetValue,
          actualValue: t.actualValue,
        }))}
      />
    </div>
  );
}

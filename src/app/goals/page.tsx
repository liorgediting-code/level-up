import { prisma } from "@/lib/db";
import GoalsClient from "./goals-client";
import type { PeriodType } from "@/lib/periods";

export const dynamic = "force-dynamic";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = (["week", "month", "quarter", "year"].includes(tab ?? "") ? tab : "month") as PeriodType;

  const [targets, clients] = await Promise.all([
    prisma.target.findMany({
      orderBy: [{ periodStart: "desc" }, { createdAt: "asc" }],
      include: {
        client: { select: { id: true, name: true } },
        tasks: { orderBy: { createdAt: "asc" } },
      },
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
        initialTab={initialTab}
        clients={clients}
        targets={targets.map((t) => ({
          id: t.id,
          periodType: t.periodType as PeriodType,
          periodStart: t.periodStart.toISOString(),
          scope: t.scope as "income" | "client" | "metric",
          clientId: t.clientId,
          clientName: t.client?.name ?? null,
          label: t.label,
          unit: t.unit as "number" | "currency" | "percent",
          targetValue: t.targetValue,
          actualValue: t.actualValue,
          tasks: t.tasks.map((tk) => ({
            id: tk.id,
            title: tk.title,
            status: tk.status as "todo" | "in_progress" | "problem" | "done",
          })),
        }))}
      />
    </div>
  );
}

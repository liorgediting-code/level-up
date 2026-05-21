import { prisma } from "@/lib/db";
import {
  defaultRange, leadsOverTime, conversionByList, conversionByUtmSource,
  avgTimeToFirstContactMs, funnel, formatDuration,
} from "@/lib/crm/metrics";
import MetricsClient from "./metrics-client";

export const dynamic = "force-dynamic";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ listId?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.days) || 30));
  const range = defaultRange(days);
  const listId = sp.listId || undefined;

  const [overTime, byList, byUtm, avgMs, fun, lists] = await Promise.all([
    leadsOverTime(range, listId),
    conversionByList(range),
    conversionByUtmSource(range, listId),
    avgTimeToFirstContactMs(range, listId),
    listId ? funnel(listId) : Promise.resolve([]),
    prisma.leadList.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <MetricsClient
      filters={{ days, listId: listId ?? "" }}
      lists={lists}
      overTime={overTime}
      byList={byList}
      byUtm={byUtm}
      avgContact={avgMs !== null ? formatDuration(avgMs) : null}
      funnel={fun}
    />
  );
}

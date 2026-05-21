import { prisma } from "@/lib/db";

export type DateRange = { from: Date; to: Date };

export function defaultRange(days = 30): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export async function leadsOverTime(range: DateRange, listId?: string) {
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: range.from, lte: range.to }, ...(listId ? { listId } : {}) },
    select: { createdAt: true, listId: true, utmJson: true },
  });
  const byDay = new Map<string, number>();
  for (const l of leads) {
    const day = l.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

export async function conversionByList(range: DateRange) {
  const lists = await prisma.leadList.findMany({ select: { id: true, name: true } });
  const out = [];
  for (const l of lists) {
    const total = await prisma.lead.count({
      where: { listId: l.id, createdAt: { gte: range.from, lte: range.to } },
    });
    const converted = await prisma.lead.count({
      where: { listId: l.id, createdAt: { gte: range.from, lte: range.to }, convertedClientId: { not: null } },
    });
    out.push({ listId: l.id, name: l.name, total, converted, rate: total === 0 ? 0 : converted / total });
  }
  return out;
}

export async function conversionByUtmSource(range: DateRange, listId?: string) {
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: range.from, lte: range.to }, ...(listId ? { listId } : {}) },
    select: { utmJson: true, convertedClientId: true },
  });
  const buckets = new Map<string, { total: number; converted: number }>();
  for (const l of leads) {
    let src = "(no source)";
    if (l.utmJson) {
      try {
        const u = JSON.parse(l.utmJson) as Record<string, string>;
        if (u.source) src = u.source;
      } catch {}
    }
    const b = buckets.get(src) ?? { total: 0, converted: 0 };
    b.total++;
    if (l.convertedClientId) b.converted++;
    buckets.set(src, b);
  }
  return Array.from(buckets.entries()).map(([source, b]) => ({
    source, total: b.total, converted: b.converted, rate: b.total === 0 ? 0 : b.converted / b.total,
  }));
}

export async function avgTimeToFirstContactMs(range: DateRange, listId?: string): Promise<number | null> {
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      firstContactAt: { not: null },
      ...(listId ? { listId } : {}),
    },
    select: { createdAt: true, firstContactAt: true },
  });
  if (leads.length === 0) return null;
  const total = leads.reduce((s, l) => s + (l.firstContactAt!.getTime() - l.createdAt.getTime()), 0);
  return total / leads.length;
}

export async function funnel(listId: string) {
  const { resolveStatusesForList } = await import("@/lib/crm/statuses");
  const statuses = await resolveStatusesForList(listId);
  const out = [];
  for (const s of statuses) {
    const count = await prisma.lead.count({ where: { listId, statusId: s.id } });
    out.push({ statusId: s.id, name: s.name, color: s.color, order: s.order, count });
  }
  return out;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}ש' ${m}ד'`;
}

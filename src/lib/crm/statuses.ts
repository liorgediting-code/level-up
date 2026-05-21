// src/lib/crm/statuses.ts
import { prisma } from "@/lib/db";
import type { LeadStatus } from "@prisma/client";

/**
 * Returns the statuses applicable to a list. If the list has any of its own
 * overrides, returns ONLY those (sorted by order). Otherwise returns global
 * statuses (listId IS NULL).
 */
export async function resolveStatusesForList(listId: string): Promise<LeadStatus[]> {
  const overrides = await prisma.leadStatus.findMany({
    where: { listId },
    orderBy: { order: "asc" },
  });
  if (overrides.length > 0) return overrides;
  return prisma.leadStatus.findMany({
    where: { listId: null },
    orderBy: { order: "asc" },
  });
}

export async function defaultStatusForList(listId: string): Promise<LeadStatus> {
  const set = await resolveStatusesForList(listId);
  const def = set.find((s) => s.isDefault) ?? set[0];
  if (!def) throw new Error("No statuses configured for list " + listId);
  return def;
}

export async function convertedTargetForList(listId: string): Promise<LeadStatus | null> {
  const set = await resolveStatusesForList(listId);
  return set.find((s) => s.isConvertedTarget) ?? null;
}

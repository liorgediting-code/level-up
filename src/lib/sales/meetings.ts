import { prisma } from "@/lib/db";
import type { Meeting, Prisma } from "@prisma/client";

export type MeetingStatus = "scheduled" | "pending_update" | "held" | "cancelled" | "no_show";
export const PERSISTED_MEETING_STATUSES = ["scheduled", "held", "cancelled", "no_show"] as const;

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "נקבעה",
  pending_update: "ממתינה לעדכון",
  held: "התקיימה",
  cancelled: "בוטלה",
  no_show: "לא הגיעו",
};

export const MEETING_STATUS_COLOR: Record<MeetingStatus, string> = {
  scheduled: "#3b82f6",
  pending_update: "#f59e0b",
  held: "#10b981",
  cancelled: "#64748b",
  no_show: "#ef4444",
};

// A placeholder (scheduledAt = null) never projects to pending_update.
export function effectiveStatus(m: Pick<Meeting, "status" | "scheduledAt">, now: Date = new Date()): MeetingStatus {
  if (m.status === "scheduled" && m.scheduledAt != null && m.scheduledAt < now) return "pending_update";
  return m.status as MeetingStatus;
}

export type MeetingRange = "upcoming" | "past" | "all";

// Order is canonical: dated meetings by scheduledAt asc, then placeholders by createdAt asc.
// SQLite sorts NULLs first by default on ASC, so we sort in two passes via raw orderBy.
export async function listMeetingsForClient(clientId: string, range: MeetingRange = "all") {
  const now = new Date();
  if (range === "upcoming") {
    return prisma.meeting.findMany({
      where: { clientId, scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
    });
  }
  if (range === "past") {
    return prisma.meeting.findMany({
      where: { clientId, scheduledAt: { lt: now } },
      orderBy: { scheduledAt: "desc" },
    });
  }
  // "all" — dated rows first ordered by scheduledAt asc, placeholders (null) last by createdAt asc.
  const dated = await prisma.meeting.findMany({
    where: { clientId, scheduledAt: { not: null } },
    orderBy: { scheduledAt: "asc" },
  });
  const placeholders = await prisma.meeting.findMany({
    where: { clientId, scheduledAt: null },
    orderBy: { createdAt: "asc" },
  });
  return [...dated, ...placeholders];
}

export async function countHeldMeetings(clientId: string): Promise<number> {
  return prisma.meeting.count({ where: { clientId, status: "held" } });
}

export type SyncResult = { created: number; deleted: number; warning?: string };

// Materialize / trim placeholders so total meeting count matches target.
// MUST be called inside a $transaction (caller passes tx).
export async function syncMeetingsToTarget(
  tx: Prisma.TransactionClient,
  clientId: string,
  target: number | null,
): Promise<SyncResult> {
  if (target == null || target <= 0) return { created: 0, deleted: 0 };

  const count = await tx.meeting.count({ where: { clientId } });
  if (count === target) return { created: 0, deleted: 0 };

  if (count < target) {
    const toCreate = target - count;
    await tx.meeting.createMany({
      data: Array.from({ length: toCreate }, () => ({
        clientId,
        title: "פגישה",
        scheduledAt: null,
      })),
    });
    return { created: toCreate, deleted: 0 };
  }

  // count > target — delete placeholders only (newest first), capped at count - target.
  const surplus = count - target;
  const placeholders = await tx.meeting.findMany({
    where: { clientId, scheduledAt: null },
    orderBy: { createdAt: "desc" },
    take: surplus,
    select: { id: true },
  });
  if (placeholders.length === 0) {
    return {
      created: 0,
      deleted: 0,
      warning: `היעד (${target}) נמוך ממספר הפגישות הקיימות עם תאריך`,
    };
  }
  await tx.meeting.deleteMany({ where: { id: { in: placeholders.map((p) => p.id) } } });
  const warning = placeholders.length < surplus
    ? `היעד (${target}) נמוך ממספר הפגישות הקיימות עם תאריך — חלק לא נמחקו`
    : undefined;
  return { created: 0, deleted: placeholders.length, warning };
}

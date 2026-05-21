import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtIls(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(n || 0);
}

export function fmtInt(n: number) {
  return new Intl.NumberFormat("he-IL").format(Math.round(n || 0));
}

export function fmtPct(n: number, digits = 2) {
  return `${(n || 0).toFixed(digits)}%`;
}

export function daysAgo(d: number) {
  const dt = new Date();
  dt.setUTCHours(0, 0, 0, 0);
  dt.setUTCDate(dt.getUTCDate() - d);
  return dt;
}

export function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function monthLabel(d = new Date()) {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(d);
}

export type MonthRange = {
  start: Date;
  end: Date;
  label: string;
  key: string;
  isCurrent: boolean;
};

/**
 * Parse `YYYY-MM` to a UTC month range. Invalid/missing input ⇒ current month.
 * `end` is the first day of the following month (use with Prisma `lt:`).
 */
export function monthRange(monthKey?: string | null): MonthRange {
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let key = currentKey;

  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
    const [y, m] = monthKey.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m - 1;
      key = monthKey;
    }
  }

  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const label = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(start);
  return { start, end, label, key, isCurrent: key === currentKey };
}

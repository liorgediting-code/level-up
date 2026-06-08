export type PeriodKind = "year" | "month" | "week" | "day";

export type DateRange = {
  start: Date;
  end: Date;
  label: string;
  periodKind: PeriodKind;
  periodKey: string; // normalised key used in URL ?date= param
};

/** Parse URL search params `period` and `date` into a UTC date range. Falls back to current month. */
export function parseDateRange(kind: string, date: string): DateRange {
  const now = new Date();
  const k: PeriodKind = (["year", "month", "week", "day"] as const).includes(kind as PeriodKind)
    ? (kind as PeriodKind)
    : "month";

  if (k === "year") {
    const y = /^\d{4}$/.test(date) ? Number(date) : now.getUTCFullYear();
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      end: new Date(Date.UTC(y + 1, 0, 1)),
      label: `${y}`,
      periodKind: k,
      periodKey: String(y),
    };
  }

  if (k === "month") {
    const defaultKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = /^\d{4}-\d{2}$/.test(date) ? date : defaultKey;
    const [y, mo] = key.split("-").map(Number);
    const start = new Date(Date.UTC(y, mo - 1, 1));
    const end = new Date(Date.UTC(y, mo, 1));
    const label = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(start);
    return { start, end, label, periodKind: k, periodKey: key };
  }

  if (k === "week") {
    let year: number;
    let week: number;
    const m = /^(\d{4})-W(\d{2})$/.exec(date);
    if (m) {
      year = Number(m[1]);
      week = Number(m[2]);
    } else {
      // current ISO week
      const d = new Date();
      const dow = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dow);
      year = d.getUTCFullYear();
      const jan1 = new Date(Date.UTC(year, 0, 1));
      week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
    }
    const start = isoWeekStart(year, week);
    const end = new Date(start.getTime() + 7 * 86400000);
    const periodKey = `${year}-W${String(week).padStart(2, "0")}`;
    return { start, end, label: `שבוע ${week}, ${year}`, periodKind: k, periodKey };
  }

  // day
  const defaultDay = now.toISOString().slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : defaultDay;
  const [dy, dm, dd] = day.split("-").map(Number);
  const start = new Date(Date.UTC(dy, dm - 1, dd));
  const end = new Date(Date.UTC(dy, dm - 1, dd + 1));
  const label = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
  return { start, end, label, periodKind: k, periodKey: day };
}

function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4.getTime() - (dow - 1) * 86400000);
  return new Date(firstMonday.getTime() + (week - 1) * 7 * 86400000);
}

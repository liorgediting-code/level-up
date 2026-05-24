export type PeriodType = "week" | "month" | "quarter" | "year";

export const PERIOD_TYPES: PeriodType[] = ["week", "month", "quarter", "year"];

export const PERIOD_LABEL: Record<PeriodType, string> = {
  week: "שבוע",
  month: "חודש",
  quarter: "רבעון",
  year: "שנה",
};

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Normalize any date to the start of its containing period (UTC midnight).
// Weeks start on Sunday (Israeli convention).
export function normalizePeriodStart(periodType: PeriodType, input: string | Date): Date {
  const d = utcMidnight(typeof input === "string" ? new Date(input) : input);
  if (periodType === "week") {
    const day = d.getUTCDay(); // 0 = Sunday
    d.setUTCDate(d.getUTCDate() - day);
    return d;
  }
  if (periodType === "month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  if (periodType === "quarter") {
    const q = Math.floor(d.getUTCMonth() / 3);
    return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
  }
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

export function periodLabelHe(periodType: PeriodType, start: Date): string {
  const y = start.getUTCFullYear();
  if (periodType === "year") return `${y}`;
  if (periodType === "quarter") {
    const q = Math.floor(start.getUTCMonth() / 3) + 1;
    return `Q${q} ${y}`;
  }
  if (periodType === "month") {
    const months = [
      "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
      "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
    ];
    return `${months[start.getUTCMonth()]} ${y}`;
  }
  // week
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (x: Date) =>
    `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${fmt(start)}–${fmt(end)} ${y}`;
}

// The default reference date (today) used when adding a target for a period type.
export function currentPeriodStart(periodType: PeriodType): Date {
  return normalizePeriodStart(periodType, new Date());
}

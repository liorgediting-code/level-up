export type MetricUnit = "number" | "currency" | "percent";

export function normalizeMonth(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabelHe(d: Date): string {
  const months = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatValue(value: number, unit: MetricUnit): string {
  if (unit === "currency") return `₪${Math.round(value / 100).toLocaleString("he-IL")}`;
  if (unit === "percent") return `${value}%`;
  return value.toLocaleString("he-IL");
}

export function slugify(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || `col_${Date.now()}`;
}

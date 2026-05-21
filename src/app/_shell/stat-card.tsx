import type { ReactNode } from "react";

type Tone = "blue" | "green" | "red" | "amber" | "pink" | "violet" | "slate";

const TONES: Record<Tone, { dot: string; ring: string }> = {
  blue:   { dot: "oklch(0.56 0.22 258)", ring: "oklch(0.56 0.22 258 / 0.14)" },
  green:  { dot: "oklch(0.66 0.17 150)", ring: "oklch(0.66 0.17 150 / 0.14)" },
  red:    { dot: "oklch(0.62 0.22 25)",  ring: "oklch(0.62 0.22 25 / 0.14)" },
  amber:  { dot: "oklch(0.74 0.16 75)",  ring: "oklch(0.74 0.16 75 / 0.16)" },
  pink:   { dot: "oklch(0.65 0.22 0)",   ring: "oklch(0.65 0.22 0 / 0.14)" },
  violet: { dot: "oklch(0.58 0.22 295)", ring: "oklch(0.58 0.22 295 / 0.14)" },
  slate:  { dot: "oklch(0.55 0.02 250)", ring: "oklch(0.55 0.02 250 / 0.12)" },
};

export function StatCard({
  label,
  value,
  sub,
  tone = "blue",
  delta,
  trailing,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  trailing?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
            style={{ background: t.ring }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.dot }} />
          </span>
          <span className="label truncate">{label}</span>
        </div>
        {trailing}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="num text-[28px] font-bold leading-none tracking-tight">{value}</div>
        {delta && (
          <span
            className={
              delta.direction === "up"
                ? "pill-good"
                : delta.direction === "down"
                ? "pill-bad"
                : "pill-muted"
            }
          >
            {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "·"}
            <span className="num">{delta.value}</span>
          </span>
        )}
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

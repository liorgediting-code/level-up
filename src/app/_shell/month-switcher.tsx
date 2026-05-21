"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Props = {
  monthKey: string;
  label: string;
  isCurrent: boolean;
};

function shift(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function MonthSwitcher({ monthKey, label, isCurrent }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(nextKey: string | null) {
    const params = new URLSearchParams(search.toString());
    if (nextKey === null) params.delete("m");
    else params.set("m", nextKey);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      router.push(url);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5">
      <button
        onClick={() => go(shift(monthKey, -1))}
        disabled={pending}
        aria-label="חודש קודם"
        className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        ‹
      </button>
      <div className="min-w-[6.5rem] text-center text-sm font-semibold">{label}</div>
      <button
        onClick={() => go(shift(monthKey, 1))}
        disabled={pending}
        aria-label="חודש הבא"
        className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        ›
      </button>
      {!isCurrent && (
        <button
          onClick={() => go(null)}
          disabled={pending}
          className="ms-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-elevated disabled:opacity-50"
        >
          היום
        </button>
      )}
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}`;
  const onPortfolio = pathname === base;
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b border-border">
        <Link
          href={base}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            onPortfolio ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          פורטפוליו
        </Link>
      </nav>
      {onPortfolio && (
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href={`${base}/sales`}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M4 19V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11" />
                  <path d="M8 12h8M8 16h5" />
                </svg>
              </div>
              <span className="text-muted transition-transform group-hover:-translate-x-1">→</span>
            </div>
            <div className="mt-4">
              <div className="text-lg font-semibold">אימון מכירות</div>
              <div className="mt-1 text-sm text-muted">פגישות והערות, משימות אימון מכירות</div>
            </div>
          </Link>
          <Link
            href={`${base}/marketing/dashboard`}
            className="group relative overflow-hidden rounded-2xl border border-transparent bg-accent p-6 text-white shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M4 19V5M4 19h16" />
                  <path d="M7 15v-3M11 15V9M15 15v-5M19 15V7" />
                </svg>
              </div>
              <span className="text-white/80 transition-transform group-hover:-translate-x-1">→</span>
            </div>
            <div className="mt-4">
              <div className="text-lg font-semibold">שיווק</div>
              <div className="mt-1 text-sm text-white/80">דשבורד, דפי נחיתה, חומרים, ניתוח AI, קמפיינים</div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

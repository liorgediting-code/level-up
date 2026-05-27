"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import NotesPanel from "@/components/notes-panel";

const NAV = [
  { href: "/", label: "סקירה כללית", icon: HomeIcon },
  { href: "/clients", label: "לקוחות", icon: UsersIcon },
  { href: "/goals", label: "מטרות", icon: TargetIcon },
  { href: "/funnels", label: "משפכים", icon: FunnelIcon },
  { href: "/sales", label: "מכירות", icon: MicIcon },
  { href: "/campaigns", label: "קמפיינים", icon: MegaphoneIcon },
  { href: "/crm", label: "CRM", icon: InboxIcon, badgeKey: "unread" as const },
  { href: "/settings", label: "הגדרות", icon: GearIcon },
];

export default function AppShell({
  unread,
  children,
}: {
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [dark, setDark] = useState(false);
  useEffect(() => {
    // Sync to the attribute set pre-paint by the layout FOUC script.
    setDark(document.documentElement.getAttribute("data-mode") === "dark");
  }, []);
  function toggleDark() {
    const next = !dark;
    const root = document.documentElement;
    if (next) {
      root.setAttribute("data-mode", "dark");
      try { localStorage.setItem("astral-mode", "dark"); } catch {}
    } else {
      root.removeAttribute("data-mode");
      try { localStorage.removeItem("astral-mode"); } catch {}
    }
    setDark(next);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const clientMatch = /^\/clients\/([^/]+)(?:\/|$)/.exec(pathname);
  const funnelMatch = /^\/funnels\/([^/]+)(?:\/|$)/.exec(pathname);
  const noteScope = clientMatch
    ? { scope: "client" as const, targetId: clientMatch[1] }
    : funnelMatch
    ? { scope: "funnel" as const, targetId: funnelMatch[1] }
    : null;

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 z-20 hidden h-screen w-64 shrink-0 flex-col border-l border-border bg-surface p-4 shadow-sidebar md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2 pt-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-card">
            <span className="text-base font-bold">ל</span>
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight">לבל אפ</div>
            <div className="truncate text-[10px] leading-tight text-muted">סוכנות שיווק ואימון מכירות</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((n) => {
            const active = isActive(n.href);
            const Icon = n.icon;
            const badge = n.badgeKey === "unread" ? unread : 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-item ${active ? "nav-item-active" : ""}`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`h-[18px] w-[18px] ${active ? "opacity-100" : "opacity-70"}`} />
                  <span>{n.label}</span>
                </span>
                {badge > 0 && (
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold num ${
                      active ? "bg-white/20 text-white" : "bg-accent text-white"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-2xl bg-accent-soft p-4 text-accent-ink">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em]">טיפ</div>
          <div className="mt-1 text-sm leading-snug">
            סנכרנו את נתוני מטא מדף הקמפיינים כדי לראות מדדים מעודכנים.
          </div>
        </div>

        <button
          onClick={toggleDark}
          title={dark ? "מצב יום" : "מצב לילה"}
          aria-label={dark ? "עבור למצב יום" : "עבור למצב לילה"}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:bg-elevated hover:text-fg"
        >
          {dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
          <span>{dark ? "מצב יום" : "מצב לילה"}</span>
        </button>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-6 py-6 lg:px-10 lg:py-8">{children}</div>
      </main>

      {noteScope && <NotesPanel scope={noteScope.scope} targetId={noteScope.targetId} />}
    </div>
  );
}

function MoonIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
function SunIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function FunnelIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </svg>
  );
}
function TargetIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

/* ---------- inline icons (1.5px stroke, hand-tuned) ---------- */
function HomeIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-4v-6h-7v6h-4a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}
function UsersIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 19c.6-3 3.3-4.75 6.25-4.75S14.65 16 15.25 19" />
      <path d="M16 4.5a3 3 0 0 1 0 6" />
      <path d="M17.5 14.25c2.4.4 4.1 1.95 4.5 4.75" />
    </svg>
  );
}
function MegaphoneIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 10v4a2 2 0 0 0 2 2h2l8 4V4l-8 4H6a2 2 0 0 0-2 2Z" />
      <path d="M19 9a3.5 3.5 0 0 1 0 6" />
    </svg>
  );
}
function InboxIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 13.5 6 5h12l2 8.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5.5Z" />
      <path d="M4 13.5h4l1.25 2h5.5L16 13.5h4" />
    </svg>
  );
}
function MicIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 12a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18.5V21" />
      <path d="M9 21h6" />
    </svg>
  );
}
function GearIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2L5.1 6 3.1 9.3l2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.6a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

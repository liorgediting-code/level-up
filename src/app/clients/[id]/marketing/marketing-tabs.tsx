"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "דשבורד" },
  { href: "/landing", label: "דף נחיתה" },
  { href: "/materials", label: "חומרים" },
  { href: "/analyze", label: "ניתוח AI" },
  { href: "/campaigns", label: "קמפיינים" },
  { href: "/journeys", label: "מסלולים" },
  { href: "/tasks", label: "משימות" },
];

export default function MarketingTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}/marketing`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const href = `${base}${t.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.href}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

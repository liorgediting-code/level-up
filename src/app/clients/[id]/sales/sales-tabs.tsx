"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "פגישות" },
  { href: "/tasks", label: "משימות" },
];

export default function SalesTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}/sales`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
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

import Link from "next/link";
import { prisma } from "@/lib/db";
import NewClientForm from "./new-client-form";
import ClientRowActions from "./client-row-actions";
import { fmtIls } from "@/lib/utils";

export const dynamic = "force-dynamic";

type View = "active" | "past";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: vRaw } = await searchParams;
  const view: View = vRaw === "past" ? "past" : "active";

  const [clients, activeCount, pastCount] = await Promise.all([
    prisma.client.findMany({
      where: view === "past" ? { endedAt: { not: null } } : { endedAt: null },
      orderBy: view === "past" ? { endedAt: "desc" } : { createdAt: "desc" },
      include: {
        _count: { select: { campaigns: true, landingPages: true } },
        payments: true,
      },
    }),
    prisma.client.count({ where: { endedAt: null } }),
    prisma.client.count({ where: { endedAt: { not: null } } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold tracking-tight">לקוחות</h1>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
        <ViewTab href="/clients?view=active" active={view === "active"} label="פעילים" count={activeCount} />
        <ViewTab href="/clients?view=past" active={view === "past"} label="עבר" count={pastCount} />
      </div>

      {view === "active" && <NewClientForm />}

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-elevated">
            <tr>
              <th className="table-th">שם</th>
              <th className="table-th">קמפיינים</th>
              <th className="table-th">דפי נחיתה</th>
              <th className="table-th">יתרה לתשלום</th>
              {view === "past" && <th className="table-th">תאריך סיום</th>}
              <th className="table-th text-left"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const closed = c.payments.filter((p) => p.type === "closed").reduce((s, p) => s + p.amount, 0);
              const paid = c.payments.filter((p) => p.type === "paid").reduce((s, p) => s + p.amount, 0);
              const outstanding = closed - paid;
              return (
                <tr key={c.id}>
                  <td className="table-td">
                    <Link href={`/clients/${c.id}`} className="font-medium hover:text-accent">
                      {c.name}
                    </Link>
                    {c.description && <div className="text-xs text-muted">{c.description}</div>}
                  </td>
                  <td className="table-td num">{c._count.campaigns}</td>
                  <td className="table-td num">{c._count.landingPages}</td>
                  <td className="table-td num">{fmtIls(outstanding)}</td>
                  {view === "past" && (
                    <td className="table-td num text-muted">
                      {c.endedAt ? c.endedAt.toISOString().slice(0, 10) : "—"}
                    </td>
                  )}
                  <td className="table-td text-left">
                    <div className="flex items-center justify-end gap-2">
                      <Link className="btn-ghost" href={`/clients/${c.id}`}>פתח</Link>
                      <ClientRowActions
                        clientId={c.id}
                        clientName={c.name}
                        endedAt={c.endedAt ? c.endedAt.toISOString() : null}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {!clients.length && (
              <tr>
                <td className="table-td text-muted" colSpan={view === "past" ? 6 : 5}>
                  {view === "past" ? "אין לקוחות בעבר." : "אין עדיין לקוחות."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ViewTab({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-accent text-white shadow-card" : "text-muted hover:text-fg"
      }`}
    >
      {label}
      <span
        className={`num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
          active ? "bg-white/20 text-white" : "bg-elevated text-muted"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

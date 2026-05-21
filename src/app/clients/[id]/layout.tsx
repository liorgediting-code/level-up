import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ClientTabs from "./client-tabs";
import ClientRowActions from "../client-row-actions";

export default async function ClientLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, endedAt: true },
  });
  if (!client) notFound();

  const endedIso = client.endedAt ? client.endedAt.toISOString() : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/clients" className="text-xs text-muted hover:text-fg">
            → כל הלקוחות
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold tracking-tight">{client.name}</h1>
            {endedIso && (
              <span className="pill-muted">
                לקוח עבר · {endedIso.slice(0, 10)}
              </span>
            )}
          </div>
          {client.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted">{client.description}</p>
          )}
        </div>
        <ClientRowActions
          clientId={client.id}
          clientName={client.name}
          endedAt={endedIso}
          redirectAfterDelete="/clients"
        />
      </div>
      <ClientTabs clientId={client.id} />
      <div>{children}</div>
    </div>
  );
}

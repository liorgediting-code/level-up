import Link from "next/link";
import { countHeldMeetings } from "@/lib/sales/meetings";
import { prisma } from "@/lib/db";
import SalesTabs from "./sales-tabs";
import MeetingsCounter from "./meetings-counter";

export default async function SalesLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [held, client] = await Promise.all([
    countHeldMeetings(id),
    prisma.client.findUnique({ where: { id }, select: { salesMeetingsTarget: true } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link href={`/clients/${id}`} className="text-xs text-muted hover:text-accent">← חזרה לפורטפוליו</Link>
          <h1 className="mt-1 text-2xl font-semibold">אימון מכירות</h1>
        </div>
        <MeetingsCounter clientId={id} held={held} target={client?.salesMeetingsTarget ?? null} />
      </div>
      <SalesTabs clientId={id} />
      <div>{children}</div>
    </div>
  );
}

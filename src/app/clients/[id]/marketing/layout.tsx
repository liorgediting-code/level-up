import Link from "next/link";
import MarketingTabs from "./marketing-tabs";

export default async function MarketingLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${id}`} className="text-xs text-muted hover:text-accent">← חזרה לפורטפוליו</Link>
        <h1 className="mt-1 text-2xl font-semibold">שיווק</h1>
      </div>
      <MarketingTabs clientId={id} />
      <div>{children}</div>
    </div>
  );
}

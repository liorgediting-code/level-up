import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { labelForStageKind } from "@/lib/recruitment/stages";
import RecruitmentClient from "./recruitment-client";

export const dynamic = "force-dynamic";

export default async function RecruitmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, clientType: true, excelUrl: true },
  });
  if (!client) notFound();
  if (client.clientType !== "recruitment") redirect(`/clients/${id}`);

  const profile = await prisma.recruitmentProfile.findUnique({ where: { clientId: id } });
  if (!profile) notFound();

  const [stages, closedCount] = await Promise.all([
    prisma.recruitmentStage.findMany({ where: { clientId: id }, orderBy: { index: "asc" } }),
    prisma.payment.count({ where: { clientId: id, source: "recruitment" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${id}`} className="text-xs text-muted hover:text-accent">← חזרה לפורטפוליו</Link>
        <h1 className="mt-1 text-2xl font-semibold">השמת אנשי מכירות</h1>
      </div>
      <RecruitmentClient
        clientId={id}
        excelUrl={client.excelUrl}
        pricePerSalesperson={profile.pricePerSalesperson}
        currency={profile.currency}
        closedCount={closedCount}
        stages={stages.map((s) => ({
          index: s.index,
          kind: s.kind,
          label: labelForStageKind(s.kind),
          status: s.status,
          note: s.note,
        }))}
      />
    </div>
  );
}

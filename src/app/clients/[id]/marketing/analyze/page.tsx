import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AnalyzeClient from "./analyze-client";

export const dynamic = "force-dynamic";

export default async function AnalyzePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id } = await params;
  const { run } = await searchParams;
  const client = await prisma.client.findUnique({
    where: { id },
    include: { landingPages: { orderBy: { createdAt: "desc" } } },
  });
  if (!client) notFound();
  const selectedRun = run ? await prisma.analysisRun.findUnique({ where: { id: run } }) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">ניתוח משפך עם AI</h2>
        <p className="text-sm text-muted">איתור צוואר בקבוק וכתיבה מחדש של מודעות ודפי נחיתה עם Claude Opus 4.7 (תמונה + טקסט + חומרי לקוח).</p>
      </div>
      <AnalyzeClient
        clientId={id}
        landingPages={client.landingPages.map((lp) => ({ id: lp.id, label: lp.label, sourceType: lp.sourceType }))}
        initialOutput={selectedRun?.outputJson ? JSON.parse(selectedRun.outputJson) : null}
        initialRunMeta={selectedRun ? {
          id: selectedRun.id,
          status: selectedRun.status,
          model: selectedRun.model,
          startedAt: selectedRun.startedAt.toISOString(),
          inputTokens: selectedRun.inputTokens,
          outputTokens: selectedRun.outputTokens,
          cacheReadTokens: selectedRun.cacheReadTokens,
          cacheWriteTokens: selectedRun.cacheWriteTokens,
          errorMessage: selectedRun.errorMessage,
        } : null}
      />
    </div>
  );
}

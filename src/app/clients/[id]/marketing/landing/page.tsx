import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { publicPath } from "@/lib/landing/paths";
import LandingPagesClient from "./landing-pages-client";

export const dynamic = "force-dynamic";

export default async function LandingPagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const pages = await prisma.landingPage.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <LandingPagesClient
      clientId={id}
      pages={pages.map((lp) => ({
        id: lp.id,
        label: lp.label,
        sourceType: lp.sourceType,
        sourceUrl: lp.sourceUrl,
        screenshotUrl: lp.screenshotPath ? publicPath(lp.screenshotPath) : null,
        createdAt: lp.createdAt.toISOString(),
      }))}
    />
  );
}

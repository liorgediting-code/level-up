import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { publicPath } from "@/lib/landing/paths";
import MaterialsClient from "./materials-client";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const assets = await prisma.clientAsset.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <MaterialsClient
      clientId={id}
      assets={assets.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        text: a.text,
        mimeType: a.mimeType,
        fileUrl: a.filePath ? publicPath(a.filePath) : null,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}

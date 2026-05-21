import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ListSettingsClient from "./list-settings-client";

export const dynamic = "force-dynamic";

export default async function ListSettingsPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  const list = await prisma.leadList.findUnique({ where: { id: listId } });
  if (!list) notFound();

  const overrides = await prisma.leadStatus.findMany({ where: { listId }, orderBy: { order: "asc" } });
  const globals = await prisma.leadStatus.findMany({ where: { listId: null }, orderBy: { order: "asc" } });

  return (
    <ListSettingsClient
      list={{ id: list.id, name: list.name, webhookToken: list.webhookToken }}
      overrides={overrides.map((s) => ({
        id: s.id, name: s.name, color: s.color, order: s.order,
        isDefault: s.isDefault, isConvertedTarget: s.isConvertedTarget, listId: s.listId,
      }))}
      globals={globals.map((s) => ({
        id: s.id, name: s.name, color: s.color, order: s.order,
        isDefault: s.isDefault, isConvertedTarget: s.isConvertedTarget, listId: s.listId,
      }))}
    />
  );
}

import { prisma } from "@/lib/db";
import { ensureCrmDefaults } from "@/lib/crm/seed";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

export default async function GlobalCrmSettingsPage() {
  await ensureCrmDefaults();
  const [settings, globals] = await Promise.all([
    prisma.crmSettings.findUnique({ where: { id: "singleton" } }),
    prisma.leadStatus.findMany({ where: { listId: null }, orderBy: { order: "asc" } }),
  ]);
  return (
    <SettingsClient
      notificationEmail={settings?.notificationEmail ?? null}
      globals={globals.map((s) => ({
        id: s.id, name: s.name, color: s.color, order: s.order,
        isDefault: s.isDefault, isConvertedTarget: s.isConvertedTarget, listId: s.listId,
      }))}
    />
  );
}

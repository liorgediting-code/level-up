// src/lib/crm/seed.ts
import { prisma } from "@/lib/db";

const DEFAULTS = [
  { name: "ליד חדש", color: "#3b82f6", order: 0, isDefault: true,  isConvertedTarget: false },
  { name: "יצרתי קשר", color: "#8b5cf6", order: 1, isDefault: false, isConvertedTarget: false },
  { name: "פגישה נקבעה", color: "#f59e0b", order: 2, isDefault: false, isConvertedTarget: false },
  { name: "סגור", color: "#10b981", order: 3, isDefault: false, isConvertedTarget: true  },
  { name: "לא רלוונטי", color: "#64748b", order: 4, isDefault: false, isConvertedTarget: false },
];

/**
 * Idempotent: creates global statuses only if no global statuses exist.
 * Also creates the singleton CrmSettings row.
 */
export async function ensureCrmDefaults(): Promise<void> {
  await prisma.crmSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const globalCount = await prisma.leadStatus.count({ where: { listId: null } });
  if (globalCount === 0) {
    await prisma.leadStatus.createMany({ data: DEFAULTS.map((d) => ({ ...d, listId: null })) });
  }
}

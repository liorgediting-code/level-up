// src/lib/crm/seed.ts
import { prisma } from "@/lib/db";
import { generateWebhookToken } from "@/lib/crm/tokens";

const DEFAULTS = [
  { name: "ליד חדש", color: "#3b82f6", order: 0, isDefault: true,  isConvertedTarget: false },
  { name: "יצרתי קשר", color: "#8b5cf6", order: 1, isDefault: false, isConvertedTarget: false },
  { name: "פגישה נקבעה", color: "#f59e0b", order: 2, isDefault: false, isConvertedTarget: false },
  { name: "סגור", color: "#10b981", order: 3, isDefault: false, isConvertedTarget: true  },
  { name: "לא רלוונטי", color: "#64748b", order: 4, isDefault: false, isConvertedTarget: false },
];

const SALES_RECRUITING_LIST = {
  slug: "אנשי-מכירות",
  name: "אנשי מכירות",
  statuses: [
    { name: "ליד חדש",    color: "#3b82f6", order: 0, isDefault: true,  isConvertedTarget: false },
    { name: "ראיון נקבע", color: "#f59e0b", order: 1, isDefault: false, isConvertedTarget: false },
    { name: "ראיון בוצע", color: "#8b5cf6", order: 2, isDefault: false, isConvertedTarget: false },
    { name: "התקבל",      color: "#10b981", order: 3, isDefault: false, isConvertedTarget: true  },
    { name: "נדחה",       color: "#ef4444", order: 4, isDefault: false, isConvertedTarget: false },
  ],
};

/**
 * Idempotent: creates global statuses only if no global statuses exist.
 * Also creates the singleton CrmSettings row and seeds curated lists.
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

  await ensureSalesRecruitingList();
}

async function ensureSalesRecruitingList(): Promise<void> {
  const existing = await prisma.leadList.findUnique({ where: { slug: SALES_RECRUITING_LIST.slug } });
  const list = existing ?? await prisma.leadList.create({
    data: {
      name: SALES_RECRUITING_LIST.name,
      slug: SALES_RECRUITING_LIST.slug,
      webhookToken: generateWebhookToken(),
    },
  });

  const overrideCount = await prisma.leadStatus.count({ where: { listId: list.id } });
  if (overrideCount === 0) {
    await prisma.leadStatus.createMany({
      data: SALES_RECRUITING_LIST.statuses.map((s) => ({ ...s, listId: list.id })),
    });
  }
}

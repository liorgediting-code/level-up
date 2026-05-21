import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateWebhookToken } from "@/lib/crm/tokens";
import { ensureCrmDefaults } from "@/lib/crm/seed";

export const runtime = "nodejs";

const Create = z.object({ name: z.string().trim().min(1).max(120) });

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9֐-׿]+/gi, "-").replace(/^-+|-+$/g, "") || "list";
}

export async function GET() {
  await ensureCrmDefaults();
  const lists = await prisma.leadList.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { leads: true } },
    },
  });
  const unread = await prisma.lead.groupBy({
    by: ["listId"],
    where: { viewedAt: null },
    _count: { _all: true },
  });
  const unreadMap = new Map(unread.map((u) => [u.listId, u._count._all]));
  return NextResponse.json(
    lists.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      webhookToken: l.webhookToken,
      createdAt: l.createdAt.toISOString(),
      leadCount: l._count.leads,
      unreadCount: unreadMap.get(l.id) ?? 0,
    })),
  );
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Create.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  await ensureCrmDefaults();
  const base = slugify(parsed.data.name);
  let slug = base;
  for (let i = 2; await prisma.leadList.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const list = await prisma.leadList.create({
    data: {
      name: parsed.data.name,
      slug,
      webhookToken: generateWebhookToken(),
    },
  });
  return NextResponse.json({
    id: list.id,
    name: list.name,
    slug: list.slug,
    webhookToken: list.webhookToken,
    createdAt: list.createdAt.toISOString(),
  });
}

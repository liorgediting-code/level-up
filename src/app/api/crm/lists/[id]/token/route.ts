import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateWebhookToken } from "@/lib/crm/tokens";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await prisma.leadList.update({
    where: { id },
    data: { webhookToken: generateWebhookToken() },
  });
  return NextResponse.json({ webhookToken: list.webhookToken });
}

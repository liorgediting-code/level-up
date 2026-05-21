import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseWebhookPayload, readWebhookBody } from "@/lib/crm/webhook";
import { defaultStatusForList } from "@/lib/crm/statuses";
import { sendNewLeadEmail } from "@/lib/crm/notify";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ listId: string }> },
) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const { listId } = await params;
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });

  const list = await prisma.leadList.findUnique({ where: { id: listId } });
  if (!list || !safeEq(list.webhookToken, token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await readWebhookBody(req, MAX_BODY_BYTES);
  if (raw === "OVERSIZE") {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const parsed = parseWebhookPayload(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const data = parsed.data;

  const defaultStatus = await defaultStatusForList(list.id);

  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        listId: list.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        utmJson: data.utm ? JSON.stringify(data.utm) : null,
        customFieldsJson: JSON.stringify(data.customFields),
        statusId: defaultStatus.id,
      },
    });
    await tx.leadActivity.create({
      data: {
        leadId: created.id,
        type: "created",
        payload: JSON.stringify({ statusId: defaultStatus.id }),
      },
    });
    return created;
  });

  const baseUrl = req.headers.get("origin") || `http://localhost:3000`;
  void sendNewLeadEmail({
    leadId: lead.id,
    leadName: lead.name,
    phone: lead.phone,
    email: lead.email,
    listName: list.name,
    listId: list.id,
    utm: data.utm,
    baseUrl,
  });

  return NextResponse.json({ leadId: lead.id }, { status: 200 });
}

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseWebhookPayload, readWebhookBody } from "@/lib/crm/webhook";
import { defaultStatusForList } from "@/lib/crm/statuses";
import { sendNewLeadEmail } from "@/lib/crm/notify";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_LOG_BODY_CHARS = 8 * 1024;

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Best-effort delivery log. Must never throw — a logging failure must not
 *  reject a real lead, and rejection reasons also go to console for Vercel. */
async function logDelivery(entry: {
  listId: string | null;
  status: number;
  reason: string | null;
  leadId?: string | null;
  rawBody?: unknown;
  meta: { contentType: string | null; userAgent: string | null; ip: string | null };
}): Promise<void> {
  const outcome = entry.status === 200 ? "created" : "rejected";
  if (outcome === "rejected") {
    console.error(`[webhook] lead rejected ${entry.status}: ${entry.reason ?? ""} (list=${entry.listId ?? "?"})`);
  }
  let rawBody: string | null = null;
  if (entry.rawBody !== undefined && entry.rawBody !== null) {
    try {
      const s = typeof entry.rawBody === "string" ? entry.rawBody : JSON.stringify(entry.rawBody);
      rawBody = s.length > MAX_LOG_BODY_CHARS ? s.slice(0, MAX_LOG_BODY_CHARS) : s;
    } catch {
      rawBody = null;
    }
  }
  try {
    await prisma.webhookDelivery.create({
      data: {
        listId: entry.listId,
        status: entry.status,
        outcome,
        reason: entry.reason,
        leadId: entry.leadId ?? null,
        contentType: entry.meta.contentType,
        userAgent: entry.meta.userAgent,
        ip: entry.meta.ip,
        rawBody,
      },
    });
  } catch (e) {
    console.error("[webhook] failed to persist delivery log:", e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;
  const meta = {
    contentType: req.headers.get("content-type"),
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for"),
  };

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    await logDelivery({ listId, status: 413, reason: "payload too large (content-length)", meta });
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    await logDelivery({ listId, status: 401, reason: "missing token", meta });
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }

  const list = await prisma.leadList.findUnique({ where: { id: listId } });
  if (!list || !safeEq(list.webhookToken, token)) {
    await logDelivery({
      listId: list ? list.id : null,
      status: 401,
      reason: list ? "invalid token" : "unknown list",
      meta,
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await readWebhookBody(req, MAX_BODY_BYTES);
  if (raw === "OVERSIZE") {
    await logDelivery({ listId: list.id, status: 413, reason: "payload too large (body)", meta });
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const parsed = parseWebhookPayload(raw);
  if (!parsed.ok) {
    await logDelivery({ listId: list.id, status: 400, reason: parsed.error, rawBody: raw, meta });
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

  await logDelivery({ listId: list.id, status: 200, reason: null, leadId: lead.id, rawBody: raw, meta });

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

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getActiveConnection, refreshAdAccounts } from "@/lib/meta/connection";

export const runtime = "nodejs";

// Refresh: rediscover ad accounts from /me/adaccounts
export async function POST() {
  const conn = await getActiveConnection();
  if (!conn) return NextResponse.json({ error: "not connected" }, { status: 400 });
  try {
    const n = await refreshAdAccounts(conn.id);
    return NextResponse.json({ ok: true, discovered: n });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

const Patch = z.object({ id: z.string(), enabled: z.boolean() });

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  await prisma.metaAccount.update({
    where: { id: parsed.data.id },
    data: { enabled: parsed.data.enabled },
  });
  return NextResponse.json({ ok: true });
}

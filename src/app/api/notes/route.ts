import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Scope = z.enum(["client", "funnel"]);
const Body = z.object({
  scope: Scope,
  targetId: z.string().min(1),
  body: z.string().min(1).max(4000),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = Scope.safeParse(url.searchParams.get("scope") ?? "");
  const targetId = url.searchParams.get("targetId") ?? "";
  if (!scope.success || !targetId) {
    return NextResponse.json({ error: "missing scope/targetId" }, { status: 400 });
  }
  const notes = await prisma.note.findMany({
    where: { scope: scope.data, targetId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() }))
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const body = parsed.data.body.trim();
  if (!body) return NextResponse.json({ error: "empty body" }, { status: 400 });
  const note = await prisma.note.create({
    data: {
      scope: parsed.data.scope,
      targetId: parsed.data.targetId,
      body,
      clientId: parsed.data.scope === "client" ? parsed.data.targetId : null,
      funnelId: parsed.data.scope === "funnel" ? parsed.data.targetId : null,
    },
  });
  return NextResponse.json(
    { id: note.id, body: note.body, createdAt: note.createdAt.toISOString() },
    { status: 201 }
  );
}

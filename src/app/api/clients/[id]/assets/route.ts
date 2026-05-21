import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureClientDir } from "@/lib/landing/paths";

export const runtime = "nodejs";

const KIND = new Set(["creative_image", "creative_video", "brief", "note"]);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const assets = await prisma.clientAsset.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ assets });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });

  const form = await req.formData();
  const kind = String(form.get("kind") ?? "");
  const label = String(form.get("label") ?? "").trim();
  if (!KIND.has(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });

  let filePath: string | null = null;
  let mimeType: string | null = null;
  let text: string | null = null;

  const file = form.get("file");
  const textInput = form.get("text");

  if (file && file instanceof File && file.size > 0) {
    const dir = await ensureClientDir(id);
    const stamp = Date.now();
    const safeExt = (file.name.split(".").pop() ?? "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
    const prefix = kind === "creative_image" ? "img" : kind === "creative_video" ? "vid" : "doc";
    const dest = path.join(dir, `${prefix}-${stamp}.${safeExt}`);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buf);
    filePath = dest;
    mimeType = file.type || null;
  }
  if (typeof textInput === "string" && textInput.trim()) {
    text = textInput.trim();
  }

  if (!filePath && !text) {
    return NextResponse.json({ error: "either file or text is required" }, { status: 400 });
  }

  const asset = await prisma.clientAsset.create({
    data: { clientId: id, kind, label, filePath, mimeType, text },
  });
  return NextResponse.json({ asset });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const assetId = url.searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
  const a = await prisma.clientAsset.findUnique({ where: { id: assetId } });
  if (!a || a.clientId !== id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (a.filePath) {
    await fs.unlink(a.filePath).catch(() => {});
  }
  await prisma.clientAsset.delete({ where: { id: assetId } });
  return NextResponse.json({ ok: true });
}

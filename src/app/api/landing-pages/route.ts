import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestHtml, ingestImage, ingestPdf, ingestUrl } from "@/lib/landing/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const Json = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("url"), clientId: z.string(), label: z.string(), url: z.string().url() }),
  z.object({ sourceType: z.literal("html"), clientId: z.string(), label: z.string(), html: z.string().min(1) }),
]);

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.startsWith("multipart/form-data")) {
      const fd = await req.formData();
      const clientId = String(fd.get("clientId") ?? "");
      const label = String(fd.get("label") ?? "Landing page");
      const file = fd.get("file");
      if (!clientId || !(file instanceof File)) {
        return NextResponse.json({ error: "clientId and file required" }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const name = file.name || "upload";
      const ext = name.split(".").pop() ?? "";
      if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext.toLowerCase())) {
        const lp = await ingestImage({ clientId, label, bytes, extension: ext || "png" });
        return NextResponse.json(lp);
      }
      if (file.type === "application/pdf" || ext.toLowerCase() === "pdf") {
        const lp = await ingestPdf({ clientId, label, bytes });
        return NextResponse.json(lp);
      }
      const isHtml =
        file.type === "text/html" ||
        ["html", "htm"].includes(ext.toLowerCase()) ||
        /<html|<body|<!doctype/i.test(bytes.slice(0, 2048).toString("utf8"));
      if (!isHtml) {
        return NextResponse.json(
          {
            error:
              "סוג קובץ לא נתמך לדף נחיתה. תומך ב-HTML או תמונה (PNG/JPG/WEBP/GIF). ל-PDF: המירו את הדף לתמונה (Screenshot) או הדביקו URL של הדף.",
          },
          { status: 400 },
        );
      }
      const html = bytes.toString("utf8");
      const lp = await ingestHtml({ clientId, label, html });
      return NextResponse.json(lp);
    }
    const body = await req.json();
    const parsed = Json.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    if (parsed.data.sourceType === "url") {
      const lp = await ingestUrl(parsed.data);
      return NextResponse.json(lp);
    }
    const lp = await ingestHtml(parsed.data);
    return NextResponse.json(lp);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

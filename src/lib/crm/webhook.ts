// src/lib/crm/webhook.ts
import { z } from "zod";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const KNOWN_KEYS = new Set<string>(["name", "phone", "email", ...UTM_KEYS]);

const BasePayload = z.object({
  name: z.string().trim().min(1, "name is required"),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
}).passthrough();

export type ParsedLead = {
  name: string;
  phone: string | null;
  email: string | null;
  utm: Record<string, string> | null;
  customFields: Record<string, unknown>;
};

export function parseWebhookPayload(raw: unknown): { ok: true; data: ParsedLead } | { ok: false; error: string } {
  const parsed = BasePayload.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  }
  const obj = parsed.data as Record<string, unknown>;
  if (!obj.phone && !obj.email) {
    return { ok: false, error: "either 'phone' or 'email' is required" };
  }

  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) utm[k.slice(4)] = v; // strip "utm_"
  }

  const customFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!KNOWN_KEYS.has(k)) customFields[k] = v;
  }

  return {
    ok: true,
    data: {
      name: String(obj.name),
      phone: obj.phone ? String(obj.phone) : null,
      email: obj.email ? String(obj.email) : null,
      utm: Object.keys(utm).length > 0 ? utm : null,
      customFields,
    },
  };
}

/** Reads either application/json OR application/x-www-form-urlencoded into a plain object.
 *  Returns the literal string "OVERSIZE" if the body exceeds maxBytes. */
export async function readWebhookBody(req: Request, maxBytes: number): Promise<unknown | "OVERSIZE"> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const text = await req.text();
  if (text.length > maxBytes) return "OVERSIZE";

  if (ct.includes("application/json")) {
    try { return JSON.parse(text); } catch { return {}; }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const obj: Record<string, string> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
  }
  if (ct.includes("multipart/form-data")) {
    // multipart needs the raw Request — re-read via clone is not possible after text().
    // Tell caller to retry without text(); for now, treat as JSON fallback or reject.
    try { return JSON.parse(text); } catch { return {}; }
  }
  try { return JSON.parse(text); } catch { return {}; }
}

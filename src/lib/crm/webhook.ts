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
  const normalized = isTypeformPayload(raw) ? normalizeTypeform(raw) : raw;
  const parsed = BasePayload.safeParse(normalized);
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

// ---------- Typeform adapter ----------

type TypeformField = { id?: string; ref?: string; title?: string; type?: string };
type TypeformAnswer = {
  type?: string;
  field?: TypeformField;
  text?: string;
  email?: string;
  phone_number?: string;
  number?: number;
  boolean?: boolean;
  date?: string;
  url?: string;
  choice?: { label?: string; other?: string };
  choices?: { labels?: string[]; other?: string };
};

function isTypeformPayload(raw: unknown): raw is { form_response: { answers?: TypeformAnswer[]; definition?: { fields?: TypeformField[] } } } {
  if (!raw || typeof raw !== "object") return false;
  const fr = (raw as Record<string, unknown>).form_response;
  return !!fr && typeof fr === "object" && Array.isArray((fr as Record<string, unknown>).answers);
}

function answerValue(a: TypeformAnswer): unknown {
  switch (a.type) {
    case "text":
    case "short_text":
    case "long_text": return a.text;
    case "email": return a.email;
    case "phone_number": return a.phone_number;
    case "number": return a.number;
    case "boolean": return a.boolean;
    case "date": return a.date;
    case "url": return a.url;
    case "choice": return a.choice?.label ?? a.choice?.other;
    case "choices": return a.choices?.labels?.join(", ") ?? a.choices?.other;
    default:
      return a.text ?? a.phone_number ?? a.email ?? a.number ?? a.boolean ?? a.date ?? a.url
        ?? a.choice?.label ?? a.choices?.labels?.join(", ");
  }
}

function normalizeTypeform(raw: { form_response: { answers?: TypeformAnswer[]; definition?: { fields?: TypeformField[] } } }): Record<string, unknown> {
  const fr = raw.form_response;
  const fieldsById = new Map<string, TypeformField>();
  for (const f of fr.definition?.fields ?? []) {
    if (f.id) fieldsById.set(f.id, f);
  }

  const answers = fr.answers ?? [];
  const out: Record<string, unknown> = {};

  let phone: string | null = null;
  let email: string | null = null;
  let name: string | null = null;
  let firstShortText: string | null = null;

  for (const a of answers) {
    const def = (a.field?.id && fieldsById.get(a.field.id)) || a.field || {};
    const title = (def.title ?? "").trim();
    const val = answerValue(a);
    if (val === undefined || val === null || val === "") continue;

    if (a.type === "phone_number" && !phone) {
      phone = String(val);
      continue;
    }
    if (a.type === "email" && !email) {
      email = String(val);
      continue;
    }

    const isShortText = a.type === "short_text" || a.type === "text";
    if (isShortText && firstShortText === null) firstShortText = String(val);
    if (!name && isShortText && /שם|name/i.test(title)) {
      name = String(val);
      continue;
    }

    const key = title || a.field?.ref || a.field?.id || `field_${Object.keys(out).length + 1}`;
    out[key] = val;
  }

  if (!name && firstShortText) name = firstShortText;
  if (name) out.name = name;
  if (phone) out.phone = phone;
  if (email) out.email = email;

  return out;
}

// src/lib/crm/tokens.ts
import { randomBytes } from "node:crypto";

export function generateWebhookToken(): string {
  // 24 bytes → 32-char base64url, URL-safe, no padding
  return randomBytes(24).toString("base64url");
}

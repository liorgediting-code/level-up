// src/lib/crm/notify.ts
import { Resend } from "resend";
import { prisma } from "@/lib/db";

type NewLeadEmailInput = {
  leadId: string;
  leadName: string;
  phone: string | null;
  email: string | null;
  listName: string;
  listId: string;
  utm: Record<string, string> | null;
  baseUrl: string;
};

export async function sendNewLeadEmail(input: NewLeadEmailInput): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[crm/notify] RESEND_API_KEY missing — skipping email for lead", input.leadId);
    return;
  }
  const settings = await prisma.crmSettings.findUnique({ where: { id: "singleton" } });
  const to = settings?.notificationEmail;
  if (!to) {
    console.warn("[crm/notify] notificationEmail not configured — skipping email for lead", input.leadId);
    return;
  }

  const from = process.env.RESEND_FROM || "לבל אפ CRM <onboarding@resend.dev>";
  const utmLine = input.utm
    ? Object.entries(input.utm).map(([k, v]) => `${k}=${v}`).join(" / ")
    : "(אין UTM)";
  const url = `${input.baseUrl}/crm/${input.listId}?lead=${input.leadId}`;

  const resend = new Resend(key);
  try {
    await resend.emails.send({
      from,
      to,
      subject: `ליד חדש מ-${input.listName}: ${input.leadName}`,
      text: [
        `התקבל ליד חדש ברשימה "${input.listName}".`,
        ``,
        `שם: ${input.leadName}`,
        `טלפון: ${input.phone ?? "-"}`,
        `אימייל: ${input.email ?? "-"}`,
        `מקור: ${utmLine}`,
        ``,
        `פתח בליווי המערכת: ${url}`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[crm/notify] resend.emails.send failed", err);
  }
}

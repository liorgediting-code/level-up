import { z } from "zod";

export type SummaryKind = "meeting" | "sales_call";

// ---------- Meeting schema ----------

export const MeetingSummarySchema = z.object({
  date: z.string(),
  participants: z.array(z.string()),
  durationMinutes: z.number(),
  format: z.string(),
  executiveSummary: z.string(),
  topics: z.array(z.object({ title: z.string(), body: z.string() })),
  tasks: z.array(z.object({ description: z.string(), owner: z.string() })),
  openQuestions: z.array(
    z.object({ question: z.string(), context: z.string(), owner: z.string() })
  ),
  keyInsights: z.array(z.string()),
});
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

// ---------- Sales call schemas ----------

const SalesBase = {
  outcomeReason: z.string(),
  summary: z.string(),
};

export const SalesPendingSchema = z.object({
  outcome: z.literal("pending"),
  ...SalesBase,
  prospectProfile: z.string(),
  painPoints: z.array(z.string()),
  objectionsRaised: z.array(z.string()),
  whatWorked: z.array(z.string()),
  whatCouldBeBetter: z.array(z.string()),
  nextStepPlaybook: z.array(z.string()),
  recommendedFollowUpMessage: z.string(),
});

export const SalesLostSchema = z.object({
  outcome: z.literal("lost"),
  ...SalesBase,
  rootCauseAnalysis: z.string(),
  objectionsNotHandled: z.array(z.string()),
  coachingPoints: z.array(z.string()),
  winBackAngle: z.string(),
});

export const SalesClosedSchema = z.object({
  outcome: z.literal("closed"),
  ...SalesBase,
  whatWorked: z.array(z.string()),
  keyMomentsToReplicate: z.array(z.string()),
  onboardingHandoffNotes: z.array(z.string()),
});

export const SalesCallSummarySchema = z.discriminatedUnion("outcome", [
  SalesPendingSchema,
  SalesLostSchema,
  SalesClosedSchema,
]);
export type SalesCallSummary = z.infer<typeof SalesCallSummarySchema>;

// ---------- Renderers ----------

export function renderMeetingMarkdown(s: MeetingSummary, title: string | null): string {
  const lines: string[] = [];
  lines.push(`סיכום פגישה – ${title?.trim() || "פגישה"}`);
  lines.push("");
  lines.push(`תאריך: ${s.date}`);
  lines.push(`משתתפים: ${s.participants.join(", ")}`);
  lines.push(`משך הפגישה: ~${s.durationMinutes} דקות`);
  lines.push(`פורמט: ${s.format}`);
  lines.push("");
  lines.push("תקציר מנהלים");
  lines.push(s.executiveSummary);

  if (s.topics.length > 0) {
    lines.push("");
    lines.push("נושאים שנדונו");
    s.topics.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title}`);
      lines.push(t.body);
      lines.push("");
    });
  }

  if (s.tasks.length > 0) {
    lines.push("משימות לביצוע");
    for (const t of s.tasks) lines.push(`- ${t.description} — ${t.owner}`);
    lines.push("");
  }

  if (s.openQuestions.length > 0) {
    lines.push("שאלות פתוחות");
    for (const q of s.openQuestions) {
      lines.push(`- ${q.question} (${q.context}) — אחראי: ${q.owner}`);
    }
    lines.push("");
  }

  if (s.keyInsights.length > 0) {
    lines.push("תובנות מרכזיות מהפגישה");
    for (const k of s.keyInsights) lines.push(`- ${k}`);
  }

  return lines.join("\n").trimEnd();
}

const SALES_STATUS_HE: Record<SalesCallSummary["outcome"], string> = {
  pending: "ממתין",
  lost: "לא נסגר",
  closed: "נסגר",
};

export function renderSalesCallMarkdown(s: SalesCallSummary): string {
  const lines: string[] = [];
  lines.push("ניתוח שיחת מכירה");
  lines.push("");
  lines.push(`סטטוס: ${SALES_STATUS_HE[s.outcome]}`);
  lines.push(s.outcomeReason);
  lines.push("");
  lines.push("סיכום");
  lines.push(s.summary);
  lines.push("");

  if (s.outcome === "pending") {
    lines.push("פרופיל הליד");
    lines.push(s.prospectProfile);
    lines.push("");
    if (s.painPoints.length) {
      lines.push("נקודות כאב");
      for (const p of s.painPoints) lines.push(`- ${p}`);
      lines.push("");
    }
    if (s.objectionsRaised.length) {
      lines.push("התנגדויות שעלו");
      for (const o of s.objectionsRaised) lines.push(`- ${o}`);
      lines.push("");
    }
    if (s.whatWorked.length) {
      lines.push("מה עבד");
      for (const w of s.whatWorked) lines.push(`- ${w}`);
      lines.push("");
    }
    if (s.whatCouldBeBetter.length) {
      lines.push("מה ניתן לשפר");
      for (const w of s.whatCouldBeBetter) lines.push(`- ${w}`);
      lines.push("");
    }
    if (s.nextStepPlaybook.length) {
      lines.push("צעדים להמשך");
      for (const n of s.nextStepPlaybook) lines.push(`- ${n}`);
      lines.push("");
    }
    lines.push("הודעת המשך מומלצת");
    lines.push(s.recommendedFollowUpMessage);
  } else if (s.outcome === "lost") {
    lines.push("ניתוח שורש");
    lines.push(s.rootCauseAnalysis);
    lines.push("");
    if (s.objectionsNotHandled.length) {
      lines.push("התנגדויות שלא טופלו");
      for (const o of s.objectionsNotHandled) lines.push(`- ${o}`);
      lines.push("");
    }
    if (s.coachingPoints.length) {
      lines.push("נקודות לאימון");
      for (const c of s.coachingPoints) lines.push(`- ${c}`);
      lines.push("");
    }
    lines.push("זווית לחזרה");
    lines.push(s.winBackAngle);
  } else {
    if (s.whatWorked.length) {
      lines.push("מה עבד");
      for (const w of s.whatWorked) lines.push(`- ${w}`);
      lines.push("");
    }
    if (s.keyMomentsToReplicate.length) {
      lines.push("רגעי מפתח לשחזור");
      for (const k of s.keyMomentsToReplicate) lines.push(`- ${k}`);
      lines.push("");
    }
    if (s.onboardingHandoffNotes.length) {
      lines.push("הערות העברה ל-onboarding");
      for (const o of s.onboardingHandoffNotes) lines.push(`- ${o}`);
    }
  }

  return lines.join("\n").trimEnd();
}

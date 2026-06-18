// Global sequential stages for the sales-recruitment ("השמת אנשי מכירות") workspace.
// Pure data + helpers — no DB access. Mirrors the journeys template idea but video-free.

export type RecruitmentStageKind = "characterize" | "bring" | "interviews" | "closing";

export type RecruitmentStageTemplate = {
  index: number;
  kind: RecruitmentStageKind;
  label: string; // Hebrew, shown in UI
};

export const RECRUITMENT_STAGES: RecruitmentStageTemplate[] = [
  { index: 0, kind: "characterize", label: "אפיון סוג איש מכירות" },
  { index: 1, kind: "bring", label: "הבאת איש מכירות" },
  { index: 2, kind: "interviews", label: "ראיונות" },
  { index: 3, kind: "closing", label: "סגירה והכנסת איש מכירות" },
];

export function labelForStageKind(kind: string): string {
  return RECRUITMENT_STAGES.find((s) => s.kind === kind)?.label ?? kind;
}

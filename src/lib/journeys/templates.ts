export type JourneyKind = "organic" | "paid";
export type StageKind =
  | "writing" | "filming" | "editing"
  | "strategy" | "ads_writing" | "ad_filming" | "creative";
export type StageMode = "single" | "per_video";

export type StageTemplate = { index: number; kind: StageKind; mode: StageMode };

export const ORGANIC_STAGES: StageTemplate[] = [
  { index: 0, kind: "writing", mode: "single" },
  { index: 1, kind: "filming", mode: "single" },
  { index: 2, kind: "editing", mode: "per_video" },
];

export const PAID_STAGES: StageTemplate[] = [
  { index: 0, kind: "strategy",    mode: "single" },
  { index: 1, kind: "ads_writing", mode: "per_video" },
  { index: 2, kind: "ad_filming",  mode: "per_video" },
  { index: 3, kind: "creative",    mode: "per_video" },
];

export function templateFor(kind: JourneyKind): StageTemplate[] {
  return kind === "organic" ? ORGANIC_STAGES : PAID_STAGES;
}

export const STAGE_LABEL: Record<StageKind, string> = {
  writing: "כתיבת תסריטים",
  filming: "יום צילום",
  editing: "עריכת סרטונים",
  strategy: "אסטרטגיית מודעות",
  ads_writing: "כתיבת מודעות",
  ad_filming: "צילום מודעות",
  creative: "קריאייטיב",
};

export const KIND_LABEL: Record<JourneyKind, string> = {
  organic: "אורגני",
  paid: "ממומן",
};

export const KIND_BADGE_COLOR: Record<JourneyKind, string> = {
  organic: "#ec4899",
  paid: "#a855f7",
};

export function taskTitleFor(stageKind: StageKind, journeyKind: JourneyKind): string {
  return `${STAGE_LABEL[stageKind]} — ${KIND_LABEL[journeyKind]}`;
}

export function taskDescriptionFor(stageIndex: number, totalStages: number, journeyKind: JourneyKind): string {
  return `שלב ${stageIndex + 1} מתוך ${totalStages} במסלול ${KIND_LABEL[journeyKind]}`;
}

export function isFilmingKind(stageKind: StageKind): boolean {
  return stageKind === "filming" || stageKind === "ad_filming";
}

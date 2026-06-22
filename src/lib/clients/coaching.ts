export type CoachingStatus = {
  endsAt: Date;
  monthsLeft: number; // whole months remaining, clamped at 0
  finished: boolean;
};

/**
 * Derives coaching-window status from the client's start date (createdAt)
 * and the agreed number of coaching months. Returns null when no duration
 * is set. Pure — `now` is injectable for testing.
 */
export function coachingStatus(
  createdAt: Date,
  coachingMonths: number | null | undefined,
  now: Date = new Date(),
): CoachingStatus | null {
  if (coachingMonths == null || coachingMonths <= 0) return null;

  const endsAt = new Date(createdAt);
  // Add months, clamping day overflow (e.g. Jan 31 + 1mo -> Feb 28/29).
  const targetMonth = endsAt.getMonth() + coachingMonths;
  const day = endsAt.getDate();
  endsAt.setDate(1);
  endsAt.setMonth(targetMonth);
  const lastDay = new Date(endsAt.getFullYear(), endsAt.getMonth() + 1, 0).getDate();
  endsAt.setDate(Math.min(day, lastDay));

  const finished = now.getTime() >= endsAt.getTime();

  // Whole months remaining (ceil so a partial final month still shows as 1).
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375;
  const monthsLeft = finished
    ? 0
    : Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / msPerMonth));

  return { endsAt, monthsLeft, finished };
}

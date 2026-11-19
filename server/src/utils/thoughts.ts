// CBT thought-log helpers: the list of common "thinking traps" and simple stats.

/** Common thinking traps (cognitive distortions), stored by these keys. */
export const DISTORTIONS = [
  "all-or-nothing",
  "catastrophising",
  "mind-reading",
  "fortune-telling",
  "overgeneralising",
  "labelling",
  "should-statements",
  "discounting-the-positive",
  "emotional-reasoning",
  "personalising",
] as const;
export type Distortion = (typeof DISTORTIONS)[number];

type LogForStats = {
  date: string;
  feelings: { intensityBefore: number }[];
  intensityAfter?: number | null;
};

/**
 * - thisMonth: logs dated in the given month ("YYYY-MM").
 * - averageDrop: average of (before − after) over logs that have both ratings, 1 decimal.
 *   "Before" is the strongest feeling at the start, because the last step asks how intense
 *   "the feeling" is now — that's usually the one that brought you to the log.
 */
export function thoughtStats(logs: LogForStats[], month: string) {
  const rated = logs.filter((l) => l.feelings.length > 0 && l.intensityAfter != null);
  const drops = rated.map((l) => Math.max(...l.feelings.map((f) => f.intensityBefore)) - l.intensityAfter!);
  return {
    thisMonth: logs.filter((l) => l.date.startsWith(month)).length,
    averageDrop: drops.length === 0 ? null : Math.round((drops.reduce((s, d) => s + d, 0) / drops.length) * 10) / 10,
    ratedLogs: rated.length,
  };
}

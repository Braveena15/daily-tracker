// Simple patterns in the user's own logs: "on days you did X, your mood was usually higher/lower".
//
// These are observations, not causes. A day with a bike ride might also be a sunny weekend
// day with more sleep — we can't tell what made the difference, and a handful of days
// can easily line up by chance. So insights are only shown when:
//   - each group (days with / days without) has at least MIN_GROUP_DAYS days, and
//   - the average mood differs by at least MIN_MOOD_DIFFERENCE points,
// and they are always worded as "on days you…", never "X improves your mood".

export const MIN_GROUP_DAYS = 5;
export const MIN_MOOD_DIFFERENCE = 0.8;
export const MAX_INSIGHTS = 3;
/** Mental scores closer than this aren't worth mentioning. */
export const MIN_MENTAL_DIFFERENCE = 3;

/** One logged day, reduced to what the comparisons need. */
export type InsightDay = {
  date: string;
  mood: number;
  mentalScore: number;
  /** Workouts, mental-strength and outdoor activity names */
  activities: string[];
  /** True if any outdoor activity was logged */
  outdoor: boolean;
  sleepHours: number | null;
};

export type Insight = {
  key: string;
  text: string;
  daysWith: number;
  daysWithout: number;
  moodWith: number;
  moodWithout: number;
  mentalWith: number;
  mentalWithout: number;
};

type Condition = {
  key: string;
  /** Finishes the sentence "On days you …" */
  phrase: string;
  /** Finishes "…than on days you …" for the other group */
  otherPhrase: string;
  test: (day: InsightDay) => boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const average = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const normalise = (name: string) => name.trim().toLowerCase();

/**
 * Every condition worth testing: each activity that appears on enough days
 * (using its most common spelling for display), plus outdoor time and sleep ≥ 7 h.
 */
export function buildConditions(days: InsightDay[]): Condition[] {
  const spellings = new Map<string, Map<string, number>>();
  const dayCounts = new Map<string, number>();
  for (const day of days) {
    for (const key of new Set(day.activities.map(normalise))) dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    for (const name of day.activities) {
      const key = normalise(name);
      const counts = spellings.get(key) ?? new Map<string, number>();
      counts.set(name.trim(), (counts.get(name.trim()) ?? 0) + 1);
      spellings.set(key, counts);
    }
  }

  const activityConditions: Condition[] = [...dayCounts]
    .filter(([, n]) => n >= MIN_GROUP_DAYS)
    .map(([key]) => {
      const display = [...spellings.get(key)!].sort((a, b) => b[1] - a[1])[0]![0];
      return {
        key: `activity:${key}`,
        phrase: `logged ${display}`,
        otherPhrase: "didn't",
        test: (day: InsightDay) => day.activities.some((a) => normalise(a) === key),
      };
    });

  return [
    ...activityConditions,
    { key: "outdoor", phrase: "spent time outdoors", otherPhrase: "didn't", test: (d) => d.outdoor },
    {
      key: "sleep7",
      phrase: "slept 7 hours or more",
      otherPhrase: "slept less",
      test: (d) => d.sleepHours !== null && d.sleepHours >= 7,
    },
  ];
}

/** Compares days with vs without each condition and returns the clearest patterns (up to 3). */
export function findInsights(days: InsightDay[]): Insight[] {
  const insights: (Insight & { gap: number })[] = [];

  for (const condition of buildConditions(days)) {
    const withIt = days.filter(condition.test);
    const without = days.filter((d) => !condition.test(d));
    if (withIt.length < MIN_GROUP_DAYS || without.length < MIN_GROUP_DAYS) continue;

    const moodWith = average(withIt.map((d) => d.mood));
    const moodWithout = average(without.map((d) => d.mood));
    const gap = moodWith - moodWithout;
    if (Math.abs(gap) < MIN_MOOD_DIFFERENCE) continue;

    const mentalWith = Math.round(average(withIt.map((d) => d.mentalScore)));
    const mentalWithout = Math.round(average(without.map((d) => d.mentalScore)));
    const direction = gap > 0 ? "higher" : "lower";
    const points = round1(Math.abs(gap));
    // Only mention the mental score when it differs noticeably too
    const mentalNote =
      Math.abs(mentalWith - mentalWithout) >= MIN_MENTAL_DIFFERENCE
        ? ` Your mental score averaged ${mentalWith} vs ${mentalWithout}.`
        : "";

    insights.push({
      key: condition.key,
      text:
        `On days you ${condition.phrase}, your mood averaged ${round1(moodWith)}/10 — ` +
        `${points} ${points === 1 ? "point" : "points"} ${direction} than on days you ${condition.otherPhrase} ` +
        `(${round1(moodWithout)}).${mentalNote}`,
      daysWith: withIt.length,
      daysWithout: without.length,
      moodWith: round1(moodWith),
      moodWithout: round1(moodWithout),
      mentalWith,
      mentalWithout,
      gap,
    });
  }

  return insights
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, MAX_INSIGHTS)
    .map(({ gap: _gap, ...insight }) => insight);
}

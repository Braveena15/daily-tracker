/// <reference types="vitest/globals" />
import { thoughtStats } from "./thoughts";
import { pickRandom } from "./random";

describe("thoughtStats", () => {
  const logs = [
    { date: "2026-11-02", feelings: [{ intensityBefore: 8 }, { intensityBefore: 5 }], intensityAfter: 5 }, // drop 3
    { date: "2026-11-10", feelings: [{ intensityBefore: 6 }], intensityAfter: 6 }, // drop 0
    { date: "2026-11-15", feelings: [{ intensityBefore: 7 }], intensityAfter: null }, // not rated after
    { date: "2026-10-30", feelings: [{ intensityBefore: 9 }], intensityAfter: 5 }, // drop 4, last month
  ];

  it("counts this month's logs and averages the drop from the strongest feeling", () => {
    expect(thoughtStats(logs, "2026-11")).toEqual({ thisMonth: 3, averageDrop: 2.3, ratedLogs: 3 });
  });

  it("has no average without rated logs", () => {
    expect(thoughtStats([], "2026-11")).toEqual({ thisMonth: 0, averageDrop: null, ratedLogs: 0 });
  });

  it("can show a negative drop when a feeling got stronger", () => {
    expect(thoughtStats([{ date: "2026-11-01", feelings: [{ intensityBefore: 3 }], intensityAfter: 5 }], "2026-11").averageDrop).toBe(-2);
  });
});

describe("pickRandom", () => {
  it("returns up to n distinct items", () => {
    const picked = pickRandom([1, 2, 3, 4, 5, 6], 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("returns everything (shuffled) when there are fewer than n", () => {
    expect(pickRandom([1, 2], 5).sort()).toEqual([1, 2]);
    expect(pickRandom([], 5)).toEqual([]);
  });

  it("uses the random source it's given", () => {
    expect(pickRandom(["a", "b", "c"], 1, () => 0)).toEqual(["b"]);
  });
});

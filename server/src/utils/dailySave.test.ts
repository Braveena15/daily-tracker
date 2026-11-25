/// <reference types="vitest/globals" />
import { planDailySave } from "./dailySave";

describe("planDailySave", () => {
  it("replaces or clears weight, steps and active calories", () => {
    expect(planDailySave({ steps: 8000, activeCalories: null }, null)).toEqual({ $set: { steps: 8000 }, $unset: { activeCalories: 1 } });
  });

  it("saves sleep you enter as manual, so a sync won't overwrite it", () => {
    expect(planDailySave({ sleepHours: 7.5, sleepScoreValue: 82 }, null)).toEqual({
      $set: { sleepHours: 7.5, sleepHoursSource: "manual", sleepScoreValue: 82, sleepScoreSource: "manual" },
      $unset: {},
    });
  });

  it("clearing a manual value goes back to the watch's night when there is one", () => {
    expect(planDailySave({ sleepHours: null, sleepScoreValue: null }, { totalSleepMin: 434, score: 88 })).toEqual({
      $set: { sleepHours: 7.23, sleepHoursSource: "watch", sleepScoreValue: 88, sleepScoreSource: "auto" },
      $unset: {},
    });
  });

  it("clearing without watch data leaves the day without it", () => {
    expect(planDailySave({ sleepHours: null, sleepScoreValue: null }, null)).toEqual({
      $set: {},
      $unset: { sleepHours: 1, sleepHoursSource: 1, sleepScoreValue: 1, sleepScoreSource: 1 },
    });
  });
});

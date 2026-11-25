/// <reference types="vitest/globals" />
import {
  activityMultiplier,
  bmiCategory,
  calculateAge,
  calculateBMI,
  calculateBMR,
  calculateCalorieTarget,
  calculateDailyDeficit,
  calculateTDEE,
  estimateWeeksToGoal,
  movingAverage,
} from "./calories";

describe("calculateAge", () => {
  it("subtracts the birth year from the given year", () => {
    expect(calculateAge(2004, new Date("2026-06-01"))).toBe(22);
  });

  it("uses today's date by default", () => {
    expect(calculateAge(2000)).toBe(new Date().getFullYear() - 2000);
  });
});

describe("calculateBMR", () => {
  it("matches the known case: male, 70 kg, 175 cm, age 22 → 1689", () => {
    expect(calculateBMR({ weightKg: 70, heightCm: 175, age: 22, sex: "male" })).toBe(1689);
  });

  it("uses −161 for females (166 less than the male result)", () => {
    // 10×60 + 6.25×165 − 5×30 − 161 = 1320.25
    expect(calculateBMR({ weightKg: 60, heightCm: 165, age: 30, sex: "female" })).toBe(1320);
    expect(calculateBMR({ weightKg: 70, heightCm: 175, age: 22, sex: "female" })).toBe(1689 - 166);
  });

  it("returns a whole number", () => {
    expect(Number.isInteger(calculateBMR({ weightKg: 72.3, heightCm: 171.5, age: 41, sex: "male" }))).toBe(true);
  });
});

describe("activityMultiplier and calculateTDEE", () => {
  it("has the right multiplier for every level", () => {
    expect(activityMultiplier("sedentary")).toBe(1.2);
    expect(activityMultiplier("light")).toBe(1.375);
    expect(activityMultiplier("moderate")).toBe(1.55);
    expect(activityMultiplier("active")).toBe(1.725);
    expect(activityMultiplier("very_active")).toBe(1.9);
  });

  it("multiplies BMR and rounds", () => {
    expect(calculateTDEE(1689, "sedentary")).toBe(2027); // 2026.8
    expect(calculateTDEE(1689, "moderate")).toBe(2618); // 2617.95
  });
});

describe("calculateDailyDeficit", () => {
  it("converts kg per week into kcal per day", () => {
    expect(calculateDailyDeficit(0)).toBe(0);
    expect(calculateDailyDeficit(0.25)).toBe(275);
    expect(calculateDailyDeficit(0.5)).toBe(550);
    expect(calculateDailyDeficit(0.75)).toBe(825);
    expect(calculateDailyDeficit(1)).toBe(1100);
  });
});

describe("calculateCalorieTarget", () => {
  it("subtracts the deficit from TDEE", () => {
    expect(calculateCalorieTarget({ tdee: 2618, weeklyGoalKg: 0.5, sex: "male" })).toEqual({
      target: 2068,
      wasClamped: false,
    });
  });

  it("equals TDEE when maintaining", () => {
    expect(calculateCalorieTarget({ tdee: 2000, weeklyGoalKg: 0, sex: "female" })).toEqual({
      target: 2000,
      wasClamped: false,
    });
  });

  it("never goes below 1500 kcal for males", () => {
    expect(calculateCalorieTarget({ tdee: 2200, weeklyGoalKg: 1, sex: "male" })).toEqual({
      target: 1500,
      wasClamped: true,
    });
  });

  it("never goes below 1200 kcal for females", () => {
    expect(calculateCalorieTarget({ tdee: 1700, weeklyGoalKg: 0.75, sex: "female" })).toEqual({
      target: 1200,
      wasClamped: true,
    });
  });

  it("is not clamped when the result lands exactly on the minimum", () => {
    expect(calculateCalorieTarget({ tdee: 1750, weeklyGoalKg: 0.25, sex: "female" })).toEqual({
      target: 1475,
      wasClamped: false,
    });
    expect(calculateCalorieTarget({ tdee: 2050, weeklyGoalKg: 0.5, sex: "male" })).toEqual({
      target: 1500,
      wasClamped: false,
    });
  });

  it("clamps even when maintaining if TDEE itself is below the minimum", () => {
    expect(calculateCalorieTarget({ tdee: 1100, weeklyGoalKg: 0, sex: "female" })).toEqual({
      target: 1200,
      wasClamped: true,
    });
  });
});

describe("calculateBMI and bmiCategory", () => {
  it("calculates BMI to 1 decimal", () => {
    expect(calculateBMI(70, 175)).toBe(22.9); // 22.857…
    expect(calculateBMI(90, 180)).toBe(27.8); // 27.777…
  });

  it("puts BMI into the right category, including the boundaries", () => {
    expect(bmiCategory(18.4)).toBe("Underweight");
    expect(bmiCategory(18.5)).toBe("Healthy weight");
    expect(bmiCategory(24.9)).toBe("Healthy weight");
    expect(bmiCategory(25)).toBe("Overweight");
    expect(bmiCategory(29.9)).toBe("Overweight");
    expect(bmiCategory(30)).toBe("Obese");
  });
});

describe("estimateWeeksToGoal", () => {
  it("rounds up to whole weeks", () => {
    expect(estimateWeeksToGoal(80, 70, 0.5)).toBe(20);
    expect(estimateWeeksToGoal(80, 79.1, 0.25)).toBe(4); // 3.6 weeks
  });

  it("returns null when maintaining", () => {
    expect(estimateWeeksToGoal(80, 70, 0)).toBeNull();
  });

  it("returns null when the goal is reached or above the current weight", () => {
    expect(estimateWeeksToGoal(70, 70, 0.5)).toBeNull();
    expect(estimateWeeksToGoal(68, 70, 0.5)).toBeNull();
  });
});

describe("movingAverage", () => {
  it("averages a trailing 7-day window by default, from the second reading on", () => {
    const result = movingAverage([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.slice(0, 3)).toEqual([null, 1.5, 2]); // one reading isn't an average yet
    expect(result[6]).toBe(4); // (1..7) / 7
    expect(result[7]).toBe(5); // (2..8) / 7
  });

  it("skips nulls instead of treating them as zero", () => {
    expect(movingAverage([70, null, 72, 74], 3)).toEqual([null, null, 71, 73]);
  });

  it("never carries an average into a day without a reading", () => {
    expect(movingAverage([70, 71, null, null, 73, null], 3)).toEqual([null, 70.5, null, null, null, null]);
    expect(movingAverage([null, null, 70, null, null, null], 3)).toEqual([null, null, null, null, null, null]);
  });

  it("can ask for a different number of readings", () => {
    expect(movingAverage([70, null, 72], 3, 1)).toEqual([70, null, 71]);
    expect(() => movingAverage([1, 2], 7, 0)).toThrow(RangeError);
  });

  it("handles empty input and a window of 1", () => {
    expect(movingAverage([])).toEqual([]);
    expect(movingAverage([70, null, 71], 1, 1)).toEqual([70, null, 71]);
    expect(movingAverage([70, null, 71], 1)).toEqual([null, null, null]);
  });

  it("handles decimals", () => {
    const [, second] = movingAverage([70.1, 70.2], 7);
    expect(second).toBeCloseTo(70.15);
  });

  it("rejects an invalid window", () => {
    expect(() => movingAverage([1, 2], 0)).toThrow(RangeError);
    expect(() => movingAverage([1, 2], 2.5)).toThrow(RangeError);
  });
});

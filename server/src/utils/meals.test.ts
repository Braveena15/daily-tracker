/// <reference types="vitest/globals" />
import {
  averageFiber,
  calorieBalance,
  dayTotals,
  estimatedBurn,
  isLowIntake,
  isOnTarget,
  itemKcal,
  itemMacro,
  totalsByMeal,
  weeklySummary,
  type MealItemLike,
} from "./meals";

const rice: MealItemLike = { mealType: "lunch", servings: 1.5, kcalPerServing: 333, proteinG: 6, carbsG: 70, fiberG: 4.5 };
const egg: MealItemLike = { mealType: "breakfast", servings: 2, kcalPerServing: 78, proteinG: 6.3, fatG: 5.3 };
const tea: MealItemLike = { mealType: "snack", servings: 1, kcalPerServing: 40 };

describe("itemKcal", () => {
  it("multiplies servings by kcal per serving", () => {
    expect(itemKcal({ servings: 2, kcalPerServing: 78 })).toBe(156);
  });

  it("rounds to a whole number", () => {
    expect(itemKcal({ servings: 1.5, kcalPerServing: 333 })).toBe(500); // 499.5
    expect(itemKcal({ servings: 0.25, kcalPerServing: 90 })).toBe(23); // 22.5
  });

  it("is 0 for a zero-calorie food", () => {
    expect(itemKcal({ servings: 3, kcalPerServing: 0 })).toBe(0);
  });
});

describe("dayTotals", () => {
  it("adds up kcal and each macro × servings", () => {
    expect(dayTotals([rice, egg, tea])).toEqual({
      kcal: 500 + 156 + 40,
      proteinG: 9 + 12.6,
      carbsG: 105,
      fatG: 10.6,
      fiberG: 6.8, // 1.5 × 4.5 = 6.75 → 1 decimal
    });
  });

  it("returns null macros when no item has them", () => {
    expect(dayTotals([tea])).toEqual({ kcal: 40, proteinG: null, carbsG: null, fatG: null, fiberG: null });
  });

  it("is all zero/null for an empty day", () => {
    expect(dayTotals([])).toEqual({ kcal: 0, proteinG: null, carbsG: null, fatG: null, fiberG: null });
  });

  it("sums the rounded item kcal so items add up to the total", () => {
    const halves: MealItemLike[] = [
      { mealType: "lunch", servings: 0.5, kcalPerServing: 101 }, // 50.5 → 51
      { mealType: "lunch", servings: 0.5, kcalPerServing: 101 }, // 50.5 → 51
    ];
    expect(dayTotals(halves).kcal).toBe(102);
  });
});

describe("totalsByMeal", () => {
  it("groups items by meal and includes empty meals", () => {
    const byMeal = totalsByMeal([rice, egg, tea]);
    expect(byMeal.breakfast.kcal).toBe(156);
    expect(byMeal.lunch.kcal).toBe(500);
    expect(byMeal.snack.kcal).toBe(40);
    expect(byMeal.dinner).toEqual({ kcal: 0, proteinG: null, carbsG: null, fatG: null, fiberG: null });
    expect(byMeal.lunch.fiberG).toBe(6.8);
    expect(byMeal.breakfast.fiberG).toBeNull();
  });
});

describe("fibre", () => {
  it("is servings × fibre per serving for one item, 1 decimal", () => {
    expect(itemMacro({ servings: 2, fiberG: 3.1 }, "fiberG")).toBe(6.2);
    expect(itemMacro({ servings: 0.25, fiberG: 3 }, "fiberG")).toBe(0.8); // 0.75
    expect(itemMacro({ servings: 2 }, "fiberG")).toBeNull();
  });

  it("counts 0 g as real fibre data", () => {
    const water: MealItemLike = { mealType: "snack", servings: 1, kcalPerServing: 0, fiberG: 0 };
    expect(dayTotals([water]).fiberG).toBe(0);
  });

  it("only adds the items that have fibre", () => {
    expect(dayTotals([rice, tea]).fiberG).toBe(6.8);
  });

  it("averages daily fibre over days that have any", () => {
    expect(averageFiber([{ fiberG: 20 }, { fiberG: null }, { fiberG: 25 }, { fiberG: 18 }])).toBe(21);
    expect(averageFiber([{ fiberG: 10 }, { fiberG: 15 }])).toBe(12.5);
    expect(averageFiber([{ fiberG: null }])).toBeNull();
    expect(averageFiber([])).toBeNull();
  });
});

describe("estimatedBurn", () => {
  it("uses BMR + the watch's active calories when given", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, activeCalories: 450 })).toEqual({
      burn: 2150,
      source: "watch",
    });
  });

  it("uses the watch's resting calories instead of BMR when both are synced", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, activeCalories: 450, restingCalories: 1550 })).toEqual({
      burn: 2000,
      source: "watch",
    });
  });

  it("ignores resting calories without active calories (TDEE already covers the day)", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, restingCalories: 1550 })).toEqual({ burn: 2635, source: "estimate" });
  });

  it("treats 0 active calories as a real watch reading", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, activeCalories: 0 })).toEqual({ burn: 1700, source: "watch" });
  });

  it("falls back to TDEE without a watch reading", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635 })).toEqual({ burn: 2635, source: "estimate" });
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, activeCalories: null })).toEqual({
      burn: 2635,
      source: "estimate",
    });
  });
});

describe("calorieBalance", () => {
  it("gives remaining = target − eaten and net = eaten − burn", () => {
    expect(calorieBalance({ eaten: 1500, target: 2000, burn: 2400 })).toEqual({ remaining: 500, netVsBurn: -900 });
  });

  it("goes negative when over the target, positive when eating more than burned", () => {
    expect(calorieBalance({ eaten: 2600, target: 2000, burn: 2400 })).toEqual({ remaining: -600, netVsBurn: 200 });
  });
});

describe("isOnTarget", () => {
  it("accepts anything within ±10%", () => {
    expect(isOnTarget(1800, 2000)).toBe(true);
    expect(isOnTarget(2200, 2000)).toBe(true);
    expect(isOnTarget(1799, 2000)).toBe(false);
    expect(isOnTarget(2201, 2000)).toBe(false);
  });
});

describe("weeklySummary", () => {
  const days = [
    { date: "2026-11-13", kcal: 2000 },
    { date: "2026-11-14", kcal: null },
    { date: "2026-11-15", kcal: 1500 },
    { date: "2026-11-16", kcal: 2150 },
    { date: "2026-11-17", kcal: null },
    { date: "2026-11-18", kcal: 2600 },
    { date: "2026-11-19", kcal: 1950 },
  ];

  it("averages only the logged days and counts days within ±10%", () => {
    expect(weeklySummary(days, 2000)).toEqual({ average: 2040, loggedDays: 5, daysOnTarget: 3 });
  });

  it("has no on-target count without a target", () => {
    expect(weeklySummary(days, null).daysOnTarget).toBeNull();
  });

  it("has no average when nothing was logged", () => {
    expect(weeklySummary([{ date: "2026-11-19", kcal: null }], 2000)).toEqual({
      average: null,
      loggedDays: 0,
      daysOnTarget: 0,
    });
  });
});

describe("isLowIntake", () => {
  it("is true when each of the last 3 logged days is below the minimum", () => {
    expect(isLowIntake([1100, 1300, 900], 1500)).toBe(true);
  });

  it("is false if any of the last 3 days reached the minimum", () => {
    expect(isLowIntake([1100, 1500, 900], 1500)).toBe(false);
  });

  it("only looks at the 3 most recent days", () => {
    expect(isLowIntake([1000, 1000, 1000, 2500], 1200)).toBe(true);
    expect(isLowIntake([2500, 1000, 1000, 1000], 1200)).toBe(false);
  });

  it("needs at least 3 logged days", () => {
    expect(isLowIntake([800, 900], 1200)).toBe(false);
    expect(isLowIntake([], 1200)).toBe(false);
  });
});

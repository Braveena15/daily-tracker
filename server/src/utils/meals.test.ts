/// <reference types="vitest/globals" />
import {
  averageFiber,
  dayFraction,
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

// Times below are Asia/Colombo (UTC+05:30)
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

describe("dayFraction", () => {
  it("is the share of today gone by since local midnight", () => {
    expect(dayFraction("2026-11-21", at("2026-11-21", "06:00"))).toBe(0.25);
    expect(dayFraction("2026-11-21", at("2026-11-21", "18:00"))).toBe(0.75);
    expect(dayFraction("2026-11-21", at("2026-11-21", "00:00"))).toBe(0);
  });

  it("uses the Colombo date, not UTC: 00:30 local is already the new day", () => {
    // 2026-11-20T19:00Z is 00:30 on the 21st in Colombo
    const now = new Date("2026-11-20T19:00:00Z");
    expect(dayFraction("2026-11-21", now)).toBeCloseTo(30 / 1440);
    expect(dayFraction("2026-11-20", now)).toBe(1);
  });

  it("is 1 for a past day and 0 for a future day", () => {
    expect(dayFraction("2026-11-20", at("2026-11-21", "06:00"))).toBe(1);
    expect(dayFraction("2026-11-22", at("2026-11-21", "06:00"))).toBe(0);
  });
});

describe("estimatedBurn so far", () => {
  const base = { bmr: 1290, tdee: 2000 };

  it("counts 25% of BMR at 06:00, plus today's active calories", () => {
    expect(estimatedBurn({ ...base, activeCalories: 28, date: "2026-11-21", now: at("2026-11-21", "06:00") })).toEqual({
      burn: 323 + 28, // 1290 × 0.25 = 322.5 → 323
      source: "entry",
      resting: 323,
      active: 28,
      projected: 1290 + 28,
      soFar: true,
    });
  });

  it("no longer adds a whole day's BMR in the morning (the 1,318 kcal at 11:11 bug)", () => {
    const burn = estimatedBurn({ ...base, activeCalories: 28, date: "2026-11-21", now: at("2026-11-21", "11:11") });
    expect(burn.burn).toBe(Math.round(1290 * (671 / 1440)) + 28); // 601 + 28
    expect(burn.projected).toBe(1318);
  });

  it("uses the same share of TDEE without entered active calories", () => {
    expect(estimatedBurn({ ...base, date: "2026-11-21", now: at("2026-11-21", "12:00") })).toEqual({
      burn: 1000,
      source: "estimate",
      resting: 1000,
      active: null,
      projected: 2000,
      soFar: true,
    });
  });

  it("uses full-day values for a past day: BMR + the active calories you entered", () => {
    const now = at("2026-11-21", "06:00");
    expect(estimatedBurn({ ...base, activeCalories: 160, date: "2026-11-20", now })).toMatchObject({ burn: 1450, resting: 1290, projected: 1450, soFar: false });
    expect(estimatedBurn({ ...base, date: "2026-11-20", now })).toMatchObject({ burn: 2000, source: "estimate", soFar: false });
  });

  it("compares eaten with the burn so far and the expected full-day burn", () => {
    expect(calorieBalance({ eaten: 280, target: 1800, burn: 590, projectedBurn: 1400 })).toEqual({
      remaining: 1520,
      netVsBurn: -310,
      netVsProjected: -1120,
    });
  });
});

describe("estimatedBurn", () => {
  it("uses BMR + the active calories you entered", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, activeCalories: 450 })).toMatchObject({
      burn: 2150,
      source: "entry",
    });
  });

  it("treats 0 active calories as a real entry", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, activeCalories: 0 })).toMatchObject({ burn: 1700, source: "entry" });
  });

  it("falls back to the TDEE estimate without an entry", () => {
    expect(estimatedBurn({ bmr: 1700, tdee: 2635 })).toMatchObject({ burn: 2635, source: "estimate" });
    expect(estimatedBurn({ bmr: 1700, tdee: 2635, activeCalories: null })).toMatchObject({
      burn: 2635,
      source: "estimate",
    });
  });
});

describe("calorieBalance", () => {
  it("gives remaining = target − eaten and net = eaten − burn", () => {
    expect(calorieBalance({ eaten: 1500, target: 2000, burn: 2400 })).toEqual({ remaining: 500, netVsBurn: -900, netVsProjected: null });
  });

  it("goes negative when over the target, positive when eating more than burned", () => {
    expect(calorieBalance({ eaten: 2600, target: 2000, burn: 2400 })).toEqual({ remaining: -600, netVsBurn: 200, netVsProjected: null });
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

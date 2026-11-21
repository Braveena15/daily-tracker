/// <reference types="vitest/globals" />
import { copyMealsSchema, createFoodSchema, saveMealDaySchema, updateFoodSchema } from "./mealSchema";

const item = { mealType: "lunch", name: "Rice and curry", servings: 1, kcalPerServing: 650 };

describe("createFoodSchema", () => {
  it("accepts a food and defaults isFavourite to false", () => {
    const food = createFoodSchema.parse({ name: "  Toast ", servingDescription: "1 slice", kcalPerServing: 80 });
    expect(food).toEqual({ name: "Toast", servingDescription: "1 slice", kcalPerServing: 80, isFavourite: false });
  });

  it("requires a name, serving and calories", () => {
    expect(createFoodSchema.safeParse({ name: " ", servingDescription: "1", kcalPerServing: 1 }).success).toBe(false);
    expect(createFoodSchema.safeParse({ name: "Toast", kcalPerServing: 80 }).success).toBe(false);
    expect(createFoodSchema.safeParse({ name: "Toast", servingDescription: "1 slice" }).success).toBe(false);
  });

  it("rejects negative or huge numbers and unknown fields", () => {
    const base = { name: "Toast", servingDescription: "1 slice", kcalPerServing: 80 };
    expect(createFoodSchema.safeParse({ ...base, kcalPerServing: -1 }).success).toBe(false);
    expect(createFoodSchema.safeParse({ ...base, proteinG: 501 }).success).toBe(false);
    expect(createFoodSchema.safeParse({ ...base, fiberG: 101 }).success).toBe(false);
    expect(createFoodSchema.safeParse({ ...base, fiberG: -1 }).success).toBe(false);
    expect(createFoodSchema.safeParse({ ...base, userId: "x" }).success).toBe(false);
  });
});

describe("fibre", () => {
  const base = { name: "Oats", servingDescription: "1 bowl", kcalPerServing: 330 };

  it("accepts fibre from 0 to 100 g per serving", () => {
    expect(createFoodSchema.parse({ ...base, fiberG: 6 }).fiberG).toBe(6);
    expect(createFoodSchema.parse({ ...base, fiberG: 0 }).fiberG).toBe(0);
    expect(createFoodSchema.parse({ ...base, fiberG: 100 }).fiberG).toBe(100);
  });

  it("explains the range", () => {
    const result = createFoodSchema.safeParse({ ...base, fiberG: 150 });
    expect(result.success ? null : result.error.issues[0]?.message).toBe("Fibre must be between 0 and 100 g");
  });

  it("can be cleared on update and is kept in a meal item's snapshot", () => {
    expect(updateFoodSchema.parse({ fiberG: null })).toEqual({ fiberG: null });
    expect(saveMealDaySchema.parse({ items: [{ ...item, fiberG: 7 }] }).items[0]?.fiberG).toBe(7);
  });
});

describe("updateFoodSchema", () => {
  it("allows partial updates and null to clear a macro", () => {
    expect(updateFoodSchema.parse({ isFavourite: true, fatG: null })).toEqual({ isFavourite: true, fatG: null });
  });
});

describe("saveMealDaySchema", () => {
  it("accepts a valid day", () => {
    expect(saveMealDaySchema.parse({ items: [item] }).items).toHaveLength(1);
  });

  it("checks servings are between 0.25 and 10", () => {
    expect(saveMealDaySchema.safeParse({ items: [{ ...item, servings: 0.25 }] }).success).toBe(true);
    expect(saveMealDaySchema.safeParse({ items: [{ ...item, servings: 0.1 }] }).success).toBe(false);
    expect(saveMealDaySchema.safeParse({ items: [{ ...item, servings: 11 }] }).success).toBe(false);
  });

  it("rejects an unknown meal type, a bad food id or a bad time", () => {
    expect(saveMealDaySchema.safeParse({ items: [{ ...item, mealType: "brunch" }] }).success).toBe(false);
    expect(saveMealDaySchema.safeParse({ items: [{ ...item, foodId: "nope" }] }).success).toBe(false);
    expect(saveMealDaySchema.safeParse({ items: [{ ...item, time: "25:00" }] }).success).toBe(false);
    expect(
      saveMealDaySchema.safeParse({ items: [{ ...item, foodId: "65a1b2c3d4e5f60718293a4b", time: "08:30" }] }).success,
    ).toBe(true);
  });

  it("limits a day to 100 items", () => {
    expect(saveMealDaySchema.safeParse({ items: Array(101).fill(item) }).success).toBe(false);
  });
});

describe("copyMealsSchema", () => {
  it("needs a real fromDate and an optional meal", () => {
    expect(copyMealsSchema.safeParse({ fromDate: "2026-11-18" }).success).toBe(true);
    expect(copyMealsSchema.safeParse({ fromDate: "2026-11-18", mealType: "dinner" }).success).toBe(true);
    expect(copyMealsSchema.safeParse({ fromDate: "2026-02-30" }).success).toBe(false);
    expect(copyMealsSchema.safeParse({}).success).toBe(false);
  });
});

/// <reference types="vitest/globals" />
import { createDiarySchema, createThoughtSchema, purposeSchema, updateThoughtSchema, videoSchema } from "./mindSchema";

describe("createDiarySchema", () => {
  it("needs some text and tidies tags", () => {
    expect(createDiarySchema.safeParse({ body: "  " }).success).toBe(false);
    const entry = createDiarySchema.parse({ body: "Today was calm.", tags: ["Work", "work ", "Family"] });
    expect(entry).toMatchObject({ title: "", tags: ["work", "family"], isFavourite: false });
  });

  it("allows up to 20,000 characters", () => {
    expect(createDiarySchema.safeParse({ body: "x".repeat(20_000) }).success).toBe(true);
    expect(createDiarySchema.safeParse({ body: "x".repeat(20_001) }).success).toBe(false);
  });

  it("rejects future dates", () => {
    expect(createDiarySchema.safeParse({ body: "hi", date: "2999-01-01" }).success).toBe(false);
  });
});

describe("thought log schemas", () => {
  it("needs the thought to create, but not to update", () => {
    expect(createThoughtSchema.safeParse({ situation: "At work" }).success).toBe(false);
    expect(updateThoughtSchema.safeParse({ smallStepDone: true }).success).toBe(true);
  });

  it("only accepts known thinking traps and 0–10 ratings", () => {
    const base = { thought: "I always mess up" };
    expect(createThoughtSchema.safeParse({ ...base, distortions: ["labelling", "overgeneralising"] }).success).toBe(true);
    expect(createThoughtSchema.safeParse({ ...base, distortions: ["made-up"] }).success).toBe(false);
    expect(createThoughtSchema.safeParse({ ...base, feelings: [{ name: "Anxious", intensityBefore: 11 }] }).success).toBe(false);
    expect(createThoughtSchema.safeParse({ ...base, intensityAfter: 4 }).success).toBe(true);
  });
});

describe("purposeSchema", () => {
  it("removes duplicate values and fills defaults", () => {
    expect(purposeSchema.parse({ coreValues: ["Kindness", "Kindness"], longTermGoals: [{ title: "Run 10k" }] })).toEqual({
      purposeStatement: "",
      coreValues: ["Kindness"],
      longTermGoals: [{ title: "Run 10k", why: "" }],
    });
  });
});

describe("videoSchema", () => {
  it("accepts YouTube links only", () => {
    const base = { title: "Calm", category: "calm" };
    expect(videoSchema.safeParse({ ...base, youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" }).success).toBe(true);
    expect(videoSchema.safeParse({ ...base, youtubeUrl: "https://example.com/video" }).success).toBe(false);
  });
});

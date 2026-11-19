/// <reference types="vitest/globals" />
import { containsCrisisLanguage, isLowMoodStreak } from "./safety";

describe("containsCrisisLanguage", () => {
  it.each([
    "I've been thinking about suicide",
    "feeling suicidal tonight",
    "I want to kill myself",
    "sometimes I think about killing myself",
    "I just want to end my life",
    "I want to end it all",
    "I want to die",
    "i wanna die",
    "I wish I was dead",
    "Everyone would be better off without me",
    "I don't want to live anymore",
    "I dont want to be alive",
    "I don’t want to wake up tomorrow", // curly apostrophe
    "There's no reason to live",
    "nothing to live for",
    "life isn't worth living",
    "I can't go on like this",
    "I've been self-harming again",
    "self harm",
    "I hurt myself last night",
    "I keep cutting myself",
    "thinking about an overdose",
    "I WANT TO DIE", // any case
    "I want   to\n die", // odd spacing
  ])("matches %j", (text) => {
    expect(containsCrisisLanguage(text)).toBe(true);
  });

  it.each([
    "Had a great day at the beach",
    "I'm dying to try that new cafe", // "dying to" is a common happy phrase
    "My phone died",
    "I want to live a healthier life",
    "The plant is dead, I forgot to water it",
    "",
  ])("does not match %j", (text) => {
    expect(containsCrisisLanguage(text)).toBe(false);
  });

  it("checks several fields together and ignores empty ones", () => {
    expect(containsCrisisLanguage("A title", undefined, null, "body: i want to die")).toBe(true);
    expect(containsCrisisLanguage(undefined, null)).toBe(false);
  });
});

describe("isLowMoodStreak", () => {
  it("is true when 5 of the last 7 logged days had mood 3 or lower", () => {
    expect(isLowMoodStreak([2, 3, 6, 1, 3, 7, 2])).toBe(true);
  });

  it("is false with only 4 low days", () => {
    expect(isLowMoodStreak([2, 3, 6, 1, 5, 7, 2])).toBe(false);
  });

  it("only looks at the 7 most recent days", () => {
    expect(isLowMoodStreak([8, 8, 8, 2, 2, 2, 2, 2, 2])).toBe(false);
  });

  it("needs at least 5 logged days", () => {
    expect(isLowMoodStreak([1, 1, 1, 1])).toBe(false);
    expect(isLowMoodStreak([1, 1, 1, 1, 1])).toBe(true);
  });
});

/// <reference types="vitest/globals" />
import { todayInTimezone } from "./dates";
import {
  canUndoEnd,
  change,
  consistencyPercent,
  dueCheckIn,
  plannedEndDate,
  programClock,
  programWeeks,
  progressTowardGoal,
  reportRange,
  weekOfProgram,
} from "./program";

const START = "2026-11-01";

describe("programClock", () => {
  it("day 1 shows the full length left, the last day shows 1, then it's finished", () => {
    expect(programClock(START, 100, START)).toMatchObject({ dayNumber: 1, daysLeft: 100, phase: "running" });
    expect(programClock(START, 100, "2026-11-14")).toMatchObject({ dayNumber: 14, daysLeft: 87 });
    const last = plannedEndDate(START, 100);
    expect(last).toBe("2027-02-08");
    expect(programClock(START, 100, last)).toMatchObject({ dayNumber: 100, daysLeft: 1, phase: "running" });
    expect(programClock(START, 100, "2027-02-09")).toMatchObject({ dayNumber: 100, daysLeft: 0, phase: "finished", percent: 100 });
  });

  it("a program that starts later counts down to its start", () => {
    expect(programClock("2026-11-05", 30, START)).toMatchObject({ dayNumber: 0, daysLeft: 30, startsIn: 4, phase: "upcoming" });
  });

  it("changes at midnight in Asia/Colombo (UTC+5:30), not UTC", () => {
    // 23:59:59 in Colombo on Nov 1 = 18:29:59 UTC; one second later it's Nov 2 in Colombo
    const before = todayInTimezone("Asia/Colombo", new Date("2026-11-01T18:29:59Z"));
    const after = todayInTimezone("Asia/Colombo", new Date("2026-11-01T18:30:00Z"));
    expect(programClock(START, 100, before)).toMatchObject({ dayNumber: 1, daysLeft: 100 });
    expect(programClock(START, 100, after)).toMatchObject({ dayNumber: 2, daysLeft: 99 });
    // Still Nov 1 in UTC at that moment
    expect(new Date("2026-11-01T18:30:00Z").toISOString().slice(0, 10)).toBe("2026-11-01");
  });
});

describe("reportRange", () => {
  it("ended early on day N covers only days 1..N", () => {
    expect(reportRange({ status: "ended_early", startDate: START, lengthDays: 100, endedOnDay: 37 }, "2026-12-30")).toEqual({
      from: START,
      to: "2026-12-07",
      days: 37,
      partial: true,
    });
  });

  it("an active program is a live preview up to today; a completed one covers every day", () => {
    expect(reportRange({ status: "active", startDate: START, lengthDays: 100 }, "2026-11-10")).toMatchObject({ to: "2026-11-10", days: 10 });
    expect(reportRange({ status: "completed", startDate: START, lengthDays: 30 }, "2027-05-01")).toMatchObject({ to: "2026-11-30", days: 30, partial: false });
  });
});

describe("consistencyPercent", () => {
  it("divides by the days completed, not the program length", () => {
    expect(consistencyPercent(30, 37)).toBe(81);
    expect(consistencyPercent(37, 37)).toBe(100);
    expect(consistencyPercent(0, 0)).toBe(0);
    expect(consistencyPercent(40, 37)).toBe(100);
  });
});

describe("programWeeks / weekOfProgram", () => {
  it("lists whole weeks and marks a short last week as partial", () => {
    const weeks = programWeeks(START, 37);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual({ week: 1, from: START, to: "2026-11-07", days: 7, partial: false });
    expect(weeks[5]).toEqual({ week: 6, from: "2026-12-06", to: "2026-12-07", days: 2, partial: true });
  });

  it('says "Week 3 of 15" inside the program only', () => {
    expect(weekOfProgram(START, 100, "2026-11-15")).toEqual({ week: 3, of: 15 });
    expect(weekOfProgram(START, 100, "2026-10-31")).toBeNull();
  });
});

describe("dueCheckIn", () => {
  const p = { status: "active" as const, startDate: START, lengthDays: 100, midpointDone: false, finalDone: false };
  it("offers the midpoint from day 50 and the final from the last day", () => {
    expect(dueCheckIn(p, "2026-12-19")).toBeNull(); // day 49
    expect(dueCheckIn(p, "2026-12-20")).toBe("midpoint"); // day 50
    expect(dueCheckIn({ ...p, midpointDone: true }, "2026-12-20")).toBeNull();
    expect(dueCheckIn(p, "2027-02-08")).toBe("final"); // day 100
    expect(dueCheckIn({ ...p, status: "completed" }, "2027-03-01")).toBe("final");
    expect(dueCheckIn({ ...p, finalDone: true }, "2027-02-08")).toBeNull();
    expect(dueCheckIn({ ...p, status: "ended_early" }, "2026-12-20")).toBeNull();
  });
});

describe("canUndoEnd", () => {
  it("is available for 24 hours after ending early", () => {
    const endedAt = new Date("2026-11-20T10:00:00Z");
    expect(canUndoEnd({ status: "ended_early", endedAt }, new Date("2026-11-21T09:59:59Z"))).toBe(true);
    expect(canUndoEnd({ status: "ended_early", endedAt }, new Date("2026-11-21T10:00:00Z"))).toBe(false);
    expect(canUndoEnd({ status: "completed", endedAt }, new Date("2026-11-20T11:00:00Z"))).toBe(false);
  });
});

describe("progressTowardGoal / change", () => {
  it("is the share of the way from start to goal, clamped to 0–100", () => {
    expect(progressTowardGoal(80, 70, 77.7)).toBe(23);
    expect(progressTowardGoal(4, 8, 7)).toBe(75);
    expect(progressTowardGoal(80, 70, 82)).toBe(0);
    expect(progressTowardGoal(80, 70, 65)).toBe(100);
    expect(progressTowardGoal(80, 80, 79)).toBeNull();
    expect(progressTowardGoal(null, 70, 75)).toBeNull();
  });

  it("rounds the change", () => {
    expect(change(80, 77.7)).toBe(-2.3);
    expect(change(5.2, 6.6)).toBe(1.4);
    expect(change(null, 3)).toBeNull();
  });
});

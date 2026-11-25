/// <reference types="vitest/globals" />
import { planIntensityMigration, planPurposesMigration } from "./purposesMigration";

let counter = 0;
const id = () => `id${++counter}`;
beforeEach(() => {
  counter = 0;
});

const setAt = new Date("2026-11-20T02:00:00.000Z");
const updatedAt = new Date("2026-11-20T15:00:00.000Z");

describe("planPurposesMigration", () => {
  it("moves the single purpose with its values, intentions and rating, and the note to the day", () => {
    const plan = planPurposesMigration(
      {
        date: "2026-11-20",
        dailyPurpose: {
          text: "ENC(purpose)",
          focusValues: ["Family"],
          intentions: [{ _id: "i1", text: "ENC(call)", done: true, doneAt: updatedAt }, { _id: "i2", text: "ENC(walk)", done: false }],
          reflection: { rating: 4, note: "ENC(note)", at: updatedAt },
          setAt,
          updatedAt,
        },
      },
      id,
    )!;
    expect(plan.set).toEqual({
      dailyPurposes: [
        {
          _id: "id1",
          text: "ENC(purpose)",
          focusValues: ["Family"],
          intentions: [
            { _id: "i1", text: "ENC(call)", done: true, doneAt: updatedAt },
            { _id: "i2", text: "ENC(walk)", done: false },
          ],
          legacyRating: 4,
          createdAt: setAt,
          updatedAt,
        },
      ],
      dailyReflectionNote: "ENC(note)",
    });
    expect(plan.unset).toEqual(["dailyPurpose"]);
    expect(plan.counts).toEqual({ purposes: 1, intentions: 1 + 1, ratings: 1, notes: 1 });
  });

  it("is safe to run twice: a day already moved has nothing to do", () => {
    expect(planPurposesMigration({ date: "2026-11-20", dailyPurposes: [{ _id: "a", text: "ENC" }] })).toBeNull();
    expect(planPurposesMigration({ date: "2026-11-20" })).toBeNull();
  });

  it("turns several purpose lines into several purposes; the first keeps the intentions and rating", () => {
    const plan = planPurposesMigration(
      {
        date: "2026-11-20",
        dailyPurpose: {
          text: "ENC(old)", // replaced by the lines
          purposes: [{ _id: "a", text: "ENC(a)", at: setAt }, { _id: "b", text: "ENC(b)", at: updatedAt }],
          intentions: [{ _id: "i1", text: "ENC(i)", done: false }],
          reflection: { rating: 3, at: updatedAt },
          setAt,
        },
      },
      id,
    )!;
    const moved = plan.set.dailyPurposes as { _id: string; text: string; intentions: unknown[]; legacyRating?: number; createdAt: Date }[];
    expect(moved.map((p) => [p._id, p.text, p.intentions.length, p.legacyRating])).toEqual([
      ["a", "ENC(a)", 1, 3],
      ["b", "ENC(b)", 0, undefined],
    ]);
    expect(moved[1]!.createdAt).toEqual(updatedAt);
    expect(plan.set).not.toHaveProperty("dailyReflectionNote");
  });

  it("keeps intentions that had no purpose text, under an empty purpose", () => {
    const plan = planPurposesMigration({ date: "2026-11-20", dailyPurpose: { intentions: [{ _id: "i1", text: "ENC(i)" }] } }, id)!;
    expect(plan.set.dailyPurposes).toEqual([
      expect.objectContaining({ text: "", intentions: [{ _id: "i1", text: "ENC(i)", done: false }], createdAt: new Date("2026-11-20T06:30:00.000Z") }),
    ]);
  });

  it("just removes an empty old purpose", () => {
    expect(planPurposesMigration({ date: "2026-11-20", dailyPurpose: { focusValues: [], intentions: [] } }, id)).toEqual({
      set: {},
      unset: ["dailyPurpose"],
      counts: { purposes: 0, intentions: 0, ratings: 0, notes: 0 },
    });
  });

  it("keeps purposes and a note already in the new fields, after the moved one", () => {
    const plan = planPurposesMigration(
      { date: "2026-11-20", dailyPurpose: { text: "ENC(old)", reflection: { rating: 5, note: "ENC(old note)" } }, dailyPurposes: [{ _id: "new" }], dailyReflectionNote: "ENC(new note)" },
      id,
    )!;
    expect((plan.set.dailyPurposes as { _id: string }[]).map((p) => p._id)).toEqual(["id1", "new"]);
    expect(plan.set).not.toHaveProperty("dailyReflectionNote");
  });
});

describe("planIntensityMigration", () => {
  it("keeps each old rating as legacyRating and leaves the intensity empty", () => {
    const plan = planIntensityMigration({
      dailyPurposes: [
        { _id: "a", text: "ENC(a)", rating: 4, intentions: [] },
        { _id: "b", text: "ENC(b)", intensity: 7 },
      ],
    })!;
    expect(plan.set.dailyPurposes).toEqual([
      { _id: "a", text: "ENC(a)", legacyRating: 4, intentions: [] },
      { _id: "b", text: "ENC(b)", intensity: 7 },
    ]);
    expect(plan.moved).toBe(1);
  });

  it("is safe to run twice: nothing to do once no rating is left", () => {
    expect(planIntensityMigration({ dailyPurposes: [{ _id: "a", legacyRating: 4 }] })).toBeNull();
    expect(planIntensityMigration({ dailyPurposes: [] })).toBeNull();
    expect(planIntensityMigration({})).toBeNull();
  });

  it("drops a rating that isn't a number, and never overwrites an existing legacyRating", () => {
    const plan = planIntensityMigration({ dailyPurposes: [{ _id: "a", rating: null }, { _id: "b", rating: 2, legacyRating: 5 }] })!;
    expect(plan.set.dailyPurposes).toEqual([{ _id: "a" }, { _id: "b", legacyRating: 5 }]);
  });
});

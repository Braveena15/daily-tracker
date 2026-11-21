/// <reference types="vitest/globals" />
import { planTimelineMigration } from "./timelineMigration";

let counter = 0;
const id = () => `id${++counter}`;
beforeEach(() => {
  counter = 0;
});

const updatedAt = new Date("2026-11-20T15:00:00.000Z");

const oldDay = {
  date: "2026-11-20",
  updatedAt,
  createdAt: new Date("2026-11-20T03:00:00.000Z"),
  mood: 7,
  energy: 6,
  sleepHours: 7.5,
  workouts: [{ type: "Cycling", durationMin: 40 }, { type: "Running", durationMin: 20, source: "watch" }],
  mentalActivities: [{ type: "Meditation", durationMin: 10 }],
  outdoorActivities: [],
  goodThings: ["Coffee with a friend", "A quiet sunrise"],
  learnings: [{ topic: "Mongo indexes", minutes: 30 }],
  presentMoment: "Calm and grateful",
};

describe("planTimelineMigration", () => {
  it("converts an old day into timestamped entries", () => {
    const plan = planTimelineMigration(oldDay, id)!;
    expect(plan.set).toEqual({
      moodLogs: [{ _id: "id1", loggedAt: updatedAt, mood: 7, energy: 6 }],
      workouts: [
        { _id: "id2", loggedAt: updatedAt, type: "Cycling", durationMin: 40, source: "manual" },
        { _id: "id3", loggedAt: updatedAt, type: "Running", durationMin: 20, source: "watch" },
      ],
      mentalActivities: [{ _id: "id4", loggedAt: updatedAt, type: "Meditation", durationMin: 10 }],
      learnings: [{ _id: "id5", loggedAt: updatedAt, topic: "Mongo indexes", minutes: 30 }],
      goodThings: [
        { _id: "id6", loggedAt: updatedAt, text: "Coffee with a friend" },
        { _id: "id7", loggedAt: updatedAt, text: "A quiet sunrise" },
      ],
      presentMoments: [{ _id: "id8", loggedAt: updatedAt, text: "Calm and grateful" }],
    });
    expect(plan.unset.sort()).toEqual(["energy", "mood", "presentMoment"]);
    expect(plan.stamped).toBe(8);
  });

  it("changes nothing the second time", () => {
    const plan = planTimelineMigration(oldDay, id)!;
    const converted: Record<string, unknown> = { ...oldDay, ...plan.set };
    for (const key of plan.unset) delete converted[key];
    expect(planTimelineMigration(converted as typeof oldDay, id)).toBeNull();
  });

  it("uses createdAt, then midday, when updatedAt is missing", () => {
    const { updatedAt: _u, ...noUpdated } = oldDay;
    expect((planTimelineMigration(noUpdated, id)!.set.moodLogs as { loggedAt: Date }[])[0]!.loggedAt).toEqual(oldDay.createdAt);
    const bare = { date: "2026-11-20", mood: 5, energy: 5 };
    expect((planTimelineMigration(bare, id)!.set.moodLogs as { loggedAt: Date }[])[0]!.loggedAt.toISOString()).toBe(
      "2026-11-20T06:30:00.000Z",
    );
  });

  it("drops an empty present moment without creating an entry", () => {
    const plan = planTimelineMigration({ date: "2026-11-20", presentMoment: "  " }, id)!;
    expect(plan.set).toEqual({});
    expect(plan.unset).toEqual(["presentMoment"]);
  });

  it("leaves a watch-only day alone", () => {
    expect(planTimelineMigration({ date: "2026-11-20", steps: 5000, workouts: [], goodThings: [] }, id)).toBeNull();
  });
});

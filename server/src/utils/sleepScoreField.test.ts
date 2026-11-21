import { sleepScoreAfterSave, sleepScoreAfterSync } from "./sleepScoreField";

describe("sleepScoreAfterSync", () => {
  it("fills an empty or auto field with the calculated score", () => {
    expect(sleepScoreAfterSync(null, 80)).toEqual({ sleepScoreValue: 80, sleepScoreSource: "auto" });
    expect(sleepScoreAfterSync({}, 80)).toEqual({ sleepScoreValue: 80, sleepScoreSource: "auto" });
    expect(sleepScoreAfterSync({ sleepScoreValue: 70, sleepScoreSource: "auto" }, 80)).toEqual({ sleepScoreValue: 80, sleepScoreSource: "auto" });
  });

  it("keeps a manual value", () => {
    expect(sleepScoreAfterSync({ sleepScoreValue: 91, sleepScoreSource: "manual" }, 80)).toEqual({});
  });
});

describe("sleepScoreAfterSave", () => {
  const auto = { sleepScoreValue: 80, sleepScoreSource: "auto" as const, sleep: { score: 80 } };

  it("marks a typed-in score as manual", () => {
    expect(sleepScoreAfterSave(auto, 91)).toEqual({ set: { sleepScoreValue: 91, sleepScoreSource: "manual" }, unset: [] });
    expect(sleepScoreAfterSave(null, 91)).toEqual({ set: { sleepScoreValue: 91, sleepScoreSource: "manual" }, unset: [] });
  });

  it("keeps the source when the pre-filled value is saved unchanged", () => {
    expect(sleepScoreAfterSave(auto, 80).set).toEqual({ sleepScoreValue: 80, sleepScoreSource: "auto" });
    const manual = { sleepScoreValue: 91, sleepScoreSource: "manual" as const, sleep: { score: 80 } };
    expect(sleepScoreAfterSave(manual, 91).set).toEqual({ sleepScoreValue: 91, sleepScoreSource: "manual" });
  });

  it("clearing the field resets it to the calculated score as auto", () => {
    const manual = { sleepScoreValue: 91, sleepScoreSource: "manual" as const, sleep: { score: 80 } };
    expect(sleepScoreAfterSave(manual, null)).toEqual({ set: { sleepScoreValue: 80, sleepScoreSource: "auto" }, unset: [] });
    expect(sleepScoreAfterSave(manual, undefined).set).toEqual({ sleepScoreValue: 80, sleepScoreSource: "auto" });
  });

  it("clearing with no calculated score removes the field", () => {
    expect(sleepScoreAfterSave({ sleepScoreValue: 91, sleepScoreSource: "manual" }, null)).toEqual({
      set: {},
      unset: ["sleepScoreValue", "sleepScoreSource"],
    });
  });

  it("after clearing, a later sync can update it again", () => {
    const cleared = sleepScoreAfterSave({ sleepScoreValue: 91, sleepScoreSource: "manual", sleep: { score: 80 } }, null).set;
    expect(sleepScoreAfterSync(cleared as Parameters<typeof sleepScoreAfterSync>[0], 74)).toEqual({ sleepScoreValue: 74, sleepScoreSource: "auto" });
  });
});

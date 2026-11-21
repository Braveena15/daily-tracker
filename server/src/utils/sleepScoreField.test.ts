import { sleepScoreAfterSync } from "./sleepScoreField";

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

/// <reference types="vitest/globals" />
import {
  averageClockTime,
  clockDifference,
  consistencyLine,
  durationLine,
  formatDuration,
  interruptionsLine,
  mergeIntervals,
  parseInstant,
  parseSleepSamples,
  parseStage,
  sleepHoursFrom,
  sleepScore,
  summariseNight,
} from "./sleep";

// Times are Asia/Colombo (+05:30). The night ending on 2026-11-20.
const t = (day: 19 | 20, hhmm: string) => `2026-11-${day}T${hhmm}:00+05:30`;
const line = (start: string, end: string, stage: string) => `${start};${end};${stage}`;

// A Watch night: asleep 23:00 → 06:30, woken twice for 5 and 10 min, plus a 1-min blip
const WATCH_NIGHT = [
  line(t(19, "22:40"), t(20, "06:45"), "In Bed"),
  line(t(19, "23:00"), t(19, "23:20"), "Core"),
  line(t(19, "23:20"), t(20, "00:20"), "Deep"),
  line(t(20, "00:20"), t(20, "00:25"), "Awake"),
  line(t(20, "00:25"), t(20, "02:00"), "Core"),
  line(t(20, "02:00"), t(20, "02:30"), "REM"),
  line(t(20, "02:30"), t(20, "02:31"), "Awake"),
  line(t(20, "02:31"), t(20, "05:00"), "Core"),
  line(t(20, "05:00"), t(20, "05:10"), "Awake"),
  line(t(20, "05:10"), t(20, "06:30"), "REM"),
];

const EXPECTED_NIGHT = {
  totalSleepMin: 434, // 20 + 60 + 95 + 30 + 149 + 80
  deepMin: 60,
  remMin: 110,
  coreMin: 264,
  awakeCount: 2, // the 1-minute blip doesn't count
  awakeMin: 16,
  bedtime: "23:00",
  wakeTime: "06:30",
};

describe("parseStage", () => {
  it("matches stages case-insensitively and tolerates extra spaces", () => {
    expect(parseStage("In Bed")).toBe("inBed");
    expect(parseStage("  in   BED ")).toBe("inBed");
    expect(parseStage("ASLEEP")).toBe("asleep");
    expect(parseStage(" core")).toBe("core");
    expect(parseStage("Deep")).toBe("deep");
    expect(parseStage("rem")).toBe("rem");
    expect(parseStage("Awake ")).toBe("awake");
  });

  it('also reads older "Asleep Core" style names', () => {
    expect(parseStage("Asleep Core")).toBe("core");
    expect(parseStage("Asleep REM")).toBe("rem");
    expect(parseStage("Asleep Unspecified")).toBe("asleep");
  });

  it("returns null for anything else", () => {
    expect(parseStage("Napping")).toBeNull();
    expect(parseStage("")).toBeNull();
  });
});

describe("parseInstant", () => {
  it("reads ISO date-times with an offset", () => {
    expect(parseInstant("2026-11-19T23:00:00+05:30")).toBe(Date.parse("2026-11-19T17:30:00Z"));
    expect(parseInstant("2026-11-19T17:30:00Z")).toBe(Date.parse("2026-11-19T17:30:00Z"));
    expect(parseInstant(" 2026-11-19 23:00:00 +0530 ")).toBe(Date.parse("2026-11-19T17:30:00Z"));
    expect(parseInstant("2026-11-19T9:05+05:30")).toBe(Date.parse("2026-11-19T03:35:00Z"));
  });

  it("reads a time without an offset as Asia/Colombo time", () => {
    expect(parseInstant("2026-11-19T23:00:00")).toBe(Date.parse("2026-11-19T17:30:00Z"));
  });

  it("returns null for text that isn't an ISO date-time", () => {
    expect(parseInstant("yesterday at 11pm")).toBeNull();
    expect(parseInstant("2026-11-19")).toBeNull();
    expect(parseInstant("2026-13-40T25:00:00Z")).toBeNull();
  });
});

describe("parseSleepSamples", () => {
  it("parses one sample per line and skips lines that don't parse", () => {
    const text = [
      "",
      "start;end;stage",
      line(t(19, "23:00"), t(19, "23:30"), " core "),
      "garbage",
      line(t(19, "23:30"), t(19, "23:00"), "Deep"), // ends before it starts
      line(t(19, "23:30"), t(20, "00:30"), "Napping"), // unknown stage
      `${t(19, "23:30")};${t(20, "00:30")}`, // missing the stage
      line(t(19, "23:30"), t(20, "00:30"), "DEEP"),
    ].join("\r\n");

    expect(parseSleepSamples(text)).toEqual([
      { start: Date.parse(t(19, "23:00")), end: Date.parse(t(19, "23:30")), stage: "core" },
      { start: Date.parse(t(19, "23:30")), end: Date.parse(t(20, "00:30")), stage: "deep" },
    ]);
  });
});

describe("mergeIntervals", () => {
  it("joins overlapping and touching intervals", () => {
    expect(
      mergeIntervals([
        { start: 30, end: 40 },
        { start: 0, end: 10 },
        { start: 5, end: 20 },
        { start: 20, end: 25 },
      ]),
    ).toEqual([
      { start: 0, end: 25 },
      { start: 30, end: 40 },
    ]);
  });
});

describe("summariseNight", () => {
  it("adds up Core, Deep, REM and Asleep, and ignores In Bed", () => {
    expect(summariseNight(parseSleepSamples(WATCH_NIGHT.join("\n")), "2026-11-20")).toEqual(EXPECTED_NIGHT);
  });

  it("doesn't double-count when the Watch and iPhone both record the night", () => {
    const iphone = [
      line(t(19, "23:05"), t(20, "00:15"), "Asleep"), // inside the Watch's Core + Deep
      line(t(20, "00:30"), t(20, "02:00"), "Asleep"), // inside the Watch's Core
    ];
    const samples = parseSleepSamples([...WATCH_NIGHT, ...WATCH_NIGHT, ...iphone].join("\n"));
    expect(summariseNight(samples, "2026-11-20")).toEqual(EXPECTED_NIGHT);
  });

  it("counts unspecified Asleep time in the total but not in any stage", () => {
    const night = summariseNight(parseSleepSamples(line(t(19, "23:30"), t(20, "06:30"), "Asleep")), "2026-11-20");
    expect(night).toMatchObject({ totalSleepMin: 420, deepMin: 0, remMin: 0, coreMin: 0, awakeCount: 0, awakeMin: 0 });
  });

  it("only counts awake time between falling asleep and waking up", () => {
    const samples = parseSleepSamples(
      [
        line(t(19, "22:30"), t(19, "23:00"), "Awake"), // before falling asleep
        line(t(19, "23:00"), t(20, "03:00"), "Core"),
        line(t(20, "03:00"), t(20, "03:04"), "Awake"),
        line(t(20, "03:04"), t(20, "06:00"), "Core"),
        line(t(20, "06:00"), t(20, "07:00"), "Awake"), // after waking up
      ].join("\n"),
    );
    expect(summariseNight(samples, "2026-11-20")).toMatchObject({ awakeCount: 1, awakeMin: 4 });
  });

  it("only uses the night ending on the date (18:00 the evening before to 18:00)", () => {
    const samples = parseSleepSamples(
      [
        line("2026-11-18T23:00:00+05:30", "2026-11-19T06:00:00+05:30", "Core"), // the night before
        line(t(19, "17:00"), t(19, "19:00"), "Core"), // only 18:00–19:00 is in this night
        line(t(19, "23:00"), t(20, "05:00"), "Core"),
      ].join("\n"),
    );
    expect(summariseNight(samples, "2026-11-20")).toMatchObject({ totalSleepMin: 60 + 360, bedtime: "18:00", wakeTime: "05:00" });
  });

  it("returns null when there's no sleep for the night", () => {
    expect(summariseNight([], "2026-11-20")).toBeNull();
    expect(summariseNight(parseSleepSamples(line(t(19, "22:00"), t(20, "07:00"), "In Bed")), "2026-11-20")).toBeNull();
  });
});

describe("durationLine (50)", () => {
  const points = (minutes: number) => durationLine(minutes).points;

  it("gives full points for 7–9 h", () => {
    expect(points(420)).toBe(50);
    expect(points(480)).toBe(50);
    expect(points(540)).toBe(50);
  });

  it("scales down to 0 at 4 h", () => {
    expect(points(330)).toBe(25); // 5.5 h
    expect(points(240)).toBe(0);
    expect(points(120)).toBe(0);
  });

  it("takes a little off above 9 h, to 40 at 11 h", () => {
    expect(points(600)).toBe(45);
    expect(points(660)).toBe(40);
    expect(points(720)).toBe(40);
  });

  it("explains the points", () => {
    expect(durationLine(452).reason).toBe("7 h 32 min — in the 7–9 h range ✓");
    expect(durationLine(330).reason).toBe("5 h 30 min — under 7 h");
  });
});

describe("consistencyLine (30)", () => {
  const usual = ["23:30", "23:45", "00:15"]; // averages to 23:50 across midnight

  it("gives full points while building a baseline (fewer than 3 nights)", () => {
    expect(consistencyLine("03:00", ["23:00", "23:10"])).toMatchObject({ points: 30, reason: "Building your baseline" });
  });

  it("gives full points within 30 minutes of the usual bedtime, even across midnight", () => {
    expect(consistencyLine("00:10", usual)).toMatchObject({ points: 30 });
    expect(consistencyLine("23:25", usual)).toMatchObject({ points: 30 });
  });

  it("scales down to 0 at 2 h", () => {
    expect(consistencyLine("01:20", usual).points).toBe(10); // 90 min off
    expect(consistencyLine("01:50", usual).points).toBe(0); // 120 min off
    expect(consistencyLine("21:00", usual).points).toBe(0);
  });

  it("explains the points", () => {
    expect(consistencyLine("01:20", usual).reason).toBe("Asleep at 01:20, 1 h 30 min from your usual 23:50");
  });
});

describe("clock times around midnight", () => {
  it("averages on a 24-hour circle", () => {
    expect(averageClockTime(["23:30", "00:30"])).toBe("00:00");
    expect(averageClockTime(["22:00", "23:00", "00:00"])).toBe("23:00");
    expect(averageClockTime(["01:00", "02:00"])).toBe("01:30");
  });

  it("measures the short way round midnight", () => {
    expect(clockDifference("23:50", "00:20")).toBe(30);
    expect(clockDifference("01:00", "23:00")).toBe(120);
    expect(clockDifference("12:00", "12:00")).toBe(0);
  });
});

describe("interruptionsLine (20)", () => {
  const points = (count: number, minutes: number) => interruptionsLine(count, minutes).points;

  it("gives full points for one short wake-up", () => {
    expect(points(0, 0)).toBe(20);
    expect(points(1, 10)).toBe(20);
    expect(points(1, 14)).toBe(20);
  });

  it("takes 4 per extra wake-up and 1 per 5 awake minutes beyond 10", () => {
    expect(points(3, 10)).toBe(12);
    expect(points(1, 25)).toBe(17);
    expect(points(2, 16)).toBe(15);
  });

  it("never goes below 0", () => {
    expect(points(10, 60)).toBe(0);
  });
});

describe("sleepScore", () => {
  it("adds duration, consistency and interruptions", () => {
    const result = sleepScore(EXPECTED_NIGHT, []);
    expect(result.score).toBe(50 + 30 + 15);
    expect(result.breakdown.map((l) => [l.label, l.points, l.max])).toEqual([
      ["Duration", 50, 50],
      ["Bedtime consistency", 30, 30],
      ["Interruptions", 15, 20],
    ]);
  });

  it("uses previous bedtimes for consistency", () => {
    // Usual bedtime 00:30, this night 23:00: 90 minutes earlier
    expect(sleepScore(EXPECTED_NIGHT, ["00:20", "00:30", "00:40"]).score).toBe(50 + 10 + 15);
  });
});

describe("helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(480)).toBe("8 h");
    expect(formatDuration(452)).toBe("7 h 32 min");
  });

  it("turns minutes into sleepHours", () => {
    expect(sleepHoursFrom(434)).toBe(7.23);
    expect(sleepHoursFrom(450)).toBe(7.5);
  });
});

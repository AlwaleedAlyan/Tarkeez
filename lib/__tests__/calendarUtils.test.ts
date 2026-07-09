import {
  formatDurationAverage,
  getHeatColor,
  getHeatColorForRatio,
  getMonthMaxMinutes,
} from "@/lib/calendarUtils";

describe("formatDurationAverage", () => {
  it("returns 0m for zero", () => {
    expect(formatDurationAverage(0)).toBe("0m");
  });

  it("rounds sub-hour values to the nearest minute", () => {
    expect(formatDurationAverage(45)).toBe("45m");
    expect(formatDurationAverage(59)).toBe("59m");
    expect(formatDurationAverage(1.4)).toBe("1m");
    expect(formatDurationAverage(1.6)).toBe("2m");
  });

  it("rounds hour values to one decimal place", () => {
    expect(formatDurationAverage(90)).toBe("1h 30m");
    expect(formatDurationAverage(72.3333)).toBe("1h 12m");
    expect(formatDurationAverage(150.5)).toBe("2h 30m");
  });

  it("drops minutes when the rounded average is an exact hour", () => {
    expect(formatDurationAverage(180)).toBe("3h");
    expect(formatDurationAverage(181)).toBe("3h");
    expect(formatDurationAverage(179)).toBe("3h");
  });
});

describe("getMonthMaxMinutes", () => {
  it("returns 0 for an empty month", () => {
    expect(getMonthMaxMinutes({}, 2026, 6)).toBe(0);
  });

  it("returns the highest daily total for the requested month", () => {
    const data = {
      "2026-07-01": 30,
      "2026-07-15": 120,
      "2026-07-31": 90,
      "2026-08-05": 999, // different month, should be ignored
    };
    expect(getMonthMaxMinutes(data, 2026, 6)).toBe(120);
  });

  it("ignores days outside the requested month", () => {
    const data = {
      "2026-06-30": 240,
      "2026-07-01": 60,
      "2026-07-31": 90,
      "2026-08-01": 300,
    };
    expect(getMonthMaxMinutes(data, 2026, 6)).toBe(90);
  });
});

describe("getHeatColorForRatio", () => {
  it("returns the base color at ratio 0", () => {
    expect(getHeatColorForRatio(0)).toBe("#1e241e");
  });

  it("returns the bright color at ratio 1", () => {
    expect(getHeatColorForRatio(1)).toBe("#699b69");
  });

  it("interpolates between base and bright for mid-range ratios", () => {
    const mid = getHeatColorForRatio(0.5);
    expect(mid).not.toBe("#1e241e");
    expect(mid).not.toBe("#699b69");
    expect(mid).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("clamps ratios outside [0, 1]", () => {
    expect(getHeatColorForRatio(-0.5)).toBe("#1e241e");
    expect(getHeatColorForRatio(1.5)).toBe("#699b69");
  });
});

describe("getHeatColor", () => {
  it("returns base color and light text when there is no activity", () => {
    expect(getHeatColor(0, 120)).toEqual({
      bg: "#1e241e",
      text: "#ffffff",
    });
  });

  it("returns base color and light text when max is zero", () => {
    expect(getHeatColor(60, 0)).toEqual({
      bg: "#1e241e",
      text: "#ffffff",
    });
  });

  it("returns dark text for the brightest cells", () => {
    expect(getHeatColor(120, 120).text).toBe("#111611");
    expect(getHeatColor(110, 120).text).toBe("#111611");
  });

  it("returns light text for dimmer cells", () => {
    expect(getHeatColor(60, 120).text).toBe("#ffffff");
    expect(getHeatColor(0, 120).text).toBe("#ffffff");
  });

  it("interpolates the background based on the ratio to max", () => {
    const half = getHeatColor(60, 120);
    expect(half.bg).toBe(getHeatColorForRatio(0.5));
  });
});

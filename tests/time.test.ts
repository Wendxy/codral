import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { getRunWindowStart, isSydneyMidnight } from "../src/utils/time.js";

describe("isSydneyMidnight", () => {
  it("returns true at Sydney midnight in AEDT", () => {
    const utc = DateTime.fromISO("2026-01-14T13:00:00Z");
    expect(isSydneyMidnight(utc)).toBe(true);
  });

  it("returns true at Sydney midnight in AEST", () => {
    const utc = DateTime.fromISO("2026-06-14T14:00:00Z");
    expect(isSydneyMidnight(utc)).toBe(true);
  });

  it("returns false outside midnight", () => {
    const utc = DateTime.fromISO("2026-06-14T15:00:00Z");
    expect(isSydneyMidnight(utc)).toBe(false);
  });
});

describe("getRunWindowStart", () => {
  it("uses checkpoint when available", () => {
    const now = DateTime.fromISO("2026-03-01T00:00:00Z");
    expect(getRunWindowStart("2026-02-28T00:00:00.000Z", now)).toBe("2026-02-28T00:00:00.000Z");
  });

  it("defaults to previous 24 hours", () => {
    const now = DateTime.fromISO("2026-03-01T00:00:00Z");
    expect(getRunWindowStart(null, now)).toBe("2026-02-28T00:00:00.000Z");
  });
});

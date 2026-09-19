import { describe, expect, it } from "vitest";
import { formatOffset, formatTimestamp, parseTimestamp } from "./time";

describe("parseTimestamp", () => {
  it("parses raw seconds", () => {
    expect(parseTimestamp("83")).toBe(83);
    expect(parseTimestamp("12.5")).toBe(12.5);
  });

  it("parses mm:ss and h:mm:ss", () => {
    expect(parseTimestamp("1:23")).toBe(83);
    expect(parseTimestamp("1:23:45")).toBe(5025);
    expect(parseTimestamp("01:02:03.5")).toBe(3723.5);
  });

  it("rejects empty or invalid values", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("1:60")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("formats minutes and hours", () => {
    expect(formatTimestamp(83)).toBe("1:23");
    expect(formatTimestamp(5025)).toBe("1:23:45");
  });

  it("formats signed offsets", () => {
    expect(formatOffset(12.4)).toBe("+0:12.4");
    expect(formatOffset(83.4)).toBe("+1:23.4");
    expect(formatOffset(-2)).toBe("−0:02.0");
  });
});

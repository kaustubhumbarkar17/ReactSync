import { describe, expect, it } from "vitest";
import { lockSync, nudgeLock, showTimeFor } from "./sync";

describe("sync lock", () => {
  it("maps reaction time onto the typed overlay time", () => {
    const lock = lockSync(40, 130);
    expect(lock.offsetSeconds).toBe(90);
    expect(showTimeFor(40, lock)).toBe(130);
    expect(showTimeFor(55, lock)).toBe(145);
  });

  it("does not seek the show before zero", () => {
    const lock = lockSync(90, 10);
    expect(showTimeFor(0, lock)).toBe(0);
  });

  it("nudges the stored offset", () => {
    const lock = nudgeLock(lockSync(10, 20), -0.1);
    expect(lock.offsetSeconds).toBeCloseTo(9.9);
    expect(showTimeFor(10, lock)).toBeCloseTo(19.9);
  });
});

import { describe, expect, it } from "vitest";
import { uuidv7 } from "./id";

describe("uuidv7", () => {
  it("has the canonical v7 format", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("encodes the timestamp in the first 48 bits", () => {
    const ms = 2_500_000_000_123; // in the future, so the monotonic guard does not kick in
    const id = uuidv7(ms);
    expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(ms);
  });

  it("is strictly increasing within one millisecond", () => {
    const ms = 2_600_000_000_000;
    const ids = Array.from({ length: 50 }, () => uuidv7(ms));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

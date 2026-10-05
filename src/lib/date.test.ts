import { describe, expect, it } from "vitest";
import { addDays, addMonths, isValidISODate, monthGrid, todayISO } from "./date";

describe("date helpers", () => {
  it("formats today in local time", () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("validates ISO dates", () => {
    expect(isValidISODate("2024-02-29")).toBe(true);
    expect(isValidISODate("2023-02-29")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-1-01")).toBe(false);
    expect(isValidISODate("today")).toBe(false);
  });

  it("adds days across months, years and DST", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // EU DST switch
  });

  it("adds months", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("builds Monday-first month grids", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const oct = monthGrid("2026-10");
    expect(oct[0]).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(oct.at(-1)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(oct).toHaveLength(5);
    // June 2026 starts on a Monday: no leading days from May.
    expect(monthGrid("2026-06")[0]![0]).toBe("2026-06-01");
    // February 2021 fits exactly in 4 weeks.
    expect(monthGrid("2021-02")).toHaveLength(4);
  });
});

import { shiftHour } from "./time";

describe("shiftHour", () => {
  it("shifts by whole hours and keeps minutes", () => {
    expect(shiftHour("22:00", 1)).toBe("23:00");
    expect(shiftHour("07:30", -2)).toBe("05:30");
  });

  it("wraps around midnight in both directions", () => {
    expect(shiftHour("23:00", 1)).toBe("00:00");
    expect(shiftHour("00:15", -1)).toBe("23:15");
    expect(shiftHour("01:00", -25)).toBe("00:00");
  });

  it("rejects anything that is not HH:MM", () => {
    expect(() => shiftHour("7:00", 1)).toThrow("Not an HH:MM time");
  });
});

import { describe, expect, it } from "vitest";
import { localDateKey, localNoon, offsetTimeZone } from "../../src/features/weather/dateKey.js";

/**
 * The solar calculations want the middle of a LOCAL day. They were handed
 * `T12:00:00Z`, i.e. noon in UTC: for anywhere east of UTC+12 that instant has
 * already rolled into the previous local evening, so Auckland's and Apia's
 * sunrise, sunset, golden hour and blue hour all described the wrong day. The
 * half-hour zones were wrong by their own offset too.
 */
describe("localNoon", () => {
  it("returns the local noon instant for a negative offset zone", () => {
    // Victoria, PDT.
    expect(localNoon("2026-09-30", "-07:00").toISOString()).toBe("2026-09-30T19:00:00.000Z");
  });

  it("rolls back a day for a zone east of UTC+12", () => {
    // Auckland, NZDT. 12:00 local on the 30th is 23:00Z on the 29th — the
    // exact case the old T12:00:00Z anchor got wrong.
    expect(localNoon("2026-09-30", "+13:00").toISOString()).toBe("2026-09-29T23:00:00.000Z");
  });

  it("keeps the same local calendar day it was asked for", () => {
    for (const zone of ["+13:00", "+12:00", "+05:30", "+05:45", "+00:00", "-03:30", "-07:00", "-11:00"]) {
      const date = "2026-09-30";
      expect(localDateKey(localNoon(date, zone), zone)).toBe(date);
    }
  });

  it("handles half-hour and three-quarter-hour offsets", () => {
    expect(localNoon("2026-09-30", "+05:30").toISOString()).toBe("2026-09-30T06:30:00.000Z");
    expect(localNoon("2026-09-30", "+05:45").toISOString()).toBe("2026-09-30T06:15:00.000Z");
    expect(localNoon("2026-09-30", "-03:30").toISOString()).toBe("2026-09-30T15:30:00.000Z");
  });

  it("is noon UTC for a zero offset", () => {
    expect(localNoon("2026-09-30", "+00:00").toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });

  it("falls back to UTC noon for an IANA name or a missing zone", () => {
    // Not a fixed offset, so the solar anchor stays at 12:00Z rather than
    // throwing — the honest degradation.
    expect(localNoon("2026-09-30", "Europe/Tirane").toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(localNoon("2026-09-30", undefined).toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(localNoon("2026-09-30", "not-a-zone").toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });
});

/**
 * A forecast day is a local calendar day. Deriving it with toISOString()
 * buckets by UTC, so the first forecast row carries yesterday's date for every
 * location whose local date has already rolled over — which then made the client
 * label the first row "Wed" while shading it as today, and take the hero's high
 * and low from the wrong day.
 */
describe("localDateKey", () => {
  // 2026-09-30T22:30Z. Tirana is UTC+2, so it is already 2026-10-01 locally.
  const LATE_UTC = Date.UTC(2026, 8, 30, 22, 30, 0);

  it("buckets by the local day for an IANA zone", () => {
    // Tokyo is UTC+9 year-round: 22:30Z is already the 31st there.
    expect(localDateKey(LATE_UTC, "Asia/Tokyo")).toBe("2026-10-01");
    // Tirana is UTC+2 in summer: also already the 31st.
    expect(localDateKey(LATE_UTC, "Europe/Tirane")).toBe("2026-10-01");
    // New York is UTC-4: still the 30th.
    expect(localDateKey(LATE_UTC, "America/New_York")).toBe("2026-09-30");
  });

  it("buckets by the local day for a fixed-offset zone", () => {
    expect(localDateKey(LATE_UTC, "+02:00")).toBe("2026-10-01");
    expect(localDateKey(LATE_UTC, "-04:00")).toBe("2026-09-30");
    expect(localDateKey(LATE_UTC, "+00:00")).toBe("2026-09-30");
  });

  it("never returns yesterday for a location already past local midnight", () => {
    // The exact failure the reviewer reproduced.
    const tiranaKey = localDateKey(LATE_UTC, "Europe/Tirane");
    const utcKey = new Date(LATE_UTC).toISOString().slice(0, 10);
    expect(utcKey).toBe("2026-09-30");
    expect(tiranaKey).toBe("2026-10-01");
    expect(tiranaKey).not.toBe(utcKey);
  });

  it("falls back to the UTC day for a missing or unusable zone", () => {
    expect(localDateKey(LATE_UTC, undefined)).toBe("2026-09-30");
    expect(localDateKey(LATE_UTC, null)).toBe("2026-09-30");
    expect(localDateKey(LATE_UTC, "Not/AZone")).toBe("2026-09-30");
  });

  it("accepts a Date as well as epoch milliseconds", () => {
    expect(localDateKey(new Date(LATE_UTC), "Europe/Tirane")).toBe("2026-10-01");
  });
});

describe("offsetTimeZone", () => {
  it("formats OpenWeatherMap's seconds as an Intl-acceptable offset", () => {
    expect(offsetTimeZone(7200)).toBe("+02:00");   // Tirana, summer
    expect(offsetTimeZone(-14400)).toBe("-04:00"); // New York, summer
    expect(offsetTimeZone(0)).toBe("+00:00");
    expect(offsetTimeZone(19800)).toBe("+05:30");  // Kolkata
    expect(offsetTimeZone(-12600)).toBe("-03:30");
  });

  it("falls back to UTC for a non-numeric offset", () => {
    expect(offsetTimeZone(undefined)).toBe("UTC");
    expect(offsetTimeZone(null)).toBe("UTC");
    expect(offsetTimeZone("7200")).toBe("UTC");
    expect(offsetTimeZone(NaN)).toBe("UTC");
  });

  it("produces a string Intl actually accepts, unlike 'UTC+2'", () => {
    const when = Date.UTC(2026, 8, 30, 4, 35);
    const fmt = (tz: string) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
      }).format(new Date(when));

    // "UTC+2" throws in V8; the offset form works and yields Tirana local time.
    expect(() => fmt("UTC+2")).toThrow();
    expect(fmt(offsetTimeZone(7200))).toBe("06:35");
  });
});

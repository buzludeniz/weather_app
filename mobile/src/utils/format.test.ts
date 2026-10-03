import { formatDay, formatSpeed, formatTemperature, formatTime } from "./format";

describe("format utilities", () => {
  it("formats metric temperatures", () => {
    expect(formatTemperature(21.4, "metric")).toBe("21 C");
  });

  it("formats imperial wind speed", () => {
    expect(formatSpeed(16, "imperial")).toBe("10 mph");
  });
});

/* `formatTime` and `formatDay` are the two functions this round changed, and
 * `zoneOption` is the one a device-timezone regression would hide in: revert
 * the `timeZone` option and every test below still passes on a machine whose own
 * zone happens to match, so the cases are written to fail on the DEVICE zone
 * rather than merely assert a string. */
describe("time rendering is the LOCATION's, not the device's", () => {
  // 2026-10-01T05:20:00Z is 07:20 in Longyearbyen (Europe/Oslo, UTC+2 in October).
  const LONGYEARBYEN_SUNRISE = "2026-10-01T05:20:00Z";

  it("renders the same instant differently for two different locations", () => {
    const inOslo = formatTime(LONGYEARBYEN_SUNRISE, "Europe/Oslo");
    const inKolkata = formatTime(LONGYEARBYEN_SUNRISE, "Asia/Kolkata");
    expect(inOslo).toBe("7:20 AM");
    expect(inKolkata).toBe("10:50 AM");
    // The defect this guards: both used to return the DEVICE's answer.
    expect(inOslo).not.toBe(inKolkata);
  });

  it("handles a fixed-offset zone string, not only an IANA name", () => {
    // Nepal is +05:45, so it proves the offset is honoured rather than rounded.
    expect(formatTime(LONGYEARBYEN_SUNRISE, "+05:45")).toBe("11:05 AM");
    expect(formatTime(LONGYEARBYEN_SUNRISE, "-03:00")).toBe("2:20 AM");
  });

  it("degrades rather than throwing on a zone the runtime rejects", () => {
    // An invalid zone throws a RangeError from Intl, which would blank the
    // screen rather than fall back. Each of these must return a string.
    for (const bad of ["Not/AZone", "", "   ", "Mars/Olympus", "Etc/GMT+30", "42"]) {
      expect(typeof formatTime(LONGYEARBYEN_SUNRISE, bad)).toBe("string");
    }
    expect(typeof formatTime(LONGYEARBYEN_SUNRISE, null)).toBe("string");
    expect(typeof formatTime(LONGYEARBYEN_SUNRISE, undefined)).toBe("string");
  });
});

describe("a bare date key is a calendar day, not an instant", () => {
  /* `new Date("2026-09-30")` is UTC midnight. Formatted in any zone west of UTC
   * that is the PREVIOUS day, which labelled every row of the daily list with
   * the day before for US, Canadian, Mexican and most South American readers.
   *
   * Two honest notes on what this can and cannot catch:
   *
   * 1. What this can and cannot catch, measured by a 2×2 mutation matrix
   *    (`timeZone` present/absent × the noon anchor present/absent) run against
   *    these three `it()` bodies in six device zones. The earlier version of this
   *    note had it BACKWARDS — it claimed deleting `timeZone: "UTC"` alone is
   *    caught west of UTC. It is caught EAST of UTC, and survives west, because
   *    the `T12:00:00Z` anchor absorbs a negative offset. The corrected reading:
   *
   *      device zone                drop timeZone | drop anchor | drop both
   *      America/Los_Angeles           survives   |  survives   |  caught
   *      America/New_York             survives   |  survives   |  caught
   *      Pacific/Kiritimati           CAUGHT     |  survives   |  survives
   *      Pacific/Auckland             CAUGHT     |  survives   |  survives
   *      UTC, Asia/Kolkata            survives   |  survives   |  survives
   *
   *    So on a device in India, Japan, Australia or NZ — the majority of the
   *    world's phones — removing `timeZone: "UTC"` ships a real one-day shift
   *    undetected. Nothing is caught at `TZ=UTC`. An earlier attempt to pin
   *    `process.env.TZ` from inside the test was a no-op — V8 resolves the zone
   *    at first use — so the limitation is recorded rather than papered over.
   *    The obvious remedy is a case whose key sits east of UTC; there is not one
   *    yet, and this note is the standing record of that gap.
   * 2. The `T12:00:00Z` anchor in `formatDay` is NOT independently load-bearing:
   *    with `timeZone: "UTC"` in place, UTC midnight formats as that same date
   *    whether or not the instant is anchored at noon. Removing the anchor alone
   *    is an equivalent mutation and no test can distinguish it, in any of the
   *    six zones. It is kept as
   *    defence in depth — it is what makes the function correct if someone later
   *    drops the `timeZone`. */
  const inUtc = (key: string) =>
    new Intl.DateTimeFormat(undefined, {
      weekday: "short", month: "short", day: "numeric", timeZone: "UTC"
    }).format(new Date(`${key}T12:00:00Z`));

  it("gives the same weekday for a key from Kiritimati to Los Angeles", () => {
    for (const key of ["2026-09-30", "2026-01-01", "2026-03-29", "2026-12-31"]) {
      const weekdays = new Set([
        formatDay(key, "Pacific/Kiritimati"),
        formatDay(key, "America/Los_Angeles"),
        formatDay(key, "Asia/Kolkata"),
        formatDay(key),
        formatDay(key, "Not/AZone")
      ]);
      expect(weekdays.size).toBe(1);
    }
  });

  it("ignores the device zone and matches a UTC reading of the same key", () => {
    for (const key of ["2026-09-30", "2026-01-01", "2026-03-29", "2026-12-31"]) {
      expect(formatDay(key)).toBe(inUtc(key));
    }
  });

  it("names the day the key actually says", () => {
    expect(formatDay("2026-09-30")).toBe("Wed, Sep 30");
    expect(formatDay("2026-01-01")).toBe("Thu, Jan 1");
  });
});

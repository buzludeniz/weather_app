import { describe, expect, it } from "vitest";
import {
  dateFromJulianDay,
  julianDay,
  lightWindows,
  lunarPosition,
  moonInfo,
  moonTimes,
  sunTimes
} from "./astronomy.js";

/** Tirana — the app's own default city. */
const TIRANA = { lat: 41.3275, lon: 19.8189 };
/** London. */
const LONDON = { lat: 51.5074, lon: -0.1276 };
/** Tromsø, inside the arctic circle. */
const TROMSO = { lat: 69.6492, lon: 18.9553 };
/** Svalbard, deep enough inside the arctic circle for true polar night. */
const SVALBARD = { lat: 78.2232, lon: 15.6469 };

/** Hours between two dates, or null if either is missing. */
function hoursBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

describe("julian day conversions", () => {
  it("round-trips a known instant", () => {
    // 2000-01-01 12:00:00 UTC is JD 2451545.0 by definition.
    const epoch = new Date("2000-01-01T12:00:00.000Z");
    expect(julianDay(epoch)).toBeCloseTo(2_451_545.0, 6);
    expect(dateFromJulianDay(julianDay(epoch)).getTime()).toBe(epoch.getTime());
  });

  it("round-trips arbitrary instants within a millisecond", () => {
    for (const iso of ["2024-06-21T09:30:00Z", "2025-01-01T00:00:00Z", "2026-12-31T23:59:59Z"]) {
      const date = new Date(iso);
      expect(Math.abs(dateFromJulianDay(julianDay(date)).getTime() - date.getTime())).toBeLessThan(1);
    }
  });
});

describe("sunTimes", () => {
  it("matches published sunrise and sunset for London on the June solstice", () => {
    // 2024-06-21, London: sunrise 04:43 BST (03:43 UTC), sunset 21:21 BST (20:21 UTC).
    // Allow two minutes: this is a low-precision algorithm, not an ephemeris.
    const times = sunTimes(new Date("2024-06-21T12:00:00Z"), LONDON.lat, LONDON.lon);
    const minutes = (date: Date | null, iso: string) =>
      Math.abs(date!.getTime() - new Date(iso).getTime()) / 60_000;
    expect(times.polarDay).toBe(false);
    expect(times.polarNight).toBe(false);
    expect(minutes(times.sunrise, "2024-06-21T03:43:00Z")).toBeLessThan(2);
    expect(minutes(times.sunset, "2024-06-21T20:21:00Z")).toBeLessThan(2);
  });

  it("gives a short winter day and a long summer day at mid latitudes", () => {
    const summer = sunTimes(new Date("2024-06-21T12:00:00Z"), LONDON.lat, LONDON.lon);
    const winter = sunTimes(new Date("2024-12-21T12:00:00Z"), LONDON.lat, LONDON.lon);
    const summerHours = hoursBetween(summer.sunrise, summer.sunset)!;
    const winterHours = hoursBetween(winter.sunrise, winter.sunset)!;
    // London: ~16h43m in June, ~7h50m in December.
    expect(summerHours).toBeGreaterThan(16);
    expect(summerHours).toBeLessThan(17);
    expect(winterHours).toBeGreaterThan(7);
    expect(winterHours).toBeLessThan(8.5);
  });

  it("puts sunrise before sunset in the eastern hemisphere local day", () => {
    const times = sunTimes(new Date("2024-03-20T12:00:00Z"), TIRANA.lat, TIRANA.lon);
    expect(times.sunrise!.getTime()).toBeLessThan(times.sunset!.getTime());
    // Tirana is UTC+1 in March, so sunrise lands before 06:00 UTC.
    expect(times.sunrise!.getUTCHours()).toBeLessThan(6);
  });

  it("reports midnight sun at the arctic circle in June", () => {
    const times = sunTimes(new Date("2024-06-21T12:00:00Z"), TROMSO.lat, TROMSO.lon);
    expect(times.polarDay).toBe(true);
    expect(times.polarNight).toBe(false);
    expect(times.sunrise).toBeNull();
    expect(times.sunset).toBeNull();
    expect(times.dayLengthMs).toBeNull();
    // Solar noon still resolves, so the daylight arc can be centred.
    expect(Number.isNaN(times.solarNoon.getTime())).toBe(false);
  });

  it("reports polar night at the arctic circle in December", () => {
    const times = sunTimes(new Date("2024-12-21T12:00:00Z"), TROMSO.lat, TROMSO.lon);
    expect(times.polarNight).toBe(true);
    expect(times.polarDay).toBe(false);
    expect(times.sunrise).toBeNull();
    expect(times.sunset).toBeNull();
  });

  it("reports a day length matching the published Tirana value", () => {
    // Tirana on 15 Sep: sunrise ~05:36 UTC, sunset ~18:09 UTC → ~12.55h.
    // Asserting against real values rather than against its own sunrise/sunset
    // pair, which would pass for any self-consistent but wrong solar position.
    const times = sunTimes(new Date("2024-09-15T12:00:00Z"), TIRANA.lat, TIRANA.lon);
    const hours = hoursBetween(times.sunrise, times.sunset)!;
    expect(hours).toBeGreaterThan(12.3);
    expect(hours).toBeLessThan(12.8);
  });

  it("handles the leap day without drifting", () => {
    const times = sunTimes(new Date("2024-02-29T12:00:00Z"), LONDON.lat, LONDON.lon);
    expect(times.sunrise).not.toBeNull();
    expect(times.sunset).not.toBeNull();
    // London on 29 Feb: sunrise ~06:45 UTC, sunset ~17:35 UTC.
    expect(times.sunrise!.getUTCHours()).toBe(6);
    expect(times.sunset!.getUTCHours()).toBe(17);
  });

  it("works on the equator, where day length barely changes", () => {
    const equator = { lat: 0, lon: 0 };
    const march = sunTimes(new Date("2024-03-20T12:00:00Z"), equator.lat, equator.lon);
    const september = sunTimes(new Date("2024-09-22T12:00:00Z"), equator.lat, equator.lon);
    const marchHours = hoursBetween(march.sunrise, march.sunset)!;
    const septemberHours = hoursBetween(september.sunrise, september.sunset)!;
    expect(Math.abs(marchHours - 12)).toBeLessThan(0.5);
    expect(Math.abs(septemberHours - 12)).toBeLessThan(0.5);
  });

  it("crosses the date line without producing a negative day", () => {
    // Auckland is UTC+12; its local day starts on the previous UTC day.
    const auckland = { lat: -36.8485, lon: 174.7633 };
    const times = sunTimes(new Date("2024-06-21T12:00:00Z"), auckland.lat, auckland.lon);
    const hours = hoursBetween(times.sunrise, times.sunset)!;
    expect(hours).toBeGreaterThan(9);
    expect(hours).toBeLessThan(11);
  });
});

describe("lightWindows", () => {
  it("orders the golden and blue hour bands around sunrise", () => {
    const windows = lightWindows(new Date("2024-06-21T12:00:00Z"), TIRANA.lat, TIRANA.lon);
    const { blueHourMorning, goldenHourMorning, goldenHourEvening, blueHourEvening } = windows;

    // Blue runs first, then golden, then golden again, then blue.
    expect(blueHourMorning.start!.getTime()).toBeLessThan(goldenHourMorning.start!.getTime());
    expect(goldenHourMorning.start!.getTime()).toBeLessThan(goldenHourEvening.start!.getTime());
    expect(goldenHourEvening.start!.getTime()).toBeLessThan(blueHourEvening.start!.getTime());

    // Each window ends after it starts.
    for (const w of [blueHourMorning, goldenHourMorning, goldenHourEvening, blueHourEvening]) {
      expect(w.end!.getTime()).toBeGreaterThan(w.start!.getTime());
    }
  });

  it("brackets actual sunrise with the golden hour", () => {
    const times = sunTimes(new Date("2024-06-21T12:00:00Z"), TIRANA.lat, TIRANA.lon);
    const windows = lightWindows(new Date("2024-06-21T12:00:00Z"), TIRANA.lat, TIRANA.lon);
    // Golden hour straddles sunrise: it starts before and ends after.
    expect(windows.goldenHourMorning.start!.getTime()).toBeLessThan(times.sunrise!.getTime());
    expect(windows.goldenHourMorning.end!.getTime()).toBeGreaterThan(times.sunrise!.getTime());
  });

  it("returns no windows during polar night", () => {
    // Svalbard, not Tromso: at the December solstice the sun at Tromso still
    // climbs to -3.1 deg, which is inside the golden hour band, so it does get
    // one. Svalbard peaks at -11.7 deg and never enters any of the bands.
    const windows = lightWindows(new Date("2024-12-21T12:00:00Z"), SVALBARD.lat, SVALBARD.lon);
    expect(windows.goldenHourMorning.start).toBeNull();
    expect(windows.blueHourEvening.start).toBeNull();
  });

  it("places the evening windows after sunset, not at the next morning", () => {
    // The crossing scan deliberately runs a few hours past local midnight, so
    // its final entries belong to the following morning. Taking the last entry
    // as the evening once produced a "golden hour" of 03:49 -> 02:47, which is
    // tomorrow's sunrise wearing tonight's label.
    const date = new Date("2024-06-21T12:00:00Z");
    const sun = sunTimes(date, TIRANA.lat, TIRANA.lon);
    const windows = lightWindows(date, TIRANA.lat, TIRANA.lon);

    expect(windows.goldenHourEvening.start!.getTime()).toBeLessThan(sun.sunset!.getTime());
    expect(windows.goldenHourEvening.end!.getTime()).toBeGreaterThan(sun.sunset!.getTime());
    expect(windows.blueHourEvening.start!.getTime()).toBeGreaterThan(sun.sunset!.getTime());
    expect(windows.blueHourEvening.end!.getTime()).toBeGreaterThan(
      windows.blueHourEvening.start!.getTime()
    );
  });
});

describe("lunarPosition", () => {
  it("returns finite values for every field", () => {
    // A NaN in any single field silently propagates: NaN fails every rise/set
    // comparison, so moonrise and moonset come back null everywhere. This
    // guards the asin arguments, which are analytically bounded by 1 but can
    // exceed it through floating-point error.
    for (const iso of ["2024-01-11T11:57:00Z", "2024-06-21T12:00:00Z", "2026-12-31T23:59:59Z"]) {
      const jd = julianDay(new Date(iso));
      const position = lunarPosition(jd);
      expect(Number.isFinite(position.longitude)).toBe(true);
      expect(Number.isFinite(position.latitude)).toBe(true);
      expect(Number.isFinite(position.distanceKm)).toBe(true);
      expect(Number.isFinite(position.declination)).toBe(true);
      expect(Number.isFinite(position.rightAscension)).toBe(true);
      expect(position.declination).toBeGreaterThanOrEqual(-29);
      expect(position.declination).toBeLessThanOrEqual(29);
    }
  });
});

describe("moonInfo", () => {
  it("reports a new moon at a known new moon instant", () => {
    // 2024-01-11 11:57 UTC was a new moon.
    const info = moonInfo(new Date("2024-01-11T11:57:00Z"));
    expect(info.phase).toBe("new");
    expect(info.illumination).toBeLessThan(0.05);
    expect(info.ageDays).toBeCloseTo(0, 0);
  });

  it("reports a full moon at a known full moon instant", () => {
    // 2024-01-25 17:54 UTC was a full moon.
    const info = moonInfo(new Date("2024-01-25T17:54:00Z"));
    expect(info.phase).toBe("full");
    expect(info.illumination).toBeGreaterThan(0.95);
    // Half a synodic month, give or take a few hours.
    expect(info.ageDays).toBeGreaterThan(14);
    expect(info.ageDays).toBeLessThan(15.5);
  });

  it("keeps age within one synodic month for any instant", () => {
    for (const iso of ["2024-01-01T00:00:00Z", "2024-07-04T13:00:00Z", "2025-03-20T06:00:00Z"]) {
      const { ageDays } = moonInfo(new Date(iso));
      expect(ageDays).toBeGreaterThanOrEqual(0);
      expect(ageDays).toBeLessThan(29.531);
    }
  });

  it("gives higher illumination at full moon than at new moon", () => {
    const newMoon = moonInfo(new Date("2024-01-11T11:57:00Z"));
    const fullMoon = moonInfo(new Date("2024-01-25T17:54:00Z"));
    expect(fullMoon.illumination).toBeGreaterThan(newMoon.illumination);
  });

  it("walks through all eight phases over one synodic month", () => {
    const seen = new Set<string>();
    for (let hour = 0; hour < 24 * 30; hour += 6) {
      seen.add(moonInfo(new Date(Date.UTC(2024, 0, 11, hour))).phase);
    }
    expect(seen.size).toBe(8);
  });
});

describe("moonTimes (re-exported from lunar.ts)", () => {
  it("returns times that differ from sunrise and sunset", () => {
    const date = new Date("2024-06-21T12:00:00Z");
    const sun = sunTimes(date, TIRANA.lat, TIRANA.lon);
    const moon = moonTimes(date, TIRANA.lat, TIRANA.lon);
    // This is the regression that motivated the module: the live provider used
    // to copy sunrise/sunset into the moon fields.
    expect(moon.moonrise!.getTime()).not.toBe(sun.sunrise!.getTime());
    expect(moon.moonset!.getTime()).not.toBe(sun.sunset!.getTime());
  });

  it("finds both rise and set at mid latitudes on an ordinary day", () => {
    // The original version of the test above only compared two values that were
    // both null, so it passed while moonrise was broken everywhere. At
    // mid latitudes on an ordinary day the moon always rises and sets.
    const { moonrise, moonset } = moonTimes(new Date("2024-06-21T12:00:00Z"), TIRANA.lat, TIRANA.lon);
    expect(moonrise).not.toBeNull();
    expect(moonset).not.toBeNull();
  });

  it("puts a waxing gibbous moonrise after sunset", () => {
    // 2024-06-21 is the day before the June full moon, so the moon rises after
    // sunset and sets after sunrise. Getting this backwards means the ephemeris
    // has the sign of the declination or the hour angle inverted.
    const date = new Date("2024-06-21T12:00:00Z");
    const sun = sunTimes(date, TIRANA.lat, TIRANA.lon);
    const moon = moonTimes(date, TIRANA.lat, TIRANA.lon);
    expect(moon.moonrise!.getTime()).toBeGreaterThan(sun.sunset!.getTime());
    expect(moon.moonset!.getTime()).toBeGreaterThan(sun.sunrise!.getTime());
  });
});

/* The day counter used to snap the UTC date rather than the local one. Once the
 * offset exceeds +/-12 in the relevant direction those are different days, so
 * the whole calculation was anchored to the previous day: for Auckland the
 * sunrise came back two days early and the sunset on a *different* day from the
 * sunrise, which is a 12-hour "day". Tonga (+13) and Kiritimati (+14) are the
 * other real-world exposures; Samoa is +13 and affected for half the year. */
describe("solar times for offsets beyond UTC+12", () => {
  const AUCKLAND = { lat: -36.8485, lon: 174.7633 };

  /** Local calendar date (YYYY-MM-DD) of an instant, at a fixed offset. */
  function localDate(iso: string, offsetHours: number): string {
    const shifted = new Date(new Date(iso).getTime() + offsetHours * 3_600_000);
    return shifted.toISOString().slice(0, 10);
  }

  for (const offset of [12, 12.5, 13, 13.5, 14, -11, -12]) {
    it(`keeps sunrise and sunset on the same local day at UTC+${offset}`, () => {
      // Local solar noon on 2026-10-01 at this offset.
      const noonUtc = new Date(Date.UTC(2026, 9, 1, 12, 0) - offset * 3_600_000);
      const sun = sunTimes(noonUtc, AUCKLAND.lat, AUCKLAND.lon);

      const want = "2026-10-01";
      expect(localDate(sun.sunrise!.toISOString(), offset)).toBe(want);
      expect(localDate(sun.sunset!.toISOString(), offset)).toBe(want);
      // Sunset must follow sunrise, and the day must be a real length.
      expect(sun.sunset!.getTime()).toBeGreaterThan(sun.sunrise!.getTime());
      expect(sun.dayLengthMs! / 3_600_000).toBeGreaterThan(10);
      expect(sun.dayLengthMs! / 3_600_000).toBeLessThan(14);
    });
  }

  it("does not regress a mid-range offset", () => {
    const noonUtc = new Date(Date.UTC(2026, 9, 1, 12, 0) - 5 * 3_600_000); // UTC-5
    const sun = sunTimes(noonUtc, 19.4, -99.1); // Mexico City
    expect(localDate(sun.sunrise!.toISOString(), -5)).toBe("2026-10-01");
    expect(localDate(sun.sunset!.toISOString(), -5)).toBe("2026-10-01");
  });

  it("puts moonrise and moonset in the same local day window as the sun", () => {
    const noonUtc = new Date(Date.UTC(2026, 9, 1, 12, 0) - 13 * 3_600_000);
    const moon = moonTimes(noonUtc, AUCKLAND.lat, AUCKLAND.lon);
    // At least one lunar event must fall on the requested local day; before the
    // fix both were computed against the previous day.
    const events = [moon.moonrise, moon.moonset].filter(Boolean) as Date[];
    expect(events.length).toBeGreaterThan(0);
    const onDay = events.filter((e) => localDate(e.toISOString(), 13) === "2026-10-01");
    expect(onDay.length).toBeGreaterThan(0);
  });
});

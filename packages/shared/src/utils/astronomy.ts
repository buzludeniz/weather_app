/**
 * Local solar and lunar position math.
 *
 * Sunrise, sunset, twilight windows, and moon phase are pure geometry from a
 * date and a pair of coordinates, so there is no reason to pay an API call or
 * accept a provider's faked values for them. The algorithms here follow the
 * standard low-precision "sunrise equation" (Meeus, Astronomical Algorithms)
 * which is accurate to roughly a minute for sunrise/sunset at temperate
 * latitudes, and is well within tolerance for a weather dashboard.
 *
 * Everything is UTC-based internally. A "day" means the local calendar day at
 * the requested longitude, not the UTC day.
 */

import type { MoonPhase } from "../contracts/weather.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Solar altitude at which sunrise/sunset are declared (refraction + limb). */
const SUNRISE_ZENITH = 90.833;
/** One synodic month, in days. */
const SYNODIC_MONTH = 29.530588853;
/** A known new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON_EPOCH_JD = 2_451_550.2597;
const OBLIQUITY_SIN = Math.sin(23.4397 * DEG);

/** Julian date for a JS `Date`. */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Inverse of {@link julianDay}. */
export function dateFromJulianDay(jd: number): Date {
  return new Date((jd - 2_440_587.5) * 86_400_000);
}

/**
 * The Julian day number of 00:00 UTC **on the local calendar day** that `date`
 * falls on at `lon` (east positive).
 *
 * Longitude-aware because the local day and the UTC day are not the same day
 * once the offset exceeds ±12 in the relevant direction. Snapping the UTC date
 * meant that for Auckland (+13), Tonga (+13) and Kiritimati (+14) the whole
 * calculation was anchored to the previous day: `sunTimes` returned a sunrise
 * two days early and a sunset on a *different* day from the sunrise, producing
 * a 12-hour "day". The `+ lon/360` term converts the instant to local time
 * before the snap, so the day counter follows the local calendar.
 *
 * The return value is still 00:00 UTC on that local date, not local midnight —
 * every caller downstream (the `jStar` longitude shift, and `crossings`'
 * `- lon/360` window) is already expressed in those terms and is unchanged.
 */
function startOfUtcDay(date: Date, lon: number): number {
  return Math.floor(julianDay(date) + lon / 360 - 0.5) + 0.5;
}

/**
 * Core solar terms for the local day containing `date` at `lon` (east positive).
 */
function solarTerms(date: Date, lon: number) {
  const jDate = startOfUtcDay(date, lon);
  // Approximate days since the 2000-01-01 12:00 epoch.
  const n = Math.ceil(jDate - 2_451_545.0 + 0.0008);
  // Shift by longitude: each degree is 4 minutes, and locations east of
  // Greenwich see the sun earlier, so their day starts sooner in UTC terms.
  const jStar = n - lon / 360;
  const meanAnomaly = (357.5291 + 0.98560028 * jStar) % 360;
  const center =
    1.9148 * Math.sin(meanAnomaly * DEG) +
    0.02 * Math.sin(2 * meanAnomaly * DEG) +
    0.0003 * Math.sin(3 * meanAnomaly * DEG);
  const eclipticLon = (meanAnomaly + center + 180 + 102.9372) % 360;
  const solarTransit =
    2_451_545.0 + jStar + 0.0053 * Math.sin(meanAnomaly * DEG) - 0.0069 * Math.sin(2 * eclipticLon * DEG);
  const declinationSin = Math.sin(eclipticLon * DEG) * OBLIQUITY_SIN;
  const declination = Math.asin(clampUnit(declinationSin));
  return { jDate, solarTransit, declination };
}

/**
 * Clamp a value into [-1, 1] before handing it to `Math.asin`.
 *
 * The sine of an altitude is bounded by 1 analytically, but floating-point
 * error can push it a hair past the limit, and `Math.asin(1.0000000000000002)`
 * is `NaN`. That NaN then propagates into rise/set detection and silently
 * turns every crossing into a non-crossing.
 */
export function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export type SunTimes = {
  /** Null during polar day or polar night. */
  sunrise: Date | null;
  /** Null during polar day or polar night. */
  sunset: Date | null;
  solarNoon: Date;
  /** Null during polar day or polar night. */
  dayLengthMs: number | null;
  /** The sun never sets on this day at this latitude. */
  polarDay: boolean;
  /** The sun never rises on this day at this latitude. */
  polarNight: boolean;
};

/**
 * Sunrise, sunset, solar noon and day length for the local day containing
 * `date` at the given coordinates.
 */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const { jDate, solarTransit, declination } = solarTerms(date, lon);
  const cosHourAngle =
    (Math.sin(-0.833 * DEG) - Math.sin(lat * DEG) * Math.sin(declination)) /
    (Math.cos(lat * DEG) * Math.cos(declination));

  const solarNoon = dateFromJulianDay(solarTransit);

  if (cosHourAngle < -1) {
    return { sunrise: null, sunset: null, solarNoon, dayLengthMs: null, polarDay: true, polarNight: false };
  }
  if (cosHourAngle > 1) {
    return { sunrise: null, sunset: null, solarNoon, dayLengthMs: null, polarDay: false, polarNight: true };
  }

  const hourAngle = Math.acos(cosHourAngle) * RAD;
  const sunriseJd = solarTransit - hourAngle / 360;
  const sunsetJd = solarTransit + hourAngle / 360;
  return {
    sunrise: dateFromJulianDay(sunriseJd),
    sunset: dateFromJulianDay(sunsetJd),
    solarNoon,
    dayLengthMs: (sunsetJd - sunriseJd) * 86_400_000,
    polarDay: false,
    polarNight: false,
  };
}

/** Solar altitude in degrees above the horizon, in UTC. */
export function solarAltitude(date: Date, lat: number, lon: number): number {
  const { solarTransit, declination } = solarTerms(date, lon);
  const hourAngle = (julianDay(date) - solarTransit) * 360;
  const sinAltitude =
    Math.sin(lat * DEG) * Math.sin(declination) +
    Math.cos(lat * DEG) * Math.cos(declination) * Math.cos(hourAngle * DEG);
  return Math.asin(clampUnit(sinAltitude)) * RAD;
}

/** A half-open window of daylight, e.g. golden hour. End may be null if it runs past midnight. */
export type LightWindow = {
  start: Date | null;
  end: Date | null;
};

function emptyWindow(): LightWindow {
  return { start: null, end: null };
}

/** Build a light window, tolerating a missing boundary during polar conditions. */
function band(start: Date | undefined, end: Date | undefined): LightWindow {
  if (!start) return emptyWindow();
  return { start, end: end ?? null };
}

/** A moment the sun crossed a target altitude, and which way it was going. */
type Crossing = {
  at: Date;
  /** True when the sun was climbing through the altitude (a morning crossing). */
  rising: boolean;
};

/**
 * Find the times at which the sun crosses `targetAltitude`, by scanning the
 * local day in coarse steps and bisecting each sign change.
 *
 * Each crossing records whether the sun was rising or setting. Callers must use
 * that rather than position in the list, because the scan window deliberately
 * runs past local midnight and therefore ends with the *next* morning's rising
 * crossings. Taking the last element would label tomorrow's sunrise as tonight's
 * sunset.
 */
function crossings(date: Date, lat: number, lon: number, targetAltitude: number): Crossing[] {
  const { jDate } = solarTerms(date, lon);
  // The local day runs from local midnight to local midnight, which in UTC is
  // offset by the longitude. Without this the scan reaches into the previous
  // evening and mislabels its sunset crossings as this morning's.
  //
  // The window runs a few hours past local midnight so a band that is still
  // open at midnight (a long high-latitude summer evening) is not truncated.
  // This adds no spurious crossings on an ordinary day, because the sun is far
  // below the target altitudes by local midnight.
  const dayOffset = lon / 360;
  const from = jDate - dayOffset;
  const to = from + 1 + 6 / 24;
  const stepMinutes = 5;
  const step = stepMinutes / 1440;

  const above = (jd: number) => solarAltitude(dateFromJulianDay(jd), lat, lon) - targetAltitude;

  const found: Crossing[] = [];
  let previousJd = from;
  let previousValue = above(previousJd);
  for (let jd = from + step; jd <= to + 1e-9; jd += step) {
    const value = above(jd);
    if (previousValue === 0) {
      found.push({ at: dateFromJulianDay(previousJd), rising: previousValue < 0 });
    } else if (previousValue > 0 !== value > 0) {
      // Bisect to the crossing to well under a second of precision.
      let low = previousJd;
      let high = jd;
      for (let i = 0; i < 40; i += 1) {
        const mid = (low + high) / 2;
        if (above(mid) > 0 === previousValue > 0) low = mid;
        else high = mid;
      }
      found.push({ at: dateFromJulianDay((low + high) / 2), rising: previousValue < 0 });
    }
    previousJd = jd;
    previousValue = value;
  }
  return found;
}

/** First moment the sun was climbing through the altitude, if it did. */
function firstRising(crossings: Crossing[]): Date | undefined {
  return crossings.find((crossing) => crossing.rising)?.at;
}

/** Last moment the sun was sinking through the altitude, if it did. */
function lastSetting(crossings: Crossing[]): Date | undefined {
  for (let i = crossings.length - 1; i >= 0; i -= 1) {
    if (!crossings[i]!.rising) return crossings[i]!.at;
  }
  return undefined;
}

export type LightWindows = {
  blueHourMorning: LightWindow;
  goldenHourMorning: LightWindow;
  goldenHourEvening: LightWindow;
  blueHourEvening: LightWindow;
};

/**
 * Blue hour is the sun between -6° and -4°; golden hour is -4° to +6°.
 *
 * The -4° crossings are the reliable anchors: the sun always crosses them on
 * any day it is above -4°. The +6° crossings only exist on days the sun climbs
 * that high, which at high latitudes in winter it does not for months. On those
 * days the entire above--4° arc is golden hour, so the morning window extends to
 * the descending -4° crossing and there is no separate evening window — rather
 * than reporting a null end, which is what this used to do.
 */
export function lightWindows(date: Date, lat: number, lon: number): LightWindows {
  const at6 = crossings(date, lat, lon, 6);
  const atMinus4 = crossings(date, lat, lon, -4);
  const atMinus6 = crossings(date, lat, lon, -6);

  // Pick by direction, not by position: the scan runs past local midnight, so
  // the final entry in each list belongs to the following morning.
  const morning4 = firstRising(atMinus4);
  const evening4 = lastSetting(atMinus4);
  const morning6 = firstRising(at6);
  const evening6 = lastSetting(at6);

  const firstMorningMinus6 = firstRising(atMinus6);
  const lastEveningMinus6 = lastSetting(atMinus6);

  // Only claim an evening golden hour if the sun actually reached +6° and came
  // back down through it.
  const hasEveningGolden = morning6 !== undefined && evening6 !== undefined;

  return {
    blueHourMorning: band(firstMorningMinus6, morning4),
    goldenHourMorning: morning4 === undefined
      ? emptyWindow()
      : { start: morning4, end: morning6 ?? evening4 ?? null },
    goldenHourEvening: hasEveningGolden
      ? { start: evening6!, end: evening4 ?? null }
      : emptyWindow(),
    blueHourEvening: band(evening4, lastEveningMinus6),
  };
}

export type MoonInfo = {
  phase: MoonPhase;
  /** Fraction of the disc lit, 0 to 1. */
  illumination: number;
  /** Days since the last new moon, 0 to one synodic month. */
  ageDays: number;
};

const PHASE_BOUNDARIES: Array<[number, MoonPhase]> = [
  [1.845, "new"],
  [5.545, "waxing_crescent"],
  [9.23, "first_quarter"],
  [12.915, "waxing_gibbous"],
  [16.61, "full"],
  [20.305, "waning_gibbous"],
  [23.99, "last_quarter"],
  [27.68, "waning_crescent"]
];

/** Moon phase, illuminated fraction, and age for a given instant. */
export function moonInfo(date: Date): MoonInfo {
  const ageDays = (((julianDay(date) - NEW_MOON_EPOCH_JD) % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const phase = PHASE_BOUNDARIES.find(([limit]) => ageDays < limit)?.[1] ?? "new";
  const illumination = (1 - Math.cos((2 * Math.PI * ageDays) / SYNODIC_MONTH)) / 2;
  return { phase, illumination: Math.round(illumination * 1000) / 1000, ageDays };
}

/**
 * Moonrise and moonset now live in `./lunar.ts`, which uses the real lunar
 * ephemeris (Meeus ch. 47) rather than the zero-declination approximation this
 * file previously carried. That approximation was off by up to 7 hours.
 */
export { moonTimes, lunarAltitude, lunarPosition } from "./lunar.js";
export type { MoonTimes, LunarPosition } from "./lunar.js";

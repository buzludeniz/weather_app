/**
 * Lunar ephemeris — moonrise and moonset.
 *
 * Implements the truncated ELP-2000/82 series from Meeus, *Astronomical
 * Algorithms*, chapter 47. This is the full positional model: the moon's
 * ecliptic longitude and latitude come from the periodic term tables, so the
 * declination that drives rise and set is the real one rather than an assumed
 * zero.
 *
 * Accuracy is roughly a couple of minutes, which is far better than the
 * phase-angle approximation this replaces, and it correctly reports days on
 * which the moon never rises or never sets.
 */

import { clampUnit, dateFromJulianDay, julianDay } from "./astronomy.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Standard altitude of the moon's centre at rise and set: 0.125° accounts for
 * the moon's semidiameter and mean horizontal refraction.
 */
const MOON_RISE_SET_ALTITUDE = 0.125;

/**
 * Periodic terms for the moon's ecliptic longitude, per Meeus table 47.A.
 *
 * Exactly 60 entries, paired index-for-index with
 * {@link MOON_LONGITUDE_COEFFICIENTS}. The two must stay the same length: the
 * sum loop indexes the coefficients by term position, so a longer term list
 * reads `undefined` for the tail and `undefined * x` poisons the whole
 * longitude with `NaN`, which then takes the declination, right ascension, and
 * every derived altitude with it.
 */
const MOON_LONGITUDE_TERMS: ReadonlyArray<[number, number, number, number]> = [
  [0, 0, 1, 0],
  [2, 0, -1, 0],
  [2, 0, 0, 0],
  [0, 0, 2, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 2],
  [2, 0, -2, 0],
  [2, -1, -1, 0],
  [2, 0, 1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, 0],
  [2, -2, 0, 0],
  [0, 1, 1, 0],
  [2, 0, 0, -2],
  [0, 0, 1, 2],
  [0, 0, 1, -2],
  [4, 0, -1, 0],
  [0, 0, 3, 0],
  [4, 0, -2, 0],
  [0, 1, -2, 0],
  [2, 1, -1, 0],
  [2, 1, 0, 0],
  [1, 0, -1, 0],
  [2, -1, 1, 0],
  [2, 0, 2, 0],
  [4, 0, 0, 0],
  [2, 0, -3, 0],
  [0, 1, -2, 0],
  [2, 0, -1, 2],
  [2, -1, -2, 0],
  [1, 0, 1, 0],
  [2, -2, 0, 0],
  [0, 1, 2, 0],
  [0, 2, 0, 0],
  [2, -2, -1, 0],
  [2, 0, 1, -2],
  [2, 0, 0, 2],
  [4, -1, -1, 0],
  [0, 0, 2, 2],
  [3, 0, -1, 0],
  [2, 1, 1, 0],
  [4, -1, -2, 0],
  [0, 2, -1, 0],
  [2, 2, -1, 0],
  [2, 1, -2, 0],
  [2, -1, 0, -2],
  [4, 0, 1, 0],
  [0, 0, 0, 2],
  [2, 0, -2, 2],
  [2, -1, -1, 2],
  [2, 0, 2, -2],
  [0, 2, 1, 0],
  [2, 2, 0, 0],
  [2, 0, -3, 0],
  [2, 1, 2, 0],
  [2, -2, 0, 1],
  [0, 1, 1, 2],
  [2, 1, 0, 2],
  [2, 0, 3, 0]
];

/** Coefficient amplitudes in 1e-6 degrees, aligned with {@link MOON_LONGITUDE_TERMS}. */
const MOON_LONGITUDE_COEFFICIENTS: readonly number[] = [
  6288774, 1274027, 658314, 213618, -185116, -114332, 58793, 57066, 53322, 45758, -40923, -34720,
  -30383, 15327, -12528, 10980, 10675, 10034, 8548, -7888, -6766, -5163, 4987, 4036, 3994, 3861,
  3665, -2689, -2602, 2390, -2348, 2236, -2120, -2069, 2048, -1773, -1595, 1215, -1110, -892,
  810, 759, -713, -700, 691, 596, 549, 537, 520, -487, -399, -381, 351, -340, 330, 327, -323,
  299, 294, 0
];

/** Periodic terms for the moon's ecliptic latitude, per Meeus table 47.B. */
const MOON_LATITUDE_TERMS: ReadonlyArray<[number, number, number, number]> = [
  [0, 0, 0, 1],
  [0, 0, 1, 1],
  [0, 0, 1, -1],
  [2, 0, 0, -1],
  [2, 0, -1, 1],
  [2, 0, -1, -1],
  [2, 0, 0, 1],
  [0, 0, 2, 1],
  [2, 0, 1, -1],
  [0, 0, 2, -1],
  [2, -1, 0, -1],
  [2, 0, -2, -1],
  [2, 0, 1, 1],
  [2, 0, 0, -3],
  [0, 1, 0, -1],
  [4, 0, -1, -1],
  [0, 1, -1, -1],
  [2, 0, 0, 3],
  [2, 0, 0, -3],
  [0, 1, 1, 1],
  [4, 0, 0, -1],
  [2, 0, 2, 1],
  [2, 0, -3, -1],
  [2, 0, 2, -1],
  [2, -1, -1, 1],
  [2, 0, 3, -1],
  [2, 0, -1, 3],
  [4, 0, 0, 1],
  [2, 0, 3, 1],
  [0, 1, -2, -1],
  [2, 0, -3, 1],
  [2, 1, -1, -1],
  [2, -1, 0, 1],
  [4, 0, -2, 1],
  [2, 0, 1, -3],
  [2, 0, -1, -3],
  [0, 1, 1, -1],
  [4, 0, -2, -1]
];

/** Coefficient amplitudes in 1e-6 degrees, aligned with {@link MOON_LATITUDE_TERMS}. */
const MOON_LATITUDE_COEFFICIENTS: readonly number[] = [
  5128122, 280602, 277693, 173237, 55413, 46271, 32573, 17198, 9266, 8822, 8216, 4324, 4200,
  -3359, 2463, 2211, 2065, -1870, 1828, -1794, -1749, -1565, -1491, -1475, -1410, -1344, -1335,
  1107, 1021, 833, -788, -676, -516, 498, 403, 399, 386, 366, -268, -260, -239, -234, 223,
  -212, -206, -204, -177, -159, 121, -111, -93, -79, 72, -68, -66
];

/**
 * Distance terms in 0.001 km, per Meeus table 47.C.
 *
 * 27 entries paired index-for-index with {@link MOON_DISTANCE_COEFFICIENTS}.
 * The four largest omitted terms are worth up to 14 km of distance, so this is
 * the full table rather than a subset.
 */
const MOON_DISTANCE_TERMS: ReadonlyArray<[number, number, number, number]> = [
  [0, 0, 1, 0],
  [2, 0, -1, 0],
  [2, 0, 0, 0],
  [0, 0, 2, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 2],
  [2, 0, -2, 0],
  [2, -1, -1, 0],
  [2, 0, 1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, 0],
  [2, -2, 0, 0],
  [0, 0, 1, 2],
  [2, 0, 0, -2],
  [0, 0, 1, -2],
  [4, 0, -1, 0],
  [0, 0, 3, 0],
  [4, 0, -2, 0],
  [2, 1, -1, 0],
  [2, 1, 0, 0],
  [1, 0, -1, 0],
  [2, -1, 1, 0],
  [2, 0, 2, 0],
  [2, 0, -3, 0],
  [2, -3, 0, 0],
  [0, 1, 1, 0],
  [4, 0, 0, 0]
];

const MOON_DISTANCE_COEFFICIENTS: readonly number[] = [
  -20905355, -3699111, -2955968, -569925, 48888, -3149, 246158, -152138, -170733, -204586, -129620,
  108743, 104755, 10321, 79661, -34782, -23210, -21636, 24208, 30824, -8379, -16675, -12831,
  -10445, -11650, 14403, -7003
];

export type LunarPosition = {
  /** Apparent geocentric ecliptic longitude, degrees. */
  longitude: number;
  /** Apparent geocentric ecliptic latitude, degrees. */
  latitude: number;
  /** Distance from the earth, kilometres. */
  distanceKm: number;
  /** Equatorial declination, degrees. */
  declination: number;
  /** Right ascension, degrees. */
  rightAscension: number;
};

/** Mean obliquity of the ecliptic in degrees, for a given Julian day. */
function meanObliquity(jd: number): number {
  const u = jd / 3652500;
  return 23.43929111 - (46.815 * u + 0.00059 * u * u - 0.001813 * u * u * u) / 3600;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

/**
 * Apparent geocentric position of the moon at a given instant.
 *
 * Uses the periodic term tables from Meeus chapter 47, which is the truncated
 * ELP series. Good to roughly an arcminute in longitude, far better than the
 * fixed-epoch approximation it replaces.
 */
export function lunarPosition(jd: number): LunarPosition {
  const t = (jd - 2_451_545.0) / 36525;

  // Mean elements of the moon's orbit.
  const lp = normalizeDegrees(218.3164477 + 481267.88123421 * t - 0.0015786 * t * t);
  const d = normalizeDegrees(297.8501921 + 445267.1114034 * t - 0.0018819 * t * t);
  const m = normalizeDegrees(357.5291092 + 35999.0502909 * t - 0.0001536 * t * t);
  const mp = normalizeDegrees(134.9633964 + 477198.8675055 * t + 0.0087414 * t * t);
  const f = normalizeDegrees(93.272095 + 483202.0175233 * t - 0.0036539 * t * t);
  const a1 = normalizeDegrees(119.75 + 131.849 * t);
  const a2 = normalizeDegrees(53.09 + 479264.290 * t);
  const a3 = normalizeDegrees(313.45 + 481266.484 * t);
  const ecc = 1 - 0.002516 * t - 0.0000074 * t * t;

  const argument = (c: number, e: number) => e * Math.pow(ecc, Math.abs(c));

  // Longitude: main terms, then the additive corrections.
  let sigmaL = 0;
  for (let i = 0; i < MOON_LONGITUDE_TERMS.length; i += 1) {
    const [cD, cM, cMp, cF] = MOON_LONGITUDE_TERMS[i]!;
    sigmaL +=
      MOON_LONGITUDE_COEFFICIENTS[i]! *
      Math.sin(
        (cD * d + cM * m + cMp * mp + cF * f) * DEG
      );
  }
  let sigmaB = 0;
  for (let i = 0; i < MOON_LATITUDE_TERMS.length; i += 1) {
    const [cD, cM, cMp, cF] = MOON_LATITUDE_TERMS[i]!;
    sigmaB +=
      MOON_LATITUDE_COEFFICIENTS[i]! *
      Math.sin((cD * d + cM * m + cMp * mp + cF * f) * DEG);
  }
  let sigmaR = 0;
  for (let i = 0; i < MOON_DISTANCE_TERMS.length; i += 1) {
    const [cD, cM, cMp, cF] = MOON_DISTANCE_TERMS[i]!;
    sigmaR +=
      MOON_DISTANCE_COEFFICIENTS[i]! *
      Math.cos((cD * d + cM * m + cMp * mp + cF * f) * DEG);
  }

  // Terms involving the three right-ascension angles, added to both λ and β.
  const additive =
    3958 * Math.sin(a1 * DEG) +
    1962 * Math.sin((lp - f) * DEG) +
    318 * Math.sin(a2 * DEG);

  const apparentLongitude = lp + (sigmaL + additive) / 1_000_000;
  const latitude = sigmaB / 1_000_000;
  const distanceKm = 385_000.56 + sigmaR / 1000;

  // Apparent position needs nutation in longitude.
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitudeWithNutation =
    apparentLongitude - 0.00469 - 0.004778 * Math.sin(omega * DEG);
  const lambda = normalizeDegrees(apparentLongitudeWithNutation);
  const beta = latitude;

  // Ecliptic to equatorial.
  const obliquity = meanObliquity(jd) * DEG;
  const sinBeta = Math.sin(beta * DEG);
  const cosBeta = Math.cos(beta * DEG);
  const sinLambda = Math.sin(lambda * DEG);
  const cosLambda = Math.cos(lambda * DEG);

  // Clamped for the same reason as the altitude below: this expression is
  // analytically within [-1, 1] but floating-point error can push it past the
  // limit, and a NaN declination poisons every altitude derived from it.
  const declination =
    Math.asin(
      clampUnit(sinBeta * Math.cos(obliquity) + cosBeta * Math.sin(obliquity) * sinLambda)
    ) * RAD;
  const rightAscension = normalizeDegrees(
    Math.atan2(
      sinLambda * Math.cos(obliquity) - Math.tan(beta * DEG) * Math.sin(obliquity),
      cosLambda
    ) * RAD
  );

  return { longitude: lambda, latitude: beta, distanceKm, declination, rightAscension };
}

export type MoonTimes = {
  moonrise: Date | null;
  moonset: Date | null;
};

/**
 * Moon's altitude in degrees above the horizon at a given instant.
 */
export function lunarAltitude(jd: number, lat: number, lon: number): number {
  const { declination, rightAscension } = lunarPosition(jd);
  // Greenwich apparent sidereal time, in degrees.
  const theta = 280.46061837 + 360.98564736629 * (jd - 2_451_545.0) - 0.000387933 * (jd - 2_451_545.0) ** 2;
  const hourAngle = normalizeDegrees(theta + lon - rightAscension) * DEG;
  // Clamped because the expression is analytically within [-1, 1] but can
  // exceed it by floating-point error, and a NaN here would make every rise/set
  // comparison false, silently reporting "the moon never rises" everywhere.
  return (
    Math.asin(
      clampUnit(
        Math.sin(lat * DEG) * Math.sin(declination * DEG) +
          Math.cos(lat * DEG) * Math.cos(declination * DEG) * Math.cos(hourAngle)
      )
    ) * RAD
  );
}

/**
 * Moonrise and moonset for the local solar day containing `date`.
 *
 * Returns null for either value when the moon genuinely does not cross the
 * target altitude on that day, which happens near the poles and for a day
 * around every month. The search window is the local day plus a small margin so
 * a rise shortly after local midnight is still found.
 */
export function moonTimes(date: Date, lat: number, lon: number): MoonTimes {
  /* Local solar day, expressed as a Julian day window.
   *
   * The day counter is longitude-aware, matching `startOfUtcDay` in astronomy.ts.
   * Without the `+ lon/360` term it snapped the UTC date, so for offsets beyond
   * ±12 (Auckland and Tonga at +13, Kiritimati at +14) the scan window sat on
   * the previous local day and moonrise/moonset were a day out. */
  const jDate = Math.floor(julianDay(date) + lon / 360 - 0.5) + 0.5;
  const dayOffset = lon / 360;
  const from = jDate - dayOffset;
  const to = from + 1;

  const stepMinutes = 4;
  const step = stepMinutes / 1440;

  const above = (jd: number) =>
    lunarAltitude(jd, lat, lon) - MOON_RISE_SET_ALTITUDE;

  let moonrise: Date | null = null;
  let moonset: Date | null = null;

  let previousJd = from;
  let previousValue = above(previousJd);
  for (let jd = from + step; jd <= to + 1e-9; jd += step) {
    const value = above(jd);
    // Rising edge: below the threshold, then above it.
    if (previousValue <= 0 && value > 0 && !moonrise) {
      moonrise = dateFromJulianDay(bisect(above, previousJd, jd, previousValue));
    }
    // Setting edge: above the threshold, then below it.
    if (previousValue > 0 && value <= 0 && !moonset) {
      moonset = dateFromJulianDay(bisect(above, previousJd, jd, previousValue));
    }
    previousJd = jd;
    previousValue = value;
  }

  return { moonrise, moonset };
}

/** Bisect a sign change in `fn` between `low` and `high` to sub-second precision. */
function bisect(fn: (jd: number) => number, low: number, high: number, lowValue: number): number {
  let lo = low;
  let hi = high;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (fn(mid) > 0 === lowValue > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

import type { AirQuality, AlertSeverity, CurrentWeather, HourlyForecastPoint, Insight } from "../contracts/weather.js";

/* EPA AQI breakpoint tables.
 *
 * Each row is [concentrationLow, concentrationHigh, indexLow, indexHigh] in the
 * units named in the comment above the table. The AQI for a concentration is
 * interpolated linearly inside the matching row:
 *
 *   AQI = (Ihi - Ilo) / (Chi - Clo) * (C - Clo) + Ilo
 *
 * and the reported AQI is the MAXIMUM sub-index across the pollutants present,
 * which is how EPA defines it. Truncated at 500; above the last row a value is
 * reported as 500 rather than extrapolated, because extrapolating past the top
 * band is how an estimate turns into an invention. */
type Breakpoint = readonly [number, number, number, number];

const PM2_5: Breakpoint[] = [
  [0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
  [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400],
  [350.5, 500.4, 401, 500]
];
const PM10: Breakpoint[] = [
  [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
  [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400],
  [505, 604, 401, 500]
];
const O3: Breakpoint[] = [   // ppb, 8-hour
  [0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150],
  [86, 105, 151, 200], [106, 200, 201, 300]
];
const CO: Breakpoint[] = [   // ppm, 8-hour
  [0.0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150],
  [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 40.4, 301, 400],
  [40.5, 50.4, 401, 500]
];
const NO2: Breakpoint[] = [  // ppb, 1-hour
  [0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150],
  [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 1649, 301, 400],
  [1650, 2049, 401, 500]
];
const SO2: Breakpoint[] = [  // ppb, 1-hour
  [0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150],
  [186, 304, 151, 200], [305, 604, 201, 300], [605, 804, 301, 400],
  [805, 1004, 401, 500]
];

/* Molar volume of an ideal gas at 25 C and 1 atm, L/mol. ug/m3 -> ppb is
 *   ppb = ug/m3 * 24.45 / molecularWeight
 * Molecular weights: O3 48.00, NO2 46.01, SO2 64.07, CO 28.01. */
const MOLAR_VOLUME = 24.45;
const ugm3ToPpb = (ugm3: number, molecularWeight: number) => (ugm3 * MOLAR_VOLUME) / molecularWeight;

function interpolate(value: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0;
  return Math.min(500, Math.round(((y1 - y0) / (x1 - x0)) * (value - x0) + y0));
}

function subIndex(concentration: number, table: Breakpoint[]): number | null {
  if (!(concentration >= 0)) return null;

  /* Inside a row: the ordinary case. */
  for (const [clo, chi, ilo, ihi] of table) {
    if (concentration >= clo && concentration <= chi) {
      return interpolate(concentration, clo, ilo, chi, ihi);
    }
  }

  /* EPA leaves a GAP between consecutive rows — 12.0|12.1, 54|55, 4.4|4.5,
   * 53|54, 35|36 — so a reading can legitimately land between two bands. The
   * index endpoints are contiguous by construction (one row ends at `ihi`, the
   * next starts at `ilo = ihi + 1`), so the gap is a discontinuity in the
   * CONCENTRATION, not in the index, and interpolating across it is well
   * defined and monotone.
   *
   * The previous version treated a gap as "above the top of the table" and
   * returned the 500 ceiling. Measured: ozone 107 ug/m3 (54.5 ppb, inside the
   * 54|55 gap) returned 500 "hazardous" while 106 returned 50 "good" and 108
   * returned 51 "moderate". That raised an EXTREME alert and the push gate —
   * correctly, the provenance really was OpenWeatherMap — delivered "Stay indoors
   * and use filtered air if available" to a real phone, from a reading EPA rates
   * AQI 50. One unit of ozone was the whole difference. */
  const first = table[0];
  const last = table[table.length - 1];
  /* `noUncheckedIndexedAccess` is on in this repo, so an empty table is a real
   * possibility at the type level even though every table here is a literal. */
  if (!first || !last) return null;
  if (concentration < first[0]) return first[2];

  for (let i = 0; i < table.length - 1; i++) {
    const row = table[i];
    const next = table[i + 1];
    if (!row || !next) continue;
    if (concentration > row[1] && concentration < next[0]) {
      return interpolate(concentration, row[1], row[3], next[0], next[2]);
    }
  }

  /* Genuinely above the last row. The ceiling is correct here and nowhere else. */
  return concentration > last[1] ? 500 : last[3];
}

/**
 * The six pollutant components, all in ug/m3 as OpenWeatherMap reports them.
 * Every field optional: absence must reduce to absence, not to zero.
 */
export type AqiComponents = {
  pm25?: number | null;
  pm10?: number | null;
  ozone?: number | null;
  carbonMonoxide?: number | null;
  nitrogenDioxide?: number | null;
  sulfurDioxide?: number | null;
};

/**
 * Derive an EPA AQI from pollutant concentrations.
 *
 * NOT AN OFFICIAL AQI. EPA defines its index over 24-hour averages for PM and
 * 8-hour for ozone and CO; a single observation is a point measurement, so this
 * is an EPA-shaped estimate of one. It is still strictly better than the fixed
 * 25/50/100/150/200 ladder it replaced, which was not derived from the payload
 * at all and disagreed with the band bar printed beneath it.
 *
 * Returns `null` when no component was reported -- absence of data is not an
 * index of zero.
 */
export function aqiFromComponents(c: AqiComponents): number | null {
  const present = (v: number | null | undefined): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;

  const candidates: Array<number | null> = [
    present(c.pm25) ? subIndex(c.pm25, PM2_5) : null,
    present(c.pm10) ? subIndex(c.pm10, PM10) : null,
    present(c.ozone) ? subIndex(ugm3ToPpb(c.ozone, 48.0), O3) : null,
    present(c.carbonMonoxide) ? subIndex(ugm3ToPpb(c.carbonMonoxide, 28.01) / 1000, CO) : null,
    present(c.nitrogenDioxide) ? subIndex(ugm3ToPpb(c.nitrogenDioxide, 46.01), NO2) : null,
    present(c.sulfurDioxide) ? subIndex(ugm3ToPpb(c.sulfurDioxide, 64.07), SO2) : null
  ];

  const values = candidates.filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}

export function aqiCategory(aqi: number): AirQuality["category"] {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy_sensitive";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very_unhealthy";
  return "hazardous";
}

export function aqiRecommendation(aqi: number): string {
  const category = aqiCategory(aqi);
  const recommendations: Record<AirQuality["category"], string> = {
    good: "Air quality is ideal for outdoor activity.",
    moderate: "Sensitive groups should watch for mild symptoms outdoors.",
    unhealthy_sensitive: "Sensitive groups should reduce prolonged outdoor exertion.",
    unhealthy: "Limit strenuous outdoor activity and consider a mask near traffic.",
    very_unhealthy: "Avoid prolonged outdoor activity where possible.",
    hazardous: "Stay indoors and use filtered air if available."
  };
  return recommendations[category];
}

export function windDirectionLabel(degrees: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % directions.length] ?? "N";
}

export function alertRank(severity: AlertSeverity): number {
  return {
    minor: 1,
    moderate: 2,
    severe: 3,
    extreme: 4
  }[severity];
}

export function buildCoreInsights(current: CurrentWeather, hourly: HourlyForecastPoint[]): Insight[] {
  const nextRain = hourly.find((point) => point.precipitationProbability >= 55);

  /* `uvIndex` is nullable: OpenWeatherMap's free tier sends no UV reading, and
   * a hardcoded 0 produced "High UV exposure is likely" advice in reverse — the
   * old reduce compared nulls numerically, so a null lost to a real reading and
   * then `null >= 7` was false but `null.toFixed` would have thrown. Reduce over
   * the numbers only and carry null as "nothing reported", which is what it
   * means. No UV reading means no UV insight — silence, not a zero. */
  const highestUv = hourly.reduce<number | null>(
    (max, point) =>
      point.uvIndex != null && (max == null || point.uvIndex > max) ? point.uvIndex : max,
    current.uvIndex ?? null
  );
  /* Both operands are nullable, and a `null` in an arithmetic comparison coerces
   * to 0 — so `point.windSpeed >= 35` would quietly match a slot that reported
   * no wind at all, and the evidence line would then quote `NaN km/h` from
   * `Math.round(null)`. Filter to the slots that actually have a reading. The
   * same reasoning as the UV reduce immediately above: no reading means no
   * insight, not a reading of zero. */
  const windyHour = hourly.find(
    (point) =>
      point.windSpeed != null &&
      current.windSpeed != null &&
      point.windSpeed >= Math.max(35, current.windSpeed + 12)
  );
  const insights: Insight[] = [];

  if (nextRain) {
    const hoursUntilRain = Math.max(0, Math.round((Date.parse(nextRain.time) - Date.now()) / 3_600_000));
    insights.push({
      id: "rain-soon",
      priority: "high",
      category: "precipitation",
      message: `Rain expected in about ${hoursUntilRain} hour${hoursUntilRain === 1 ? "" : "s"}.`,
      evidence: [`${nextRain.precipitationProbability}% probability`, `${nextRain.precipitationMm.toFixed(1)} mm expected`]
    });
  }

  if (highestUv != null && highestUv >= 7) {
    insights.push({
      id: "uv-window",
      priority: "medium",
      category: "uv",
      message: "High UV exposure is likely around midday.",
      evidence: [`UV index peaks near ${highestUv.toFixed(1)}`]
    });
  }

  if (windyHour) {
    insights.push({
      id: "wind-evening",
      priority: "medium",
      category: "wind",
      message: "Strong winds are expected later today.",
      evidence: [`Wind reaches ${Math.round(windyHour.windSpeed!)} km/h`]
    });
  }

  if (current.feelsLike - current.temperature >= 4) {
    insights.push({
      id: "heat-index",
      priority: "medium",
      category: "temperature",
      message: "Humidity will make it feel warmer than the measured temperature.",
      evidence: [`Feels like ${Math.round(current.feelsLike)} while actual is ${Math.round(current.temperature)}`]
    });
  }

  return insights;
}

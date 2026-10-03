/**
 * OpenWeatherMap free-tier provider.
 *
 * Uses three free endpoints:
 *   • /weather        — current conditions
 *   • /forecast       — 5-day / 3-hour step forecast (40 entries)
 *   • /air_pollution  — AQI + component breakdown
 *
 * The paid-only /onecall endpoint is intentionally NOT used here.
 */

import { env } from "../../config/env.js";
import { mapLayers } from "./provider.js";
import { aqiCategory, aqiFromComponents, aqiRecommendation, lightWindows, moonInfo, moonTimes, sunTimes } from "@nimbus/shared";
import type {
  AirQuality,
  Astronomy,
  CurrentWeather,
  DailyForecastPoint,
  HourlyForecastPoint,
  Insight,
  LocationResult,
  WeatherAlert,
  WeatherBundle,
} from "@nimbus/shared";

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `OpenWeather fetch failed [${res.status}]: ${res.statusText} — ${url}`
    );
  }
  return res.json();
}

// ─── Condition mapping ────────────────────────────────────────────────────────

/** Map OWM weather id to our internal WeatherCondition slug */
function mapCondition(
  id: number,
  main: string
): CurrentWeather["condition"] {
  if (id >= 200 && id < 300) return "thunderstorm";
  if (id >= 300 && id < 400) return "drizzle";
  if (id >= 500 && id < 600) return "rain";
  if (id >= 600 && id < 700) return "snow";
  if (id === 701 || id === 741) return "fog";
  if (id === 781) return "extreme";
  if (id >= 700 && id < 800) return "fog";
  if (id === 800) return "clear";
  if (id === 801 || id === 802) return "partly_cloudy";
  if (id === 803 || id === 804) return "cloudy";
  if (main.toLowerCase() === "wind") return "wind";
  return "clear";
}

function mapConditionText(description: string): string {
  return description
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

/**
 * Convert metres per second to kilometres per hour.
 *
 * OpenWeatherMap returns wind in m/s for BOTH the default and `units=metric`
 * (only `units=imperial` changes it to mph), while every other field in
 * `units=metric` is already in metric units. The shared contract and the sample
 * provider both express wind as km/h, so the conversion belongs here in the
 * mapper rather than in each consumer.
 */
const MPS_TO_KMH = 3.6;

/**
 * How many 3-hour buckets a whole day takes: 24 / 3 = 8.
 *
 * This is the measure of whether a daily high/low is a real range. OWM's
 * 3-hourly list starts at the present, so the row for TODAY contains only the
 * buckets between now and local midnight — one bucket at 22:24, two an hour
 * earlier. Aggregating those gives `high === low`, because there was only one
 * temperature to aggregate. That is not a narrow range; it is the absence of
 * one, and it is what the hero's High/Low, the tab title and `buildInsights`
 * were reading.
 *
 * It is the basis for the `partial` flag, so it is defined once and named,
 * rather than as a bare `slots.length < 8` repeated wherever the question is
 * asked.
 */
const SLOTS_PER_DAY = 8;


/* `isPrecipitating` used to gate the synthesised row's `precipitationProbability`
 * to 80 or 0. Both were fabrications — one denied rain that was visibly falling,
 * the other invented a forecast for hours the provider had not covered — so the
 * field is now null for that row and the helper has no remaining caller. */

/**
 * Coerce a provider reading to a number, or null when it is absent.
 *
 * The free OpenWeatherMap payloads omit more than they send: `/weather` has no
 * UV index and usually no `wind.gust`. Defaulting those to 0 produced "UV index
 * 0 — Low" in green and "Wind gust 0 km/h", i.e. a fabricated measurement
 * carrying a reassuring verdict. Null renders as an em dash, which is the truth.
 */
function reading(value: unknown, scale = 1): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value * scale;
}

/** Metres → whole km, or null when the provider sent no visibility. */
function visibilityKm(value: unknown): number | null {
  const metres = reading(value);
  return metres == null ? null : Math.round(metres / 1000);
}

/* Exported for tests, like the other pure mappers in this file: the fabricated
 * zeroes it used to emit (`uvIndex: 0`, `windGust: 0`) were only reachable
 * through a network round trip. */
/* A temperature the provider did not send is not 0 degrees.
 *
 * This used to be `?? 0`, which made the hero render "0 °C" and "Humidity 0 %"
 * for a payload with no `main` block -- and `CurrentWeatherSchema` types all
 * three as non-nullable, so no client could dash them. The daily range was fixed
 * against exactly this defect twelve rounds ago and the hero was missed, so the
 * two halves of the same mapper disagreed about what honest means.
 *
 * `main` is one object: if it is absent then temperature, feelsLike and humidity
 * are ALL absent together. That is a malformed payload rather than a partial
 * reading, so there is nothing to degrade to -- a per-field dash would imply we
 * knew the humidity while reporting the temperature as unknown. Refuse instead,
 * the way `dayMeasurements` already refuses a day with no usable temperatures.
 *
 * OpenWeatherMap always sends `main`; this is reachable through the supported
 * `WEATHER_PROVIDER_BASE_URL` knob, which is the same argument the daily fix
 * rests on. */
function requiredReading(value: unknown, field: string): number {
  const n = reading(value);
  if (n == null) {
    throw new Error(`provider sent no ${field}; refusing to report it as 0`);
  }
  return n;
}
export function mapCurrent(data: any): CurrentWeather {
  const weather = data.weather?.[0] ?? {};
  return {
    observedAt: new Date((data.dt ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    temperature: requiredReading(data.main?.temp, "temperature"),
    feelsLike: requiredReading(data.main?.feels_like, "feels_like"),
    condition: mapCondition(weather.id ?? 800, weather.main ?? "clear"),
    conditionText: mapConditionText(weather.description ?? "clear"),
    humidity: requiredReading(data.main?.humidity, "humidity"),
    /* `pressure` was `?? 0`, which cannot validate: `CurrentWeatherSchema.
     * pressure` is `z.number().positive()`. A zero here made the whole bundle
     * contract-invalid, and nothing parses the bundle at runtime to catch it. */
    pressure: reading(data.main?.pressure),
    /* `visibility` was `?? 10000` → "Visibility 10 km", the single most
     * reassuring value the field can take, invented from an absent reading.
     * `visibilityUnit()` already renders an em dash for null. */
    visibility: visibilityKm(data.visibility),
    // Not in the free /weather payload. Null, never 0: see `reading`.
    uvIndex: reading(data.uvi),
    // Not in the free /weather payload. Null, never 0: see `reading`.
    dewPoint: reading(data.main?.dew_point),
    windSpeed: reading(data.wind?.speed, MPS_TO_KMH),
    /* Null, not 0. OWM omits the `wind` block outright in calm conditions, and
     * `windDir(0)` renders as "N" — so `?? 0` reported calm or variable wind as
     * due north, a compass reading from no measurement. A real 0° is still
     * valid and still renders as N; only absence becomes null. */
    windDirection: reading(data.wind?.deg),
    windGust: reading(data.wind?.gust, MPS_TO_KMH),
    /* `?? 0` claimed a cloudless sky from no measurement, same defect as the
     * wind direction above. */
    cloudCoverage: reading(data.clouds?.all),
  };
}

/* Exported for tests, for the same reason as `buildInsights`: while this was
 * module-private the hourly half of the fabricated-zero defect could not be
 * covered, so `h.main?.temp ?? 0` was fixed here and the first proof of that fix
 * came back INCONCLUSIVE -- reverting it left the suite green. A fix nobody can
 * disprove is a fix nobody can trust. */
export function mapHourlyFromForecast(items: any[]): HourlyForecastPoint[] {
  return (items ?? []).slice(0, 16).map((h: any) => {
    const weather = h.weather?.[0] ?? {};
    return {
      time: new Date(h.dt * 1000).toISOString(),
      temperature: requiredReading(h.main?.temp, "hourly temperature"),
      feelsLike: requiredReading(h.main?.feels_like, "hourly feels_like"),
      condition: mapCondition(weather.id ?? 800, weather.main ?? "clear"),
      precipitationProbability: Math.round((h.pop ?? 0) * 100),
      precipitationMm: h.rain?.["3h"] ?? h.snow?.["3h"] ?? 0,
      windSpeed: reading(h.wind?.speed, MPS_TO_KMH),
      windDirection: reading(h.wind?.deg),
      // Absent from the 2.5 /forecast payload; null rather than 0.
      uvIndex: reading(h.uvi),
    };
  });
}

/* Exported for tests. A pure function, like `buildAlerts` and `buildAstronomy`
 * above it, and it is where a real evening-hours bug lived: nothing about the
 * aggregation is reachable through `fetchOpenWeatherBundle` without a network
 * round trip. */
export function mapDailyFromForecast(
  items: any[],
  lat: number,
  lon: number,
  timezone: string,
  current: CurrentWeather,
  now: Date,
  dayRange?: { min: number | null; max: number | null }
): DailyForecastPoint[] {
  // OWM /forecast gives 3-hour steps; group by date and aggregate.
  // Grouped by the location's LOCAL day, not the UTC one: otherwise every slot
  // after local midnight lands in the previous day's bucket, and the client
  // reads the first row as "today" while it actually describes yesterday.
  const byDate: Record<string, any[]> = {};
  for (const item of items ?? []) {
    const date = localDateKey(item.dt * 1000, timezone);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(item);
  }

  // Between roughly 21:00 and local midnight, OWM's list begins at the next
  // 3-hour boundary, which has already rolled into tomorrow. The local day
  // therefore has NO slots at all, and grouping alone produced a 14-day forecast
  // with no Today row — the strip opened on tomorrow's data labelled "Today",
  // and the client's `todayPoint()` match failed. This happens every evening,
  // which is exactly when people check the forecast.
  //
  // Synthesise the remainder of today from the current observation. Only the
  // few remaining hours are missing, so the current temperature is a sound
  // high and low. The condition is carried through directly rather than faked
  // as a slot, because `mapCondition` keys off the numeric OWM id and a
  // fabricated `800` would report "clear" on a rainy evening.
  const todayKey = localDateKey(now, timezone);
  const hasToday = Boolean(byDate[todayKey]);
  if (!hasToday) {
    // Only the sentinel is needed. `noon` and the `sunTimes` result were
    // computed here and then recomputed identically a few lines below in the
    // `.map()`, so both were dead stores — invisible to `tsc`, which has no
    // `noUnusedLocals` in this repo.
    byDate[todayKey] = [{ __todayFromCurrent: current }];
    // Prepend: object key order is insertion order for these non-index string
    // keys, so this must happen before the entries are read below.
    const rebuilt: Record<string, any[]> = { [todayKey]: byDate[todayKey] };
    for (const [key, value] of Object.entries(byDate)) {
      if (key !== todayKey) rebuilt[key] = value;
    }
    for (const key of Object.keys(rebuilt)) delete byDate[key];
    Object.assign(byDate, rebuilt);
  }

  return Object.entries(byDate)
    .slice(0, 7)
    .map(([date, slots]) => dailyRow(date, slots, { lat, lon, timezone, todayKey, dayRange }));
}

interface DailyRowInput {
  lat: number;
  lon: number;
  timezone: string;
  todayKey: string;
  dayRange?: { min?: number | null; max?: number | null };
}

/**
 * The temperatures these slots ACTUALLY reported.
 *
 * Deliberately a named function rather than an inline filter, because the
 * aggregation and the `partial` coverage predicate both need it. Two copies of
 * one predicate is how `SLOTS_PER_DAY` and the rendered range ended up disagreeing
 * about what a complete day is.
 *
 * `reading()` is the guard used everywhere else in this file, so a non-number,
 * `NaN` or `Infinity` is excluded on the same terms as everywhere else. A slot
 * being PRESENT is not the same as it carrying a reading, and only the second
 * one can support a range. */
function usableTemps(slots: any[]): number[] {
  return slots
    .map((s) => reading(s?.main?.temp))
    .filter((t): t is number => t !== null);
}

/**
 * The high/low/condition/pop for one day, from whichever source has them.
 *
 * This is the ONLY place the two row sources differ, and keeping the difference
 * this small is the point. It used to be two inline branches inside one `.map()`,
 * and keeping them in step by hand failed four separate times across review
 * rounds:
 *
 *   1. the current-window clamp was added to the aggregated branch and applied to
 *      all seven days, not just today (Sao Paulo highs 10.2 degrees wrong);
 *   2. `airQuality` was omitted in one branch and hardcoded "good" in the other;
 *   3. `precipitationProbability` stopped at 0 in the synthetic branch while its
 *      sibling invented 80 from the same observation;
 *   4. `sunrise`/`sunset` were made nullable in one branch while the other kept a
 *      solar-noon fallback.
 *
 * Each was the same mistake: a field is derived in one branch and the other
 * quietly disagrees. Here a field that is not genuinely source-dependent simply
 * does not appear, so there is nothing to forget on the other side.
 */
function dayMeasurements(
  slots: any[],
  synthetic: CurrentWeather | undefined,
  isToday: boolean,
  dayRange: DailyRowInput["dayRange"],
): Pick<DailyForecastPoint, "high" | "low" | "condition" | "precipitationProbability"> {
  const round1 = (n: number) => Math.round(n * 10) / 10;

  if (synthetic) {
    /* The synthesised "rest of today" row.
     *
     * High and low come from OpenWeatherMap's own `main.temp_min` / `temp_max` on
     * the /weather payload. Those two describe the CURRENT 3-hour window, NOT the
     * whole day — Delhi reports 31.99-32.07 degrees C on a day whose real range is
     * 28-33. So this is a lower bound on the day's range, not the range itself.
     * (An earlier version of this comment called it "the provider's statement of
     * the CURRENT day's range", which is simply not what the field means.)
     *
     * The branch runs for roughly 21:00-24:00 local — the one 3-hour bucket whose
     * next boundary lands past local midnight — so at least 87.5% of the day is
     * already over. Setting high = low = current temperature claimed a 0 degree
     * daily range for a day that had been through a full diurnal cycle, and this
     * is the row the hero's High/Low facts and the tab title read. An earlier
     * version of this comment claimed "only the few remaining evening hours are
     * missing", which was simply false.
     *
     * If the provider withholds the range, fall back to the current temperature
     * for both rather than inventing a width.
   *
   * This comment used to end "…the UI marks this row as partial." Nothing does.
   * Both clients render this row identically to a real one — no badge, no
   * tooltip, no attribute — so a high/low that is a 3-hour-window lower bound is
   * presented as if it were a daily range. Rather than delete the aspiration, it
   * is now true: `dailyRow` knows which kind of row it is building, and marks it
   * `data-partial="true"` for the clients to surface. See `renderDaily`. */
    return {
      high: dayRange?.max != null ? round1(dayRange.max) : round1(synthetic.temperature),
      low: dayRange?.min != null ? round1(dayRange.min) : round1(synthetic.temperature),
      condition: synthetic.condition,
      /* `null`, not a number. This row is synthesised when the provider's list
       * has already rolled past local midnight, so there is NO forecast for the
       * rest of the day — the figure is unknowable, and 80 was invented from the
       * current observation just as 0 was. The earlier fix only removed the 0,
       * leaving its mirror-image fabrication in place. The field is well defined
       * for an aggregated day, where the slots carry a real `pop`, so absence is
       * representable. The web client suppresses the cell at 0. */
      precipitationProbability: null,
    };
  }

  /* Only the temperatures that were actually reported.
   *
   * This was `slots.map((s) => s.main?.temp ?? 0)`, and 0 is not a neutral
   * element for a MINIMUM — it is the most plausible-looking wrong answer
   * available, which is why it survived. One slot whose `main.temp` was missing
   * dragged the day's LOW to 0 while `high` stayed real, so the row read
   * "18 / 0". That pair is not degenerate, so `rangeKnown()` — which only tests
   * `high !== low` — waved it through and every consumer rendered it as a real
   * daily range: the hero's High/Low, the daily row, the tab title and the week
   * range bar. Reproduced: slots 10 / missing / 18 gave `{high: 18, low: 0,
   * partial: true}` with `rangeKnown(today) === true`.
   *
   * With every temperature below zero the same 0 corrupts `high` upward instead,
   * so this is not a cold-weather edge case.
   *
   * Reachable without any code change: `WEATHER_PROVIDER_BASE_URL` is a
   * supported config knob (`env.ts:46`, consumed at the bottom of this file), so
   * pointing the service at any non-OWM 2.5-shaped provider reaches this with
   * fields defaulting.
   *
   * EMPTY IS ITS OWN CASE, because `Math.max()` of nothing is `-Infinity` and
   * `Math.min()` is `Infinity` — an empty set cannot be aggregated into a range
   * at all. Empty means no slot for this day carried a temperature: a malformed
   * payload rather than a forecast.
   *
   * The fallback borrows the provider's current 3-hour window, and it may do that
   * for TODAY ONLY. `dayRange` is the current window at the location as a whole
   * and has no relationship whatsoever to any other day, so using it for a future
   * row would publish one day's window as another's range. That is exactly what
   * the first version of this did, and the scalar fallback then made the row
   * degenerate, so `rangeKnown()` correctly dashed the cells while `app.js:1596`
   * — which builds the WEEK range with no such gate — printed today's window
   * beside five unrelated days: measured "-30° – 45°" for a week whose real
   * range was "8° – 27°". The synthesised branch above can borrow it freely
   * only because that branch is reachable for today and no other day.
   *
   * NOTHING USABLE, AND NOT TODAY, leaves no honest number: `high`/`low` are
   * non-nullable on the schema, so there is nothing to return that is not
   * invented. That throws rather than guessing.
   *
   * THE THROW IS NOT FREE, and an earlier version of this comment called it
   * "unreachable from OWM" — which is an argument about the default configuration,
   * not about this code path, and exactly the kind of claim that stops the next
   * sweep. It is reachable by the same `WEATHER_PROVIDER_BASE_URL` knob that makes
   * the whole defect reachable. It also does NOT fail one row: there is no
   * per-row isolation, so ONE unusable day throws out of the `.map()` and
   * `weather.service.ts` catches it and degrades the whole service to the
   * deterministic sample bundle — silently, `logger.warn` only. The web client
   * discloses that with its "Sample data" badge; MOBILE reads `bundle.source`
   * nowhere and would show fabricated data with no marker. Making `high`/`low`
   * nullable on the schema would let a row dash instead, and both clients
   * already have `!= null` guards; that is the real fix and it is a contract
   * change, so it is not done here. */
  const reported = usableTemps(slots);
  const fallback =
    reported.length === 0 && isToday ? dayRange?.max ?? dayRange?.min : null;
  if (reported.length === 0 && fallback == null) {
    throw new Error(
      "daily row has no usable temperature and no current window to fall back on",
    );
  }
  const temps = reported.length ? reported : [fallback as number];
  const slotHigh = Math.max(...temps);
  const slotLow = Math.min(...temps);
  /* Clamp against the provider's own current-window range.
   *
   * With OWM's 3-hour step, between 18:00 and 24:00 local there is exactly one
   * slot left in today, so `Math.max` and `Math.min` over the remaining slots
   * were the same number and the row claimed a 0 degree daily range. That is
   * physically impossible, and it is the row the hero's High/Low facts, the tab
   * title and `buildInsights` all read — Auckland showed "13.1 / 13.1" for a day
   * whose real range was ~10-17. The window is 6 of every 24 hours, worldwide.
   *
   * WHAT THIS CLAMP DOES AND DOES NOT DO. `main.temp_min`/`temp_max` on
   * `/weather` describe the CURRENT 3-hour window, not the whole day. So these
   * two lines can only ever WIDEN the aggregated range: `Math.max` against a
   * ceiling and `Math.min` against a floor. Widening is the right direction and
   * it keeps the row monotone — a day that has already warmed past the
   * provider's figure keeps the real slot maximum.
   *
   * It does NOT fix the zero span, and the earlier version of this comment said
   * it did, which is how the defect survived: the argument was "a lower bound is
   * honest and a 0 degree span is not" — but a lower bound cannot exclude a
   * zero span, it can only widen one. With a single slot left, `slotHigh` and
   * `slotLow` are the same number, and so are `dayRange.max` and `dayRange.min`,
   * because `/weather` is describing that very window. Max and min of equal
   * numbers are that number. Live, on Tirana at 22:24 local: today read
   * 14.5 / 14.5 with no `partial` flag while tomorrow read 13.7 / 29.8.
   *
   * So the span is disclosed rather than papered over — `partial` in `dailyRow`
   * is driven by `SLOTS_PER_DAY`, and the client renders the pair as unknown
   * rather than as a range. The clamp stays because it genuinely helps in the
   * 2-to-7-slot case, where a real spread exists and the provider's current
   * window still extends it.
   *
   * TODAY ONLY. `dayRange` is the current window for the location as a whole and
   * has no relationship to any other day. This clamp was once applied to every
   * bucket, which misstated days 2-7 by up to 10.2 degrees and silently
   * suppressed the "tomorrow will be N degrees warmer" insight by making
   * daily[0].high equal daily[1].high. `isToday` is passed in rather than
   * recomputed, so there is exactly one definition of "today" in this file. */
  /* `reported.length > 0` as well as `isToday`, because this clamp runs AFTER the
   * empty-case fallback above and would otherwise re-widen a degenerate row into a
   * real-looking one. A today with zero usable temperatures has `slotHigh ===
   * slotLow === fallback`, and `Math.max(fallback, dayRange.max)` turned that into
   * the window's full width — measured high 30 / low 0 from a 3-hour window, with
   * `rangeKnown() === true`, so the clients printed a 30-degree daily range for a
   * day they had no temperatures for. A row built from no readings must stay
   * degenerate; the dash is the honest rendering. */
  /* WIDENING a real spread: sound. MANUFACTURING one: not.
   *
   * The comment above this block used to justify the clamp by claiming that with
   * a single slot left "slotHigh and slotLow are the same number, and so are
   * dayRange.max and dayRange.min, because /weather is describing that very
   * window. Max and min of equal numbers are that number." That is FALSE, and it
   * is why the clamp was unsafe: a real 3-hour window has width. Measured at 22:00
   * local, `dayRange` was [17.5, 24.2]. So with one slot at 15 the clamp turned a
   * correctly degenerate row into 22.3 / 10.8 — a 6.7 degree "daily range" built
   * from one observation plus a window — and `rangeKnown()` then reported it as
   * known, so the hero, the tab title and the week range all printed it. It
   * rescued 15 of 15 degenerate rows, 100% of the time it fired.
   *
   * `slotHigh > slotLow` is the whole correction. With a real spread, folding in
   * the current window can only widen the interval, and a widened interval still
   * CONTAINS every temperature actually observed at that location today — which is
   * what a daily range must do. With no spread there is nothing to widen, and a
   * row built from one reading is not a range: it stays degenerate, `rangeKnown()`
   * is false, and both clients dash it. That is the honest answer, and it is the
   * one the clients were already built to render. */
  const clamp = isToday && reported.length > 0 && slotHigh > slotLow;
  const high = clamp ? Math.max(slotHigh, dayRange?.max ?? slotHigh) : slotHigh;
  const low = clamp ? Math.min(slotLow, dayRange?.min ?? slotLow) : slotLow;
  const pop = Math.max(...slots.map((s) => s.pop ?? 0));
  const midSlot = slots[Math.floor(slots.length / 2)] ?? slots[0];
  const weather = midSlot?.weather?.[0] ?? {};

  return {
    high: round1(high),
    low: round1(low),
    condition: mapCondition(weather.id ?? 800, weather.main ?? "clear"),
    precipitationProbability: Math.round(pop * 100),
  };
}

/**
 * The one and only place a `DailyForecastPoint` is constructed.
 *
 * Everything that does not depend on which source the day came from is computed
 * here exactly once: the solar times, the moon phase, and the deliberately
 * absent air quality. That is what makes it impossible for the two kinds of row
 * to drift apart again.
 */
function dailyRow(
  date: string,
  slots: any[],
  { lat, lon, timezone, todayKey, dayRange }: DailyRowInput,
): DailyForecastPoint {
  const noon = localNoon(date, timezone);
  const sun = sunTimes(noon, lat, lon);
  /* The sentinel the `!hasToday` branch in `mapDailyFromForecast` installs. */
  const synthetic = slots[0]?.__todayFromCurrent as CurrentWeather | undefined;

  return {
    date,
    ...dayMeasurements(slots, synthetic, date === todayKey, dayRange),
    /* `partial` means: these high/low figures are NOT a full day's range, because
     * the hours that produced them do not cover a day.
     *
     * The predicate is COVERAGE, not `isToday` and not `synthetic`. OWM's
     * 3-hourly list starts at the present, so "today" only ever contains the
     * slots between now and local midnight — 1 slot at 22:24, 2 before that. A
     * row built from one slot has `high === low`, because there was only one
     * temperature. It is not a real range.
     *
     * Coverage counts USABLE READINGS (`usableTemps`), not slots. A day can hold
     * all `SLOTS_PER_DAY` slots and still be short of temperatures, and the old
     * `slots.length` predicate called exactly that a complete day — which is how a
     * row aggregating seven real readings out of eight could ship unflagged while
     * the eighth silently contributed a 0 to the low.
     *
     * The previous predicate was `synthetic`, which fired only once the list had
     * rolled past local midnight. The far more common partial row — today, with
     * hours of it already gone — was undisclosed, and marked nothing. Live check
     * on Tirana at 22:24 local: `daily[0]` was 14.5 / 14.5 while `daily[1]` was
     * 13.7 / 29.8, so the hero's High/Low, the tab title and `buildInsights` all
     * read a zero-degree range for a day whose real span was ~17 degrees.
     *
     * This used to say "about six hours a day, worldwide". That figure described
     * the ZERO-WIDTH case only, and it made the far more common partial row feel
     * rare. Measured over 24 half-hour samples through this mapper, `partial` was
     * true on today's row in 22 of 24 — i.e. for ~92% of the day.
     *
     * The flag is optional on the schema precisely so this can be carried without
     * making the field mandatory. Clients render it as a "partial range" note. */
    ...(synthetic || usableTemps(slots).length < SLOTS_PER_DAY
      ? { partial: true as const }
      : {}),
    /* Real solar times, not the fixed 05:00Z/18:00Z this used to claim. Above
     * the Arctic circle these are genuinely absent for weeks at a stretch, and a
     * solar-noon substitute printed "Sunrise 12:55 / Sunset 12:55" as though
     * measured — and made the daylight arc report "0% elapsed". Absence passes
     * through, and there is only one branch, so it cannot be applied to one kind
     * of row and forgotten on the other. */
    sunrise: sun.sunrise ? sun.sunrise.toISOString() : null,
    sunset: sun.sunset ? sun.sunset.toISOString() : null,
    moonPhase: moonInfo(noon).phase,
    /* `airQuality` is absent, and that is the correct answer for every day: the
     * 5-day forecast endpoint carries none. This used to be a hardcoded
     * `{ aqi: 0, category: "good" }` in the aggregated branch only, so the page
     * rendered "AQI 0 (good)" on every future day — in Delhi, directly beside a
     * panel reporting 150 "Very unhealthy" with a health alert. The client treats
     * the field as optional and prints nothing when it is absent. */
  };
}

/* Exported for tests, like the other pure mappers here: the fabricated AQI index
 * and the six `?? 0` components were previously only reachable through a network
 * round trip, which is why a payload with no reading still reported clean air. */
export function mapAirQuality(airData: any): AirQuality | undefined {
  const item = airData?.list?.[0];
  /* undefined, NOT a fabricated `{ aqi: 0, category: "good" }`.
   *
   * `/air_pollution` is metered more tightly than the weather endpoints and the
   * fetch is wrapped in `.catch(() => null)`, so a 401 or 429 in production lands
   * here. The old fallback rendered the Air Quality panel as a confident green
   * "0 — Good" with six pollutant tiles reading 0.0, and `buildAlerts` raised no
   * air-quality alert — reporting clean air for a city that could be choking.
   * `AirQualitySchema.aqi` is `min(0)`, so 0 always validated.
   *
   * `renderAirQuality(null)` already exists on the client and prints "No air
   * quality data", and the bundle field is optional. */
  if (!item) return undefined;
  /* The six components are the payload's own measurements, so the index is
   * DERIVED from them rather than invented.
   *
   * This used to read OWM's own 1-5 index and map it onto a fixed ladder of
   * 25/50/100/150/200. OWM reports no 0-500 figure, so all five numbers were
   * fabrications -- and the client renders an EPA band bar directly beneath the
   * number, where 100 means Moderate and 150 means Unhealthy for sensitive
   * groups. Live Tirana read `aqi: 100, category: "unhealthy"`: the headline
   * number said Moderate on the bar below it while the category beside it said
   * Unhealthy. The ladder was also non-monotonic against the real EPA scale, so
   * OWM 5 -> "200 hazardous" claimed the top band from the middle of unhealthy.
   *
   * The category is now `aqiCategory(derived)` -- the SAME function the band bar
   * uses -- so the number and the band cannot disagree. */
  /* The six components were all `?? 0`, so a payload with no `components` block
   * rendered six tiles reading "0.0 µg/m³" — a fabricated measurement of each
   * pollutant at exactly zero. `renderAirQuality` already prints an em dash for a
   * null component; the producer simply never sent one. */
  const c = item.components ?? {};
  const comp = (v: unknown) => {
    const n = reading(v);
    return n == null ? null : Math.round(n * 10) / 10;
  };
  const components = {
    pm25: comp(c.pm2_5),
    pm10: comp(c.pm10),
    ozone: comp(c.o3),
    carbonMonoxide: comp(c.co),
    nitrogenDioxide: comp(c.no2),
    sulfurDioxide: comp(c.so2)
  };

  /* No reported component means no index. An absent `components` block is a
   * reason to print nothing, not a reason to report clean air — the previous
   * `?? 1` fallback did exactly that, and this path was already reached whenever
   * /air_pollution returned an item without measurements. */
  const aqi = aqiFromComponents(components);
  if (aqi == null) return undefined;

  return {
    aqi,
    category: aqiCategory(aqi),
    ...components,
    recommendation: aqiRecommendation(aqi)
  };
}

/* Exported for tests, like the other pure mappers here. Being module-private is
 * why the temp-trend gate shipped with no coverage for two review rounds:
 * deleting it left the whole suite green. */
export function buildInsights(
  current: CurrentWeather,
  hourly: HourlyForecastPoint[],
  daily: DailyForecastPoint[]
): Insight[] {
  const insights: Insight[] = [];

  /* Rain in the next 3 hours?
   *
   * `find`, not `some`, and the EVIDENCE quotes the slot that actually triggered.
   * The trigger was `hourly.slice(0, 3).some(h => pop > 50)` while the evidence
   * printed `hourly[0]` whatever it was, so the insight could announce rain and
   * cite a probability arguing against it. Live, on no code change and no
   * malformed payload, 4 of 25 sampled cities: Singapore pops 22/9/100 announced
   * "Rain likely" beside "22%"; Reykjavik 20/50/93 announced it beside "20%".
   * `buildCoreInsights` in the shared package already found the triggering slot
   * correctly, so the two producers of the same insight id disagreed.
   *
   * The threshold here is `> 50` and the shared one is `>= 55`; they are left as
   * they are because narrowing the live one would change WHEN the insight fires,
   * which is a product decision rather than a correctness fix. What was wrong was
   * the number, not the threshold. */
  const rainSlot = hourly.slice(0, 3).find((h) => h.precipitationProbability > 50);
  if (rainSlot) {
    insights.push({
      id: "rain-soon",
      priority: "high",
      category: "precipitation",
      message: "Rain likely in the next 3 hours — bring an umbrella.",
      evidence: [`Precip probability: ${rainSlot.precipitationProbability}%`],
    });
  }

  /* Wind insight.
   *
   * This used to fire on SUSTAINED speed > 14 km/h — Beaufort 3, a gentle breeze
   * at the top of the range — and told the reader to "secure loose outdoor
   * items". Global mean surface wind is 4-5 m/s, so it fired for a large share
   * of locations on most days, standing up a safety instruction for conditions
   * that do not warrant it, while the wind ALERT 60 lines above gates on a gust
   * of 45 km/h.
   *
   * Now keyed to the same measure the alert uses, with a softer tier below it,
   * and rounded before comparing so 45.04 does not become a different claim from
   * 45.00. Gusts are frequently absent from the free payload, so the sustained
   * reading is used as the fallback rather than dropping the insight entirely. */
  const gust = current.windGust;
  // `current.windSpeed` is nullable — OWM omits the whole `wind` block in calm
  // conditions. `Math.round(null)` is 0, which happened to clear neither
  // threshold below, so this was latent rather than observed; relying on that is
  // a fabrication in waiting, since the next threshold added to the chain would
  // have fired on a slot that reported nothing. No reading, no wind insight.
  const windKmh = gust ?? current.windSpeed;
  const windRounded = windKmh == null ? null : Math.round(windKmh);
  if (windRounded != null && windRounded >= 45) {
    insights.push({
      id: "strong-wind",
      priority: "medium",
      category: "wind",
      message: `Strong winds of ${windRounded} km/h — secure loose outdoor items.`,
      evidence: [gust != null ? `Wind gust: ${Math.round(gust)} km/h` : `Wind speed: ${windRounded} km/h`],
    });
  } else if (windRounded != null && windRounded >= 30) {
    insights.push({
      id: "strong-wind",
      priority: "low",
      category: "wind",
      message: `Blustery, ${windRounded} km/h. A jacket would be worth carrying.`,
      evidence: [gust != null ? `Wind gust: ${Math.round(gust)} km/h` : `Wind speed: ${windRounded} km/h`],
    });
  }

  // Temperature trend
  /* Both days must have a real range before they can be compared. `daily[0].high`
   * is the tail of today, often a single surviving 3-hour bucket and so the same
   * value as its own low; comparing against it produced "Tomorrow will be 15 C
   * warmer than today" with "Today: 14.5 C" as evidence, for a day whose real
   * high was near thirty. A trend is a claim about two numbers, and with one of
   * them unknown the honest output is no trend. */
  if (daily.length > 1 && !daily[0]?.partial && !daily[1]?.partial) {
    const todayHigh = daily[0]?.high ?? current.temperature;
    const tomorrowHigh = daily[1]?.high ?? current.temperature;
    const diff = Math.round(tomorrowHigh - todayHigh);
    if (Math.abs(diff) >= 3) {
      insights.push({
        id: "temp-trend",
        priority: "low",
        category: "temperature",
        message: `Tomorrow will be ${Math.abs(diff)}°C ${diff > 0 ? "warmer" : "cooler"} than today.`,
        evidence: [`Today: ${todayHigh}°C`, `Tomorrow: ${tomorrowHigh}°C`],
      });
    }
  }

  return insights;
}

// ─── Astronomy ────────────────────────────────────────────────────────────────

/**
 * Sunrise, sunset, twilight and moon position computed locally.
 *
 * The free tier exposes sunrise/sunset on /weather and nothing else lunar, so
 * this used to copy the sun's times into the moon fields. These are real solar
 * and phase-angle calculations instead, and handle polar day/night by falling
 * back to solar noon where a true value does not exist.
 *
 * `now` is re-anchored to the location's LOCAL solar noon before anything is
 * computed. The solar helpers bucket by the UTC day of whatever instant they are
 * handed, so passing the raw `now` made the Astronomy panel and the Details grid
 * describe the UTC day while the daily strip — which goes through `localNoon` —
 * described the local one. Whenever the two differ the page showed two different
 * days side by side: at 23:13 on Tuesday the 29th in Victoria, the Astronomy
 * section reported the 30th, two minutes of sunrise away. That window is
 * 17:00-24:00 local at UTC-7 and 00:00-12:00 at UTC+12, i.e. most of an
 * evening — and worst just after a DST change, where tomorrow's daylight length
 * differs by an hour and the "Daylight" cell is out by 60 minutes.
 */
export function buildAstronomy(
  now: Date,
  lat: number,
  lon: number,
  timezone?: string
): Astronomy {
  const anchor = timezone ? localNoon(localDateKey(now, timezone), timezone) : now;
  const sun = sunTimes(anchor, lat, lon);
  const windows = lightWindows(anchor, lat, lon);
  const moon = moonInfo(anchor);
  const times = moonTimes(anchor, lat, lon);
  /* `sun.solarNoon` is deliberately not bound to a local. It used to be, to
   * serve the three `?? solarNoon` fallbacks below; deleting those left the store
   * unread, which `tsc` cannot see because this repo has no `noUnusedLocals`. */

  /* Golden and blue hours are bands, not instants. Use the start of each band so
   * the values keep a stable, monotonic meaning within a single day. Where the
   * band genuinely does not occur, the null is passed through rather than
   * replaced — see the note on `AstronomySchema`.
   *
   * Every one of these used to fall back to `solarNoon`, which is a real instant
   * describing a DIFFERENT quantity. At 78°N the moon neither rose nor set for
   * days, so `moonrise` and `moonset` came back byte-identical at solar noon and
   * the Details grid printed "Moonrise 12:47 PM" as though it had been measured.
   * `lightWindows` already returns empty windows for an absent band; `?? solarNoon`
   * was discarding that signal. */
  const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

  return {
    sunrise: sun.sunrise ? sun.sunrise.toISOString() : null,
    sunset: sun.sunset ? sun.sunset.toISOString() : null,
    moonrise: iso(times.moonrise),
    moonset: iso(times.moonset),
    moonPhase: moon.phase,
    /* Carried from the SAME `moonInfo` call that produced the phase, which has
     * always computed it to three decimals. It was discarded here, and the client
     * then invented a per-phase constant to replace it. */
    moonIllumination: moon.illumination,
    // The client cannot distinguish polar day from polar night — both are "no
    // sunrise and no sunset" — and `sunTimes` already has the answer.
    polarDay: sun.polarDay,
    /* Not `?? blueHour*.end`. That published blue hour's CLOSING instant under
     * the label "Golden hour (am) from HH:MM" — the same cross-quantity
     * substitution the moon fields were fixed for. Reachable: Nuuk (64.2°N) on
     * 21 Dec returns a null golden-hour start and a real blue-hour start, so the
     * page showed a golden hour that does not exist. */
    goldenHourMorning: iso(windows.goldenHourMorning.start),
    goldenHourEvening: iso(windows.goldenHourEvening.start),
    blueHourMorning: iso(windows.blueHourMorning.start),
    blueHourEvening: iso(windows.blueHourEvening.start)
  };
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/**
 * Derive alerts from values already fetched.
 *
 * The free tier has no alerts endpoint, so this used to return an empty array
 * and the alerts banner was dead UI on live data. These thresholds are our own
 * inference from observed conditions, not an official advisory, so every alert
 * is marked with a `source` that says so.
 */
const DERIVED_SOURCE = "Nimbus derived advisory (not an official warning)";

export function buildAlerts(
  current: CurrentWeather,
  hourly: HourlyForecastPoint[],
  airQuality: AirQuality | undefined,
  now: Date
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const startsAt = now.toISOString();
  const endsAt = new Date(now.getTime() + 7_200_000).toISOString();

  const gust = current.windGust ?? 0;
  /* Compared rounded, not raw. The insight rounds before comparing, so at a
   * gust of 44.6 the page displayed "Strong winds of 45 km/h — secure loose
   * outdoor items" while raising no alert — the exact disagreement on the same
   * measure that the shared `windKmh` rounding was introduced to prevent. */
  if (Math.round(gust) >= 45) {
    alerts.push({
      id: "wind-gust",
      type: "wind",
      title: "Strong wind gusts",
      description: `Gusts around ${Math.round(gust)} km/h may make travel and outdoor activity difficult.`,
      // Rounded, to stay on the same scale as the thresholds above and as the
      // insight's wording. 54.6 must not display as "55 km/h" and read as
      // "moderate".
      severity: Math.round(gust) >= 70 ? "severe" : Math.round(gust) >= 55 ? "moderate" : "minor",
      startsAt,
      endsAt,
      source: DERIVED_SOURCE
    });
  }

  // Look a few hours ahead, not just at the current hour.
  const upcomingRain = hourly.slice(0, 4).find((h) => h.precipitationProbability >= 70);
  if (upcomingRain) {
    alerts.push({
      id: "heavy-rain",
      type: "flood",
      title: "Heavy rain expected",
      description: `Rain probability reaches ${upcomingRain.precipitationProbability}% in the next few hours.`,
      severity: upcomingRain.precipitationProbability >= 90 ? "severe" : "moderate",
      startsAt,
      endsAt,
      source: DERIVED_SOURCE
    });
  }

  /* Guarded, because `airQuality` is now optional: `/air_pollution` can fail
   * independently of the weather endpoints, and there is no reading to alert on
   * in that case. Raising an alert here would mean inventing the data. */
  if (
    airQuality &&
    (airQuality.category === "unhealthy"
      || airQuality.category === "very_unhealthy"
      || airQuality.category === "hazardous")
  ) {
    const severe = airQuality.category === "hazardous";
    alerts.push({
      id: "air-quality",
      type: "air_quality",
      title: severe ? "Hazardous air quality" : "Poor air quality",
      description: airQuality.recommendation || "Air quality is poor; sensitive groups should limit outdoor exertion.",
      severity: severe ? "extreme" : "moderate",
      startsAt,
      endsAt,
      source: DERIVED_SOURCE
    });
  }

  if (current.condition === "thunderstorm") {
    alerts.push({
      id: "thunderstorm",
      type: "storm",
      title: "Thunderstorm conditions",
      description: "Thunderstorms reported at this location. Seek shelter if lightning is nearby.",
      severity: "severe",
      startsAt,
      endsAt,
      source: DERIVED_SOURCE
    });
  }

  return alerts;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Turn OpenWeatherMap's UTC offset (in seconds) into a timeZone string.
 *
 * Re-exported from dateKey.ts, which owns the timezone plumbing and is also
 * used by the geocoding path in locations.service.ts.
 */
import { localDateKey, localNoon, offsetTimeZone } from "./dateKey.js";

export async function fetchOpenWeatherBundle(
  lat: number,
  lon: number
): Promise<WeatherBundle> {
  const key = env.WEATHER_PROVIDER_API_KEY;
  if (!key) throw new Error("WEATHER_PROVIDER_API_KEY is not set");

  const base = (env.WEATHER_PROVIDER_BASE_URL ?? "https://api.openweathermap.org/data/2.5").replace(/\/$/, "");
  const qs = `lat=${lat}&lon=${lon}&units=metric&appid=${encodeURIComponent(key)}`;

  // Parallel fetch — current + forecast + air quality
  const [owCurrent, owForecast, owAir] = await Promise.all([
    fetchJson(`${base}/weather?${qs}`),
    fetchJson(`${base}/forecast?${qs}`),
    fetchJson(`${base}/air_pollution?${qs}`).catch(() => null),
  ]);

  // Build location from OWM city response
  //
  // `region` is left unset. `/weather` has no region field, only `sys.country`,
  // so it used to be filled with the same ISO code and the hero rendered
  // "Victoria, CA, CA" — and for Delhi, "IN, IN". `LocationResultSchema.region`
  // is optional, so omitting it is the honest shape. The geocoding endpoint
  // does carry a real `state`, and the search results already use it, so the
  // hero now reads no worse than the dropdown the city was picked from.
  const location: LocationResult = {
    // `??` is not enough for either of these. OpenWeatherMap returns
    // `name: ""` and `id: 0` for coordinates it has no city for (open ocean,
    // some territorial waters): `"" ?? fallback` is still `""`, and `0 ?? …` is
    // still 0. The blank name rendered an empty <h1>, and because every unmapped
    // coordinate produced the same `owm-0` id, two different unknown locations
    // collided on `source_id` and the saved-locations upsert silently overwrote
    // one with the other. Fall back to the coordinates, which are unique.
    id: `owm-${owCurrent.id || `${lat.toFixed(3)},${lon.toFixed(3)}`}`,
    name: owCurrent.name?.trim() || "Unknown location",
    country: owCurrent.sys?.country ?? "",
    coordinates: { lat, lon },
    timezone: offsetTimeZone(owCurrent.timezone),
    isFavorite: false,
  };

  const now = new Date();
  const current  = mapCurrent(owCurrent);
  const hourly   = mapHourlyFromForecast(owForecast.list ?? []);
  const daily    = mapDailyFromForecast(owForecast.list ?? [], lat, lon, location.timezone, current, now, {
    min: reading(owCurrent.main?.temp_min),
    max: reading(owCurrent.main?.temp_max)
  });
  const airQuality = mapAirQuality(owAir);
  const insights = buildInsights(current, hourly, daily);

  const bundle: WeatherBundle = {
    location,
    current,
    hourly,
    daily,
    airQuality,
    astronomy: buildAstronomy(now, lat, lon, location.timezone),
    alerts: buildAlerts(current, hourly, airQuality, now),
    insights,
    mapLayers: mapLayers(),
    source: "openweathermap",
    generatedAt: now.toISOString(),
  };

  return bundle;
}

export default fetchOpenWeatherBundle;

import { z } from "zod";

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
});

export const UnitsSchema = z.enum(["metric", "imperial"]);
export type Units = z.infer<typeof UnitsSchema>;

export const ThemePreferenceSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const WeatherConditionSchema = z.enum([
  "clear",
  "partly_cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "thunderstorm",
  "snow",
  "sleet",
  "wind",
  "extreme"
]);
export type WeatherCondition = z.infer<typeof WeatherConditionSchema>;

export const MoonPhaseSchema = z.enum([
  "new",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent"
]);
export type MoonPhase = z.infer<typeof MoonPhaseSchema>;

export const AirQualitySchema = z.object({
  aqi: z.number().int().min(0).max(500),
  category: z.enum(["good", "moderate", "unhealthy_sensitive", "unhealthy", "very_unhealthy", "hazardous"]),
  /* All six were `?? 0` in the mapper, so a payload with no `components` block
   * rendered six tiles reading "0.0 µg/m³" — every pollutant measured at exactly
   * zero. `/air_pollution` does return them, but a partial block is possible and
   * the client already handles a null component. */
  pm25: z.number().nonnegative().nullable(),
  pm10: z.number().nonnegative().nullable(),
  ozone: z.number().nonnegative().nullable(),
  carbonMonoxide: z.number().nonnegative().nullable(),
  nitrogenDioxide: z.number().nonnegative().nullable(),
  sulfurDioxide: z.number().nonnegative().nullable(),
  recommendation: z.string()
});
export type AirQuality = z.infer<typeof AirQualitySchema>;

export const CurrentWeatherSchema = z.object({
  observedAt: z.string().datetime(),
  temperature: z.number(),
  feelsLike: z.number(),
  condition: WeatherConditionSchema,
  conditionText: z.string(),
  humidity: z.number().min(0).max(100),
  /* Both were `?? 0` and `?? 10000` in the mapper. A pressure of 0 could not
   * satisfy this `.positive()`, so a single absent reading made the whole bundle
   * contract-invalid with nothing to catch it; visibility 10000 renders as
   * "10 km", the most reassuring value the field can take, from no measurement
   * at all. */
  pressure: z.number().positive().nullable(),
  visibility: z.number().nonnegative().nullable(),
  /* OpenWeatherMap's free `/weather` payload carries no UV reading and usually no
   * wind gust, and `/forecast` carries neither. These used to be hardcoded 0,
   * which the page rendered as "UV index 0 — Low" in reassuring green and
   * "Wind gust 0 km/h": a fabricated measurement wearing a health rating. Null
   * means "not reported", which the UI shows as an em dash. */
  uvIndex: z.number().min(0).max(15).nullable(),
  /* Not in the free `/weather` payload either — see the uvIndex note. This was a
   * hardcoded 0, and the mobile client printed it as "Dew point 0 C". The web
   * app only escaped it via a truthiness test, which would also have hidden a
   * genuine dew point of exactly 0 °C. */
  dewPoint: z.number().nullable(),
  /* Nullable for the same reason as `windDirection` below: OWM omits the whole
   * `wind` block in calm conditions, and `(data.wind?.speed ?? 0) * 3.6` read
   * that absence as 0 km/h — a measured "calm" asserted from no measurement.
   * A real 0 km/h is a genuine reading (a dead calm
   * is real weather) and still renders as 0.
   *
   * This comment used to add: "This is the one remaining `?? 0` in either mapper,
   * and it was the last fabricated zero on the page." That was false, and it was
   * exactly why the last three survived -- a comment certifying completion is what
   * stops the next sweep. `mapCurrent` and `mapHourlyFromForecast` were still
   * emitting `?? 0` for temperature, feelsLike and humidity, so the hero rendered
   * "0 °C" and "Humidity 0 %" for a payload with no `main` block. Those now refuse
   * rather than invent, like the daily range already did. What genuinely remains
   * is `precipitationMm` and `precipitationProbability`, and NEITHER is a
   * fabrication: OpenWeatherMap omits the `rain`/`snow` blocks entirely when there
   * is none, so 0 mm is the correct physical reading, and 0 is the identity element
   * for a maximum over probabilities in [0,100] and cannot suppress a real one. */
  windSpeed: z.number().nonnegative().nullable(),
  /* Nullable, for the same reason as `cloudCoverage` below: OWM omits the whole
   * `wind` block in calm conditions, so `?? 0` produced a compass bearing from no
   * measurement — and `windDir(0)` renders as "N", i.e. calm or variable wind
   * reported as due north. A real 0 is still valid and still renders. */
  windDirection: z.number().min(0).max(360).nullable(),
  windGust: z.number().nonnegative().nullable(),
  /* `?? 0` claimed a cloudless sky from no measurement. A real 0 is valid and
   * still renders as 0 %; only absence becomes null. */
  cloudCoverage: z.number().min(0).max(100).nullable()
});
export type CurrentWeather = z.infer<typeof CurrentWeatherSchema>;

export const HourlyForecastPointSchema = z.object({
  time: z.string().datetime(),
  temperature: z.number(),
  feelsLike: z.number(),
  condition: WeatherConditionSchema,
  precipitationProbability: z.number().min(0).max(100),
  precipitationMm: z.number().nonnegative(),
  /* Both wind fields are nullable here for the same reason as on
   * `CurrentWeatherSchema`: the hourly mapper was doing `h.wind?.speed ?? 0` and
   * `h.wind?.deg ?? 0`, so a slot with no `wind` block reported 0 km/h from the
   * north. `windDirection` being non-nullable while `CurrentWeatherSchema`'s is
   * nullable also made the web client's guard for it dead code — a null check
   * that could never fire, under a comment asserting the field was nullable.
   * A comment that describes a guard the schema makes unreachable is worse than
   * no guard, because it reads as though the case is handled. */
  windSpeed: z.number().nonnegative().nullable(),
  windDirection: z.number().min(0).max(360).nullable(),
  /* Not present in the 2.5 /forecast payload — see CurrentWeatherSchema. */
  uvIndex: z.number().min(0).max(15).nullable()
});
export type HourlyForecastPoint = z.infer<typeof HourlyForecastPointSchema>;

export const DailyForecastPointSchema = z.object({
  date: z.string(),
  high: z.number(),
  low: z.number(),
  condition: WeatherConditionSchema,
  /* Nullable ONLY for the synthesised "rest of today" row, emitted when the
   * provider's list has already rolled past local midnight and so contains no
   * slot for the remaining hours. That figure is unknowable, and this field was
   * forced non-nullable so the row had to invent one — first a literal 0, which
   * denied rain that was visibly falling, then 80, which has no more basis than
   * the 0 did. Every other row is aggregated from real slots carrying a real
   * `pop`, so the number is always meaningful when present. */
  precipitationProbability: z.number().min(0).max(100).nullable(),
  /* True only for the synthesised "rest of today" row, whose high/low are a
   * 3-hour window's lower bound rather than a real daily range. Present so the
   * clients can say so — a row that looks identical to a genuine one is a
   * confidence problem, and it only happens for the one day that already
   * happened. Optional, so `false` is never sent. */
  partial: z.boolean().optional(),
  /* Nullable: above the Arctic circle the sun does not rise or set for weeks or
   * months. Substituting solar noon printed "Sunrise 12:55 / Sunset 12:55" as a
   * measurement and made the daylight arc read "0% elapsed". */
  sunrise: z.string().datetime().nullable(),
  sunset: z.string().datetime().nullable(),
  moonPhase: MoonPhaseSchema,
  /* The 5-day forecast endpoint carries no air-quality data at all. This used to
   * be hardcoded to `{ aqi: 0, category: "good" }`, so every day in the strip
   * read "AQI 0 (good)" — in Delhi, directly beside a panel reporting 150
   * "Very unhealthy" with a health alert. Optional for the same reason. */
  airQuality: AirQualitySchema.optional()
});
export type DailyForecastPoint = z.infer<typeof DailyForecastPointSchema>;

/* All nine of these can be genuinely absent, and absent must be representable.
 *
 * The moon frequently neither rises nor sets on a given day, a twilight band can
 * be absent at high latitude, and above the Arctic circle the sun does not rise
 * or set at all for weeks or months at a time. Longyearbyen is in polar night
 * roughly 26 Oct - 16 Feb and polar day roughly 20 Apr - 23 Aug, so "Sunrise
 * 12:55 / Sunset 12:55" — solar noon, under the label "Sunrise" — is its normal
 * winter state, not an edge case. Tromso, Kiruna, Murmansk, Nuuk and Utqiagvik
 * are the same.
 *
 * A substitution for a missing event is a different quantity wearing the right
 * label. An earlier version of this comment claimed sunrise and sunset were
 * "genuinely always computable... a real instant, not a fiction" and left them
 * non-nullable. That is the identical reasoning that was wrong for the moon
 * fields, and it also suppressed the daylight arc: `set - rise` is 0, so the
 * page reported "0% of daylight elapsed" during a polar night. */
export const AstronomySchema = z.object({
  sunrise: z.string().datetime().nullable(),
  sunset: z.string().datetime().nullable(),
  moonrise: z.string().datetime().nullable(),
  moonset: z.string().datetime().nullable(),
  moonPhase: MoonPhaseSchema,
  /* Fraction of the lunar disc that is lit, 0 to 1.
   *
   * This field exists because `moonInfo()` has always computed it to three
   * decimals and every caller discarded it, keeping only `.phase`. With nothing
   * on the contract, the web client reconstructed 0/25/50/75/100 from the phase
   * enum and printed THAT under the label "Moon illumination" — measured over a
   * synodic month, mean error 7.9 points and maximum 21 (a real 96% rendered as
   * 75%). The bucket boundaries are not quarter-phase boundaries, so those
   * constants are not even correct for a representative of their own bucket:
   * `first_quarter`'s bucket starts at a true 69% and `full`'s at 96%.
   *
   * Required, not optional: both providers compute it from the same `moonInfo`
   * call that already produces `moonPhase`, so absence would mean a new bug. */
  moonIllumination: z.number().min(0).max(1),
  /* True only in polar DAY. With a null `sunrise` it separates the two polar
   * states, which the client cannot work out for itself: both present as "no
   * sunrise and no sunset", and only the sun's altitude tells them apart. The
   * backend already computes it inside `sunTimes`. */
  polarDay: z.boolean(),
  goldenHourMorning: z.string().datetime().nullable(),
  goldenHourEvening: z.string().datetime().nullable(),
  blueHourMorning: z.string().datetime().nullable(),
  blueHourEvening: z.string().datetime().nullable()
});
export type Astronomy = z.infer<typeof AstronomySchema>;

export const AlertSeveritySchema = z.enum(["minor", "moderate", "severe", "extreme"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const WeatherAlertSchema = z.object({
  id: z.string(),
  type: z.enum(["storm", "flood", "heat", "wind", "snow", "air_quality"]),
  title: z.string(),
  description: z.string(),
  severity: AlertSeveritySchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  source: z.string()
});
export type WeatherAlert = z.infer<typeof WeatherAlertSchema>;

export const InsightSchema = z.object({
  id: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  category: z.enum(["precipitation", "temperature", "uv", "wind", "air_quality", "travel"]),
  message: z.string(),
  evidence: z.array(z.string())
});
export type Insight = z.infer<typeof InsightSchema>;

export const MapLayerSchema = z.object({
  id: z.enum(["radar", "precipitation", "clouds", "temperature", "wind", "pressure", "satellite"]),
  name: z.string(),
  opacity: z.number().min(0).max(1),
  tileUrlTemplate: z.string(),
  refreshSeconds: z.number().positive()
});
export type MapLayer = z.infer<typeof MapLayerSchema>;

export const LocationResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string().optional(),
  country: z.string(),
  coordinates: CoordinatesSchema,
  timezone: z.string(),
  isFavorite: z.boolean().default(false)
});
export type LocationResult = z.infer<typeof LocationResultSchema>;

/**
 * Which provider produced a bundle.
 *
 * The service falls back to the deterministic sample provider whenever the
 * live provider throws, so consumers need a way to tell the two apart.
 */
export const WeatherSourceSchema = z.enum(["openweathermap", "sample"]);
export type WeatherSource = z.infer<typeof WeatherSourceSchema>;

export const WeatherBundleSchema = z.object({
  location: LocationResultSchema,
  current: CurrentWeatherSchema,
  // Upper bounds, not exact lengths. The sample provider returns 48 hourly and
  // 14 daily points; the OpenWeatherMap free tier returns 16 and 7.
  hourly: z.array(HourlyForecastPointSchema).max(48),
  daily: z.array(DailyForecastPointSchema).max(14),
  /* Optional: `/air_pollution` is metered separately from the weather endpoints
   * and fails independently, and the failure path used to fabricate
   * `{ aqi: 0, category: "good" }`. Absence is represented, not invented. */
  airQuality: AirQualitySchema.optional(),
  astronomy: AstronomySchema,
  alerts: z.array(WeatherAlertSchema),
  insights: z.array(InsightSchema),
  mapLayers: z.array(MapLayerSchema),
  source: WeatherSourceSchema.optional(),
  generatedAt: z.string().datetime()
});
export type WeatherBundle = z.infer<typeof WeatherBundleSchema>;

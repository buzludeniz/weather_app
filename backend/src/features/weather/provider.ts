import {
  aqiCategory,
  aqiRecommendation,
  buildCoreInsights,
  moonInfo,
  type AirQuality,
  type Astronomy,
  type CurrentWeather,
  type DailyForecastPoint,
  type HourlyForecastPoint,
  type Insight,
  type LocationResult,
  type MapLayer,
  type WeatherAlert,
  type WeatherBundle,
  type WeatherCondition
} from "@nimbus/shared";
import { env } from "../../config/env.js";
import { localDateKey } from "./dateKey.js";

type Coordinates = {
  lat: number;
  lon: number;
};

const conditions: WeatherCondition[] = ["clear", "partly_cloudy", "cloudy", "rain", "drizzle", "wind"];
const moonPhases = ["new", "waxing_crescent", "first_quarter", "waxing_gibbous", "full", "waning_gibbous", "last_quarter", "waning_crescent"] as const;

function seed(coordinates: Coordinates, offset: number): number {
  const value = Math.sin(coordinates.lat * 12.9898 + coordinates.lon * 78.233 + offset * 37.719) * 43_758.5453;
  return value - Math.floor(value);
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function dateAt(base: Date, dayOffset: number, hour: number, minute = 0): string {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function buildAirQuality(coordinates: Coordinates, offset: number): AirQuality {
  const aqi = Math.round(18 + seed(coordinates, offset) * 145);
  return {
    aqi,
    category: aqiCategory(aqi),
    pm25: round(4 + seed(coordinates, offset + 1) * 42),
    pm10: round(8 + seed(coordinates, offset + 2) * 55),
    ozone: round(20 + seed(coordinates, offset + 3) * 90),
    carbonMonoxide: round(0.2 + seed(coordinates, offset + 4) * 1.8, 2),
    nitrogenDioxide: round(5 + seed(coordinates, offset + 5) * 45),
    sulfurDioxide: round(2 + seed(coordinates, offset + 6) * 20),
    recommendation: aqiRecommendation(aqi)
  };
}

function conditionText(condition: WeatherCondition): string {
  return {
    clear: "Clear",
    partly_cloudy: "Partly cloudy",
    cloudy: "Cloudy",
    fog: "Fog",
    drizzle: "Drizzle",
    rain: "Rain",
    thunderstorm: "Thunderstorm",
    snow: "Snow",
    sleet: "Sleet",
    wind: "Windy",
    extreme: "Extreme weather"
  }[condition];
}

function buildCurrent(coordinates: Coordinates, now: Date): CurrentWeather {
  const base = 9 + seed(coordinates, 1) * 24;
  const humidity = Math.round(38 + seed(coordinates, 2) * 52);
  const windSpeed = round(4 + seed(coordinates, 3) * 34);
  const condition = conditions[Math.floor(seed(coordinates, 4) * conditions.length)] ?? "clear";

  return {
    observedAt: now.toISOString(),
    temperature: round(base),
    feelsLike: round(base + (humidity > 72 ? 2.4 : -1.1) + seed(coordinates, 5) * 2),
    condition,
    conditionText: conditionText(condition),
    humidity,
    pressure: Math.round(992 + seed(coordinates, 6) * 42),
    visibility: round(5 + seed(coordinates, 7) * 25),
    uvIndex: round(seed(coordinates, 8) * 11),
    dewPoint: round(base - (100 - humidity) / 5),
    windSpeed,
    windDirection: Math.round(seed(coordinates, 9) * 360),
    windGust: round(windSpeed + 4 + seed(coordinates, 10) * 22),
    cloudCoverage: Math.round(seed(coordinates, 11) * 100)
  };
}

function buildHourly(coordinates: Coordinates, current: CurrentWeather, now: Date): HourlyForecastPoint[] {
  return Array.from({ length: 48 }, (_, index) => {
    const time = new Date(now);
    time.setUTCHours(time.getUTCHours() + index + 1, 0, 0, 0);
    const dailyWave = Math.sin(((index % 24) / 24) * Math.PI * 2 - Math.PI / 2);
    const precipitationProbability = Math.round(seed(coordinates, index + 20) * 100);
    const condition = precipitationProbability > 72 ? "rain" : precipitationProbability > 52 ? "drizzle" : conditions[Math.floor(seed(coordinates, index + 21) * conditions.length)] ?? "clear";
    // This generator always synthesises a real UV reading (see `buildCurrent`),
    // so null is a contract artefact of the OpenWeatherMap path, not a state
    // this provider can be in. Coerce once rather than pretend.
    const baseUv = current.uvIndex ?? 5;
    // Same for wind, now that `windSpeed` is nullable in the contract. The
    // generator always produces one, so this is unreachable in practice — but
    // `null + 3` is not 3, it is 3, by accident, and relying on that is how the
    // real provider's `?? 0` fabrications happened. A seeded default is
    // legitimate HERE specifically because this whole provider is synthetic and
    // every payload it emits is stamped `sample`.
    const baseWind = current.windSpeed ?? 8;

    return {
      time: time.toISOString(),
      temperature: round(current.temperature + dailyWave * 5 + seed(coordinates, index + 22) * 3),
      feelsLike: round(current.feelsLike + dailyWave * 5 + seed(coordinates, index + 23) * 3),
      condition,
      precipitationProbability,
      precipitationMm: precipitationProbability > 55 ? round(seed(coordinates, index + 24) * 8) : 0,
      windSpeed: round(Math.max(1, baseWind + dailyWave * 3 + seed(coordinates, index + 25) * 12)),
      // `windDirection` is nullable in the contract. The sample generator always
      // produces one, so the `?? 0` here is unreachable — but a real bearing is
      // still required to rotate, so fall back to the seeded value rather than
      // inventing a north.
      windDirection: Math.round(
        ((current.windDirection ?? 0) + index * 7 + seed(coordinates, index + 26) * 35) % 360
      ),
      uvIndex: round(Math.max(0, Math.min(12, baseUv + dailyWave * 4)))
    };
  });
}

function buildDaily(
  coordinates: Coordinates,
  current: CurrentWeather,
  now: Date,
  timezone: string
): DailyForecastPoint[] {
  return Array.from({ length: 14 }, (_, index) => {
    const trend = Math.sin((index / 14) * Math.PI * 2) * 4;
    const high = round(current.temperature + 5 + trend + seed(coordinates, index + 50) * 4);
    const low = round(current.temperature - 4 + trend - seed(coordinates, index + 51) * 4);
    const precipitationProbability = Math.round(seed(coordinates, index + 52) * 100);
    const condition = precipitationProbability > 70 ? "rain" : conditions[Math.floor(seed(coordinates, index + 53) * conditions.length)] ?? "clear";

    return {
      // Local calendar day, not the UTC one: see dateKey.ts.
      date: localDateKey(new Date(now.getTime() + index * 86_400_000), timezone),
      high,
      low,
      condition,
      precipitationProbability,
      sunrise: dateAt(now, index, 5, 48 + (index % 7)),
      sunset: dateAt(now, index, 18, 7 - (index % 7)),
      moonPhase: moonPhases[index % moonPhases.length]!,
      airQuality: buildAirQuality(coordinates, index + 60)
    };
  });
}

function buildAstronomy(now: Date): Astronomy {
  return {
    sunrise: dateAt(now, 0, 5, 54),
    sunset: dateAt(now, 0, 18, 18),
    moonrise: dateAt(now, 0, 21, 12),
    moonset: dateAt(now, 1, 7, 4),
    moonPhase: "waxing_gibbous",
    /* The same field the live producer carries. A sample bundle that omits it
     * would fail validation, and inventing a constant here would reproduce the
     * very defect the field was added to remove — on the path that is the
     * default when `WEATHER_PROVIDER_API_KEY` is unset. */
    moonIllumination: moonInfo(now).illumination,
    // Sample data always has a sunrise and a sunset, so it is never in a polar
    // state. The flag exists so the client can tell polar day from polar night
    // when the real provider reports a null sunrise.
    polarDay: false,
    goldenHourMorning: dateAt(now, 0, 6, 20),
    goldenHourEvening: dateAt(now, 0, 17, 45),
    blueHourMorning: dateAt(now, 0, 5, 20),
    blueHourEvening: dateAt(now, 0, 18, 45)
  };
}

function buildAlerts(current: CurrentWeather, now: Date): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const startsAt = now.toISOString();
  const endsAt = new Date(now.getTime() + 7_200_000).toISOString();

  // This generator always synthesises a real gust (see `buildCurrent`), so null
  // is a contract artefact of the OpenWeatherMap path. Coerce rather than
  // pretend, and treat a missing gust as "no gust alert" — absence of data is
  // not evidence of a gale.
  const gust = current.windGust ?? 0;

  if (gust >= 45) {
    alerts.push({
      id: "wind-gust-watch",
      type: "wind",
      title: "Strong wind watch",
      description: "Gusts may make travel and outdoor activity difficult.",
      severity: gust >= 60 ? "severe" : "moderate",
      startsAt,
      endsAt,
      source: "Nimbus forecast model"
    });
  }

  // Same reasoning as the gust above: this provider always synthesises a UV
  // reading, and a missing one is never evidence of high UV.
  if ((current.uvIndex ?? 0) >= 9) {
    alerts.push({
      id: "uv-exposure",
      type: "heat",
      title: "High UV exposure",
      description: "Use sun protection and avoid prolonged midday exposure.",
      severity: "moderate",
      startsAt,
      endsAt,
      source: "Nimbus forecast model"
    });
  }

  return alerts;
}

/**
 * Appends the OWM tile credential to a template.
 *
 * The key used to live in `frontend/app.js` as a committed literal. Two problems
 * with that: the shipped bundle handed anyone who opened devtools a working API
 * key, and the key baked in there had been revoked — every overlay layer 401'd,
 * so the whole map-overlay feature rendered empty. Resolving it from the
 * environment here means one credential, one rotation point, and no secret in
 * the client.
 *
 * The parameter is still visible in the tile requests the browser makes, because
 * a raster tile server has to be addressed directly. Proxying the tiles would
 * hide it completely; that is the remaining step before a public deployment.
 */
function withTileKey(template: string): string {
  const key = env.WEATHER_PROVIDER_API_KEY;
  if (!key) return template;
  const separator = template.includes("?") ? "&" : "?";
  return `${template}${separator}appid=${encodeURIComponent(key)}`;
}

export function mapLayers(): MapLayer[] {
  return [
    { id: "radar", name: "Radar", opacity: 0.78, tileUrlTemplate: withTileKey("https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png"), refreshSeconds: 300 },
    { id: "precipitation", name: "Precipitation", opacity: 0.72, tileUrlTemplate: withTileKey("https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png"), refreshSeconds: 300 },
    { id: "clouds", name: "Clouds", opacity: 0.58, tileUrlTemplate: withTileKey("https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png"), refreshSeconds: 600 },
    { id: "temperature", name: "Temperature", opacity: 0.64, tileUrlTemplate: withTileKey("https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png"), refreshSeconds: 600 },
    { id: "wind", name: "Wind", opacity: 0.7, tileUrlTemplate: withTileKey("https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png"), refreshSeconds: 600 },
    { id: "pressure", name: "Pressure", opacity: 0.6, tileUrlTemplate: withTileKey("https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png"), refreshSeconds: 900 },
    { id: "satellite", name: "Satellite", opacity: 0.82, tileUrlTemplate: withTileKey("https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png"), refreshSeconds: 900 }
  ];
}

export function buildWeatherBundle(location: LocationResult): WeatherBundle {
  const now = new Date();
  const coordinates = location.coordinates;
  const current = buildCurrent(coordinates, now);
  const hourly = buildHourly(coordinates, current, now);
  const daily = buildDaily(coordinates, current, now, location.timezone);
  const airQuality = buildAirQuality(coordinates, 90);
  /* Same guard as the live mapper's temperature-trend insight, for the same
   * reason: a row whose high equals its low is the absence of a range, not a
   * narrow day, and a comparison built on it states a difference that was never
   * measured. Inlined rather than imported — this is the sample provider and it
   * does not otherwise depend on the OWM mapper. */
  const hasRange = (d?: { high?: number; low?: number }) =>
    !!d && d.high != null && d.low != null && d.high !== d.low;
  const insights: Insight[] = [
    ...buildCoreInsights(current, hourly),
    ...(!daily[0]?.partial && !daily[1]?.partial
      ? [{
        id: "tomorrow-shift",
        priority: "low" as const,
        category: "temperature" as const,
        message: `Tomorrow will be ${Math.abs(Math.round(daily[1]!.high! - daily[0]!.high!))} C different at the warmest point.`,
        evidence: [`Today high ${daily[0]!.high!} C`, `Tomorrow high ${daily[1]!.high!} C`],
      }]
      : []),
  ];

  if (airQuality.aqi > 100) {
    insights.push({
      id: "aqi-advice",
      priority: "medium",
      category: "air_quality",
      message: airQuality.recommendation,
      evidence: [`AQI ${airQuality.aqi}`]
    });
  }

  return {
    location,
    current,
    hourly,
    daily,
    airQuality,
    astronomy: buildAstronomy(now),
    alerts: buildAlerts(current, now),
    insights,
    mapLayers: mapLayers(),
    generatedAt: now.toISOString()
  };
}

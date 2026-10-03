import type { MapLayer, WeatherBundle } from "@nimbus/shared";
import { getCachedJson } from "../../services/redis.js";
import { reverseLookup } from "../locations/locations.service.js";
import { buildWeatherBundle, mapLayers } from "./provider.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { fetchOpenWeatherBundle } from "./openWeather.js";

export async function getWeatherBundle(lat: number, lon: number): Promise<WeatherBundle> {
  const cacheKey = `weather:v1:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  return getCachedJson(cacheKey, 300, async () => {
    if (env.WEATHER_PROVIDER_API_KEY) {
      try {
        return await fetchOpenWeatherBundle(lat, lon);
      } catch (err) {
        // Fall back to the deterministic sample provider so a provider outage
        // still renders a dashboard, but log the cause and tag the bundle so
        // the client can show that it is not live data.
        logger.warn(
          { err, lat, lon },
          "OpenWeatherMap provider failed; falling back to sample data"
        );
        return { ...buildWeatherBundle(reverseLookup(lat, lon)), source: "sample" as const };
      }
    }
    return { ...buildWeatherBundle(reverseLookup(lat, lon)), source: "sample" as const };
  });
}

export async function getMapLayers(): Promise<MapLayer[]> {
  return getCachedJson("weather:maps:layers:v1", 900, async () => mapLayers());
}

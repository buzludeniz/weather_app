import type { LocationResult } from "@nimbus/shared";
import { offsetTimeZone } from "../weather/dateKey.js";
import { env } from "../../config/env.js";

const locations: LocationResult[] = [
  {
    id: "tirana-al",
    name: "Tirana",
    region: "Tirana County",
    country: "Albania",
    coordinates: { lat: 41.3275, lon: 19.8189 },
    timezone: "Europe/Tirane",
    isFavorite: true
  },
  {
    id: "new-york-us",
    name: "New York",
    region: "New York",
    country: "United States",
    coordinates: { lat: 40.7128, lon: -74.006 },
    timezone: "America/New_York",
    isFavorite: false
  },
  {
    id: "london-gb",
    name: "London",
    region: "England",
    country: "United Kingdom",
    coordinates: { lat: 51.5072, lon: -0.1276 },
    timezone: "Europe/London",
    isFavorite: false
  },
  {
    id: "tokyo-jp",
    name: "Tokyo",
    region: "Tokyo",
    country: "Japan",
    coordinates: { lat: 35.6762, lon: 139.6503 },
    timezone: "Asia/Tokyo",
    isFavorite: false
  },
  {
    id: "sydney-au",
    name: "Sydney",
    region: "New South Wales",
    country: "Australia",
    coordinates: { lat: -33.8688, lon: 151.2093 },
    timezone: "Australia/Sydney",
    isFavorite: false
  }
];

export function reverseLookup(lat: number, lon: number): LocationResult {
  const nearest = locations
    .map((location) => ({
      location,
      distance: Math.hypot(location.coordinates.lat - lat, location.coordinates.lon - lon)
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.location;

  return nearest ?? {
    id: `gps-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    name: "Current location",
    country: "Local",
    coordinates: { lat, lon },
    timezone: "UTC",
    isFavorite: false
  };
}

export async function searchLocations(query: string): Promise<LocationResult[]> {
  const normalized = query.trim();
  if (!normalized) return locations.slice(0, 5);

  const apiKey = env.WEATHER_PROVIDER_API_KEY;
  if (!apiKey) {
    return locations.filter((location) => {
      const haystack = `${location.name} ${location.region ?? ""} ${location.country}`.toLowerCase();
      return haystack.includes(normalized.toLowerCase());
    });
  }

  try {
    const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(normalized)}&limit=10&appid=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OpenWeather Geocoding API returned ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((item: any) => ({
      id: `owm-geo-${item.lat.toFixed(4)}-${item.lon.toFixed(4)}`,
      name: item.name,
      region: item.state || "",
      country: item.country,
      coordinates: { lat: item.lat, lon: item.lon },
      // The geocoding payload carries the same `timezone` offset (in seconds)
      // as /weather does. Reporting "UTC" here made every searched city render
      // its sun and moon times in UTC, because "UTC" is a valid zone name and
      // so passed the client's own validation.
      timezone: offsetTimeZone(item.timezone),
      isFavorite: false
    }));
  } catch (error) {
    console.error("Error searching locations via OpenWeather Geocoding API:", error);
    return locations.filter((location) => {
      const haystack = `${location.name} ${location.region ?? ""} ${location.country}`.toLowerCase();
      return haystack.includes(normalized.toLowerCase());
    });
  }
}

export function featuredLocations(): LocationResult[] {
  return locations;
}


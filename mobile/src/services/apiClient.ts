/**
 * Nimbus — Mobile API Client
 *
 * Thin typed wrapper around the Nimbus Express API.
 * Base URL is read from Expo's extra config (app.config.ts → extra.apiUrl)
 * and falls back to the local development server.
 */

import Constants from "expo-constants";
import type { LocationResult, WeatherBundle } from "@nimbus/shared";

const configuredUrl = Constants.expoConfig?.extra?.apiUrl;
export const API_BASE_URL: string =
  typeof configuredUrl === "string" ? configuredUrl : "http://localhost:4000/v1";

// ─── Core fetch helper ────────────────────────────────────────────────────────

type ApiEnvelope<T> = { data: T; generatedAt?: string };

export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `Nimbus API error ${response.status} (${path}): ${response.statusText}`
    );
  }

  const body = (await response.json()) as ApiEnvelope<T>;
  return body.data;
}

async function apiSend<T>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  payload?: unknown
): Promise<T> {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      ...(payload === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `Nimbus API error ${response.status} (${path}): ${response.statusText}`
    );
  }

  const body = (await response.json()) as ApiEnvelope<T>;
  return body.data;
}

export function apiPost<T>(path: string, payload?: unknown): Promise<T> {
  return apiSend<T>("POST", path, payload);
}

export function apiPut<T>(path: string, payload?: unknown): Promise<T> {
  return apiSend<T>("PUT", path, payload);
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/**
 * Fetch the full weather bundle for a given coordinate pair.
 * Result includes current, hourly (16 slots), daily (7 days), airQuality,
 * astronomy, alerts, insights, and mapLayers.
 *
 * Data is cached by the backend for 5 minutes (Redis / in-memory fallback).
 */
export async function getWeatherBundle(
  lat: number,
  lon: number
): Promise<WeatherBundle> {
  return apiGet<WeatherBundle>("weather/bundle", { lat, lon });
}

/**
 * Search locations by name. Returns up to 10 matches from the backend
 * location registry (extended via OpenWeather Geocoding API in future).
 */
export async function searchLocations(query: string): Promise<LocationResult[]> {
  return apiGet<LocationResult[]>("locations/search", { q: query });
}

/**
 * Fetch the list of featured / preset locations.
 */
export async function getFeaturedLocations(): Promise<LocationResult[]> {
  return apiGet<LocationResult[]>("locations");
}

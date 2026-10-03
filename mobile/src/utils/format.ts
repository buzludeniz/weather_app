import type { Units, WeatherCondition } from "@nimbus/shared";
import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";

export function formatTemperature(value: number, units: Units): string {
  const converted = units === "imperial" ? value * 1.8 + 32 : value;
  const suffix = units === "imperial" ? "F" : "C";
  return `${Math.round(converted)} ${suffix}`;
}

export function formatSpeed(value: number, units: Units): string {
  const converted = units === "imperial" ? value * 0.621371 : value;
  const suffix = units === "imperial" ? "mph" : "km/h";
  return `${Math.round(converted)} ${suffix}`;
}

/* ── Time zone plumbing ──────────────────────────────────────────────────────
 *
 * Every instant below is rendered in the LOCATION's zone, not the reader's.
 * `new Intl.DateTimeFormat(undefined, …)` with no `timeZone` uses the device
 * zone, so a reader in Kolkata looking at Longyearbyen was shown a sunrise of
 * "7:41 PM", and a reader in New York had every day of the daily list labelled
 * with the PREVIOUS calendar day.
 *
 * `undefined` as the zone means "the device's", which is exactly the wrong
 * default for a forecast. An invalid zone string throws a RangeError, so it is
 * validated first and degraded to the device zone rather than crashing.
 */
function zoneOption(timezone?: string | null): { timeZone?: string } {
  if (!timezone) return {};
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return { timeZone: timezone };
  } catch {
    return {};
  }
}

export function formatTime(value: string, timezone?: string | null): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...zoneOption(timezone)
  }).format(new Date(value));
}

/**
 * `value` is a bare `YYYY-MM-DD` day key, which `new Date()` parses as UTC
 * midnight. Formatting that in the device zone rolls it back a day for anyone
 * west of UTC — a US reader saw Tuesday for every row. Formatted in UTC it
 * cannot move, because the key has no time component to shift.
 */
export function formatDay(value: string, timezone?: string | null): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T12:00:00Z`));
}

/* The table is hoisted and `as const` so each value keeps its literal glyph-name
 * type. It used to be an inline object literal returned straight from the
 * function, which widened to `string`, so `Ionicons` rejected it at both call
 * sites ("Type 'string' is not assignable to type 'keyof typeof glyphMap'"). */
const CONDITION_ICON = {
  clear: "sunny-outline",
  partly_cloudy: "partly-sunny-outline",
  cloudy: "cloud-outline",
  fog: "reorder-three-outline",
  drizzle: "rainy-outline",
  rain: "rainy-outline",
  thunderstorm: "thunderstorm-outline",
  snow: "snow-outline",
  sleet: "snow-outline",
  wind: "flag-outline",
  extreme: "warning-outline"
} as const satisfies Record<WeatherCondition, string>;

/* Returns the icon NAME, typed as what `<Ionicons name=… />` actually accepts.
 * It used to be declared `: string`, which widened every literal and made both
 * call sites fail with "Type 'string' is not assignable to type 'keyof typeof
 * glyphMap'". A type-only import of the component keeps the contract in step
 * with the library instead of restating a 1300-name union by hand. */
export function conditionIcon(condition: WeatherCondition): ComponentProps<typeof Ionicons>["name"] {
  return CONDITION_ICON[condition] as ComponentProps<typeof Ionicons>["name"];
}

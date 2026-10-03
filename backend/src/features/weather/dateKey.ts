/**
 * Local-calendar day keys.
 *
 * A forecast day is a *local* day: "Saturday" in the forecast means the
 * Saturday the reader experiences, not the Saturday that happened in UTC.
 * Deriving the key with `toISOString().slice(0, 10)` buckets by UTC, so for any
 * location whose local date has already rolled over, the first forecast row
 * carries yesterday's date. The client then renders that row as "Wed" while
 * shading it as today, and takes the hero's high and low from it — wrong for
 * roughly 40% of the day in Tokyo and Sydney, and 18% in New York.
 *
 * Two zone formats have to be handled, because the codebase carries both:
 * IANA names from the curated location list, and fixed offsets from
 * OpenWeatherMap, which reports `timezone` in seconds rather than a zone name.
 */

/**
 * Turn OpenWeatherMap's UTC offset (in seconds) into a timeZone string.
 *
 * OWM reports a location's offset but never an IANA zone name, in either the
 * /weather or the geocoding payload. Handing the client a fixed-offset string
 * such as "+02:00" — which `Intl.DateTimeFormat` accepts — is what lets the
 * page render sun and moon times in the city's local time. Hardcoding "UTC"
 * made every one of them wrong by the offset, and "UTC" is a valid zone name,
 * so no client-side validation would catch it.
 *
 * The offset is re-read on every fetch, so a daylight-saving change is picked up
 * on the next refresh — but that is the WHOLE story only for today. The current
 * offset is applied to every row in the visible 5-7 day window and to every solar
 * time in the bundle, so for the days AFTER a transition inside that window every
 * sunrise, sunset and twilight reads one hour (30 min at Lord Howe and Chatham)
 * off civil time, and no refresh fixes it until the transition has actually
 * passed. Carrying a per-row offset would be the real fix; `/forecast` items have
 * no per-item `timezone` (only `city.timezone`), so it is not available on this
 * endpoint. This matters from late October (Europe/US) and early April (AU/NZ).
 */
export function offsetTimeZone(offsetSeconds: unknown): string {
  if (typeof offsetSeconds !== "number" || !Number.isFinite(offsetSeconds)) {
    return "UTC";
  }
  const sign = offsetSeconds < 0 ? "-" : "+";
  const total = Math.abs(Math.trunc(offsetSeconds));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

/** True for a fixed-offset zone such as "+02:00" or "-05:30". */
function isOffsetZone(timezone: string): boolean {
  return /^[+-]\d{2}:\d{2}$/.test(timezone);
}

function offsetSeconds(timezone: string): number {
  const sign = timezone.startsWith("-") ? -1 : 1;
  const match = /^(\d{2}):(\d{2})$/.exec(timezone.slice(1));
  if (!match) return 0;
  return sign * (Number(match[1]) * 3600 + Number(match[2]) * 60);
}

/**
 * The UTC instant of local solar noon for a `YYYY-MM-DD` day at `timezone`.
 *
 * The solar calculations want "the middle of that local day". They used to be
 * handed `new Date(`${date}T12:00:00Z`)`, which is 12:00 *UTC* — for any
 * location east of UTC+12 that is already the previous local evening, so
 * Auckland's, Suva's and Apia's sunrise and sunset were computed for the wrong
 * day and the "Blue hour" and golden-hour windows with them. Half-hour zones
 * (India +05:30, Nepal +05:45) were wrong too, by their own offset.
 *
 * Appending the offset to the wall time is the inverse of `localDateKey` and
 * handles both zone formats, including the fractional-hour ones.
 */
export function localNoon(date: string, timezone: string | undefined | null): Date {
  if (timezone && isOffsetZone(timezone)) {
    const wall = new Date(`${date}T12:00:00${timezone}`);
    // An unparseable offset string yields Invalid Date; fall through to UTC.
    if (!Number.isNaN(wall.getTime())) return wall;
  }
  return new Date(`${date}T12:00:00Z`);
}

/**
 * `YYYY-MM-DD` for the calendar day an instant falls on at `timezone`.
 *
 * Falls back to the UTC day when the zone is unusable, which is the honest
 * degradation: a slightly-wrong key beats a thrown error inside the scan.
 */
export function localDateKey(instant: Date | number, timezone: string | undefined | null): string {
  const ms = instant instanceof Date ? instant.getTime() : instant;

  if (!timezone) return new Date(ms).toISOString().slice(0, 10);

  if (isOffsetZone(timezone)) {
    return new Date(ms + offsetSeconds(timezone) * 1000).toISOString().slice(0, 10);
  }

  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the key shape.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

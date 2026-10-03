import type { WeatherAlert } from "@nimbus/shared";
import { query } from "../db/pool.js";
import { logger } from "../config/logger.js";
import { cacheLocationKey } from "../features/locations/savedLocations.service.js";
import { buildAlertNotification, severityRank } from "../features/notifications/alertNotification.js";
import {
  evaluateAlert,
  markDelivered
} from "../features/notifications/alertEvents.service.js";
import { sendPush } from "../features/notifications/pushClient.js";
import { getWeatherBundle } from "../features/weather/weather.service.js";

/**
 * Watches the places people actually saved and pushes them a warning when
 * something severe turns up.
 *
 * This replaced a stub that iterated five hardcoded cities and only wrote a log
 * line. Nothing downstream of it existed: no preference was read, no row was
 * written, and no device was ever contacted.
 */

/** Severities this milestone is willing to push. */
const PUSHABLE_SEVERITIES = new Set<WeatherAlert["severity"]>(["severe", "extreme"]);

type WatcherRow = {
  latitude: number;
  longitude: number;
  name: string;
  timezone: string;
  installationId: string;
  pushToken: string;
  quietHoursStart: string;
  quietHoursEnd: string;
};

type Watcher = {
  installationId: string;
  pushToken: string;
  quietHours: { start: string; end: string };
};

type WatchedLocation = {
  locationKey: string;
  name: string;
  timezone: string;
  latitude: number;
  longitude: number;
  watchers: Watcher[];
};

export type { WatchedLocation };

/**
 * Every saved location belonging to an installation that wants severe alerts
 * and has a device to push to.
 *
 * Grouping happens here rather than in the query because one location can be
 * watched by several installations, and each of them should get the warning.
 */
export async function getWatchedLocations(): Promise<WatchedLocation[]> {
  const rows = await query<WatcherRow>(
    `SELECT sl.latitude,
            sl.longitude,
            sl.name,
            sl.timezone,
            i.id AS "installationId",
            i.push_token AS "pushToken",
            np.quiet_hours_start AS "quietHoursStart",
            np.quiet_hours_end AS "quietHoursEnd"
     FROM saved_locations sl
     JOIN installations i ON i.id = sl.installation_id
     JOIN notification_preferences np ON np.installation_id = i.id
     WHERE np.severe_alerts = TRUE
       AND i.push_token IS NOT NULL
     ORDER BY sl.sort_order ASC`
  );

  const byKey = new Map<string, WatchedLocation>();

  for (const row of rows) {
    // Rounded the same way as the bundle cache key, so two nearby saves share
    // one weather fetch rather than one each.
    const key = cacheLocationKey(row.latitude, row.longitude);

    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        locationKey: key,
        name: row.name,
        timezone: row.timezone,
        latitude: row.latitude,
        longitude: row.longitude,
        watchers: []
      };
      byKey.set(key, entry);
    }

    const alreadyWatching = entry.watchers.some(
      (watcher) => watcher.installationId === row.installationId
    );
    if (!alreadyWatching) {
      entry.watchers.push({
        installationId: row.installationId,
        pushToken: row.pushToken,
        quietHours: { start: row.quietHoursStart, end: row.quietHoursEnd }
      });
    }
  }

  return [...byKey.values()];
}

export type ScanSummary = {
  locationsChecked: number;
  alertsSeen: number;
  pushesSent: number;
  pushesSuppressed: number;
  pushesFailed: number;
  locationsFailed: number;
};

/**
 * How a location's alerts are obtained.
 *
 * This is the seam the synthetic test path uses. Everything downstream of it —
 * fingerprinting, the quiet-hours rules, one-push-per-location grouping, the
 * push, the audit rows — runs identically whether the alerts came from the
 * weather provider or from a test.
 */
export type AlertSource = (location: WatchedLocation) => Promise<WeatherAlert[]>;

export async function providerAlerts(location: WatchedLocation): Promise<WeatherAlert[]> {
  const bundle = await getWeatherBundle(location.latitude, location.longitude);

  /* Sample data must never become a safety notification.
   *
   * `getWeatherBundle` falls back to the deterministic sample provider whenever
   * the live provider is unreachable or unkeyed, and tags the bundle
   * `source: "sample"`. The filter below was on severity alone, so a bundle that
   * had already failed could still yield a `severe` alert — the sample provider
   * emits `wind-gust-watch` at `severe` once its synthesised gust passes 60 —
   * and that alert was pushed to the watcher's phone, attributed to the
   * "Nimbus forecast model", for a location with no such weather.
   *
   * The web client shows a "Sample data" badge in this state; a push notification
   * has already left the browser and carries no such marker, so the badge cannot
   * cover it.
   *
   * `source` is OPTIONAL on the schema, so an absent or unrecognised value fails
   * this check too. That is the correct direction for a safety notification: if a
   * bundle's provenance cannot be confirmed, it does not get to claim someone's
   * phone is in danger. A silently disabled alert is a far better failure than a
   * fabricated one.
   *
   * The degradation is cached for 5 minutes under the same `weather:v1:` key as
   * live data, so this is not a single-bad-response blip. */
  if (bundle.source !== "openweathermap") {
    logger.warn(
      { lat: location.latitude, lon: location.longitude, source: bundle.source ?? null },
      "refusing to push alerts from a bundle that is not live provider data"
    );
    return [];
  }

  return (bundle.alerts ?? []).filter((alert) => PUSHABLE_SEVERITIES.has(alert.severity));
}

/**
 * Run one pass of the scan.
 *
 * `now` is injectable so behaviour can be tested against a fixed clock rather
 * than whatever time the suite happens to run.
 */
export async function scanForSevereAlerts(now: Date = new Date()): Promise<ScanSummary> {
  return scanLocations(await getWatchedLocations(), providerAlerts, now);
}

/**
 * The scan itself, over an explicit list of locations and alert source.
 */
export async function scanLocations(
  locations: WatchedLocation[],
  source: AlertSource,
  now: Date
): Promise<ScanSummary> {
  const summary: ScanSummary = {
    locationsChecked: locations.length,
    alertsSeen: 0,
    pushesSent: 0,
    pushesSuppressed: 0,
    pushesFailed: 0,
    locationsFailed: 0
  };

  for (const location of locations) {
    try {
      const alerts = await source(location);
      const sent = await scanLocation(location, alerts, now, summary);
      if (sent) summary.pushesSent += 1;
    } catch (error) {
      // One bad location must not abandon the rest of the pass: a provider
      // outage on one coordinate would otherwise silence the user's warnings
      // for every other place they care about.
      summary.locationsFailed += 1;
      logger.error(
        { err: error, locationKey: location.locationKey, name: location.name },
        "Alert scan failed for location; continuing"
      );
    }
  }

  logger.info(summary, "Severe weather alert scan complete");
  return summary;
}

/** Returns true when at least one push was sent for this location. */
async function scanLocation(
  location: WatchedLocation,
  allAlerts: WeatherAlert[],
  now: Date,
  summary: ScanSummary
): Promise<boolean> {
  const alerts = allAlerts.filter((alert) => PUSHABLE_SEVERITIES.has(alert.severity));

  if (alerts.length === 0) return false;
  summary.alertsSeen += alerts.length;

  // Every alert is evaluated, not just the one we intend to push, so that each
  // alert type keeps its own incident state. Skipping the suppressed ones would
  // leave their incidents looking stale and cause a burst of notifications the
  // moment they reappear.
  //
  // Quiet hours are passed as "not in quiet hours" because severe and extreme
  // alerts break through them by definition, so for this milestone the flag
  // cannot change any outcome. It has to move inside the per-installation loop
  // before moderate alerts are ever pushed.
  const outcomes: Awaited<ReturnType<typeof evaluateAlert>>[] = [];
  for (const alert of alerts) {
    outcomes.push(
      await evaluateAlert({
        locationKey: location.locationKey,
        locationName: location.name,
        alert,
        detectedAt: now,
        timezone: location.timezone,
        quietHours: null,
        installationId: null
      })
    );
  }

  // Push about the most severe alert we are actually acting on, rather than the
  // most severe one present. A six-hour-old air quality reminder should not be
  // introduced with a wind alert the user received an hour ago.
  const actionable = alerts
    .map((alert, index) => ({ alert, outcome: outcomes[index]! }))
    .filter((entry) => entry.outcome.decision !== "suppress")
    .sort((left, right) => severityRank(left.alert.severity) - severityRank(right.alert.severity));

  if (actionable.length === 0) {
    summary.pushesSuppressed += 1;
    return false;
  }

  const lead = actionable[0]!;
  const message = buildAlertNotification({
    locationName: location.name,
    locationKey: location.locationKey,
    alerts,
    leadAlert: lead.alert
  });

  let sent = false;

  for (const watcher of location.watchers) {
    const result = await sendPush(watcher.pushToken, message);

    if (result.outcome === "sent") {
      sent = true;
      continue;
    }

    if (result.outcome === "device_not_registered") {
      // The app was uninstalled or the token was revoked. Retrying it forever
      // would fill the audit log with failures, so the dead token is cleared.
      await query(`UPDATE installations SET push_token = NULL, updated_at = NOW() WHERE id = $1`, [
        watcher.installationId
      ]);
      logger.warn(
        { installationId: watcher.installationId, locationKey: location.locationKey },
        "Cleared a push token Expo reported as no longer registered"
      );
      continue;
    }

    // A failure leaves `delivered_at` null, so the incident stays undelivered
    // and the next scan retries it.
    logger.warn(
      { installationId: watcher.installationId, outcome: result.outcome, error: result.error },
      "Push was not delivered; will retry on the next scan"
    );
  }

  if (sent) {
    await markDelivered(lead.outcome.incidentId);
    return true;
  }

  summary.pushesFailed += 1;
  return false;
}

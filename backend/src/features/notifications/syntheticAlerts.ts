import type { WeatherAlert } from "@nimbus/shared";
import { env } from "../../config/env.js";
import { getWatchedLocations, scanLocations } from "../../jobs/alertScanner.js";

/**
 * A way to exercise the whole alert pipeline without waiting for a real storm.
 *
 * Severe wind in the user's watched cities may not happen for weeks. Without
 * this, "does the pipeline work" is unanswerable, and the PRD's success metrics
 * — one push within two minutes, zero duplicates over 24 hours — could not be
 * measured at all.
 *
 * The injection point is the scanner's alert source. Everything after it is the
 * production path: the same fingerprinting, the same quiet-hours rules, the same
 * one-push-per-location grouping, the same push call, the same audit rows. The
 * only thing faked is where the alert list comes from, which is the one part
 * that cannot be simulated meaningfully.
 */

const ALERT_TYPES: ReadonlyArray<WeatherAlert["type"]> = [
  "storm",
  "flood",
  "heat",
  "wind",
  "snow",
  "air_quality"
];

/**
 * Available outside production only.
 *
 * The route is not merely discouraged in production, it is never registered, so
 * there is no code path to reach even with a valid request.
 */
export function syntheticAlertsEnabled(): boolean {
  return env.NODE_ENV !== "production";
}

export type InjectInput = {
  installationId: string;
  alertType: WeatherAlert["type"];
  /** Overrides for the generated condition, e.g. to test a specific severity. */
  overrides?: Partial<WeatherAlert>;
  /**
   * The moment to evaluate the condition at.
   *
   * Advancing this past the incident gap is how the "treated as new" metric is
   * checked without waiting a real quarter of an hour.
   */
  at?: Date;
};

export type InjectResult = {
  locationKey: string;
  locationName: string;
  alertId: string;
  alertType: WeatherAlert["type"];
  severity: WeatherAlert["severity"];
  pushesSent: number;
  pushesSuppressed: number;
};

export async function injectSyntheticAlert(input: InjectInput): Promise<InjectResult> {
  if (!ALERT_TYPES.includes(input.alertType)) {
    throw new Error("unsupported_alert_type");
  }

  // Resolving the location through the real watch list means the synthetic run
  // exercises the same grouping and watcher lookup a genuine scan uses, and
  // that only installations with a real push token can receive anything.
  const watched = await getWatchedLocations();
  const target = watched.find((location) =>
    location.watchers.some((watcher) => watcher.installationId === input.installationId)
  );

  if (!target) {
    throw new Error("installation_not_found");
  }

  const now = input.at ?? new Date();

  const alert: WeatherAlert = {
    id: `synthetic-${input.alertType}`,
    type: input.alertType,
    title: `Synthetic ${input.alertType} alert`,
    description: "Test condition injected by the synthetic alert path.",
    severity: "severe",
    startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    source: "Nimbus synthetic test alert (not an official warning)",
    ...input.overrides
  };

  const summary = await scanLocations([target], async () => [alert], now);

  return {
    locationKey: target.locationKey,
    locationName: target.name,
    alertId: alert.id,
    alertType: alert.type,
    severity: alert.severity,
    pushesSent: summary.pushesSent,
    pushesSuppressed: summary.pushesSuppressed
  };
}

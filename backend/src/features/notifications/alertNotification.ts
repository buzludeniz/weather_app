import type { AlertSeverity, WeatherAlert } from "@nimbus/shared";
import type { PushMessage } from "./pushClient.js";

/**
 * Builds the text of a severe weather push.
 *
 * The single most important job here is the caveat. The OpenWeather free tier
 * has no alerts endpoint, so every alert Nimbus produces is inferred from
 * thresholds in `openWeather.ts`. A phone notification is a stronger commitment
 * than an in-app banner, and someone who reads a push as an official warning may
 * make a safety decision on it. The notice therefore appears in every message.
 */

/** Most severe first. Index is the rank used for ordering. */
const SEVERITY_ORDER: readonly AlertSeverity[] = ["extreme", "severe", "moderate", "minor"];

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  extreme: "Extreme",
  severe: "Severe",
  moderate: "Moderate",
  minor: "Minor"
};

/**
 * Wording is placeholder. It is user-facing copy in two languages and should be
 * replaced with something reviewed before anyone else sees it.
 */
export const DERIVED_ADVISORY_NOTICE =
  "Nimbus advisory, inferred from forecast conditions. Not an official weather warning.";

const TYPE_LABEL: Record<WeatherAlert["type"], string> = {
  storm: "storm",
  flood: "flooding",
  heat: "heat",
  wind: "wind",
  snow: "snow",
  air_quality: "air quality"
};

/** Expo rejects a single message larger than this. */
const MAX_BODY_BYTES = 4_096;

/**
 * Room left for the trailing summary and caveat once the lead description has
 * been written, so the composed message fits without cutting off the notice
 * that says the alert is not official.
 */
const BODY_OVERHEAD_BYTES = 256;

function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  // Trim on a character boundary rather than mid-codepoint, which would leave a
  // replacement character in the notification body.
  let result = text;
  while (result.length > 0 && Buffer.byteLength(result, "utf8") > maxBytes) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

export function severityRank(severity: AlertSeverity): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

/** Most severe first; ties keep their original relative order. */
export function sortBySeverity(alerts: WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

export type AlertNotificationInput = {
  /** Display name of the location the alerts belong to. */
  locationName: string;
  /** Every alert for this location in this scan. */
  alerts: WeatherAlert[];
  /** Stable location key, passed through so the app can deep-link on tap. */
  locationKey: string;
  /**
   * Which alert is causing the push.
   *
   * Usually the most severe, but not always: an older air-quality alert may be
   * due its reminder while a more severe wind alert has already been delivered
   * and suppressed. Leading with the wind would tell the user about something
   * they have already been told. Defaults to the most severe.
   */
  leadAlert?: WeatherAlert;
};

/**
 * One notification per location, leading with the condition being acted on and
 * listing the rest by name only.
 *
 * A scan can turn up wind, rain, and a thunderstorm at once. Sending one push
 * per alert would turn a single bad afternoon into a burst of buzzes, which is
 * the fastest way to get notifications switched off.
 */
export function buildAlertNotification(input: AlertNotificationInput): PushMessage {
  const lead = input.leadAlert ?? sortBySeverity(input.alerts)[0];

  if (!lead) {
    throw new Error("buildAlertNotification requires at least one alert");
  }

  // The lead is pinned to the front; everything else is ordered by severity.
  const others = sortBySeverity(input.alerts.filter((alert) => alert.id !== lead.id));
  const title = `${SEVERITY_LABEL[lead.severity]} ${TYPE_LABEL[lead.type]} in ${input.locationName}`;

  // The provider's description is the only unbounded part, so it absorbs the
  // truncation. The notice below must survive intact.
  const parts = [truncateToBytes(lead.description, MAX_BODY_BYTES - BODY_OVERHEAD_BYTES)];

  if (others.length === 1) {
    parts.push(`Also expected: ${TYPE_LABEL[others[0]!.type]}.`);
  } else if (others.length > 1) {
    const names = others.map((alert) => TYPE_LABEL[alert.type]).join(", ");
    parts.push(`Also expected: ${names}.`);
  }

  parts.push(DERIVED_ADVISORY_NOTICE);

  return {
    title,
    body: parts.join("\n\n"),
    data: { type: "weather_alert", locationKey: input.locationKey, alertId: lead.id }
  };
}

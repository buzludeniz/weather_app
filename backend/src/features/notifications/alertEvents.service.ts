import { createHash } from "node:crypto";
import type { AlertSeverity, WeatherAlert } from "@nimbus/shared";
import { query } from "../../db/pool.js";

/**
 * Decides whether a detected alert should produce a push notification.
 *
 * This exists because the alert data cannot support the naive approach. Every
 * alert id in `openWeather.ts` is a constant ("wind-gust", "heavy-rain", …) and
 * `endsAt` is recomputed as `now + 2h` on every evaluation, so neither can be
 * used as incident identity. Without explicit state, a five-minute scan would
 * notify about the same storm seventy-two times a day.
 *
 * The decision logic below is deliberately pure and separate from persistence,
 * because it is the part that is easy to get subtly wrong and impossible to
 * verify by reading.
 */

/** Matches the scanner cadence chosen for this milestone. */
export const SCAN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Consecutive missed detections that close an incident.
 *
 * Three scans is about 15 minutes. Wind gusts and rain probability fluctuate
 * hour to hour, so a single quiet scan must not end an incident, but a quarter
 * of an hour of nothing means the condition has genuinely passed.
 */
export const INCIDENT_GAP_SCANS = 3;

export const INCIDENT_GAP_MS = INCIDENT_GAP_SCANS * SCAN_INTERVAL_MS;

/** How long an incident must persist before one reminder is allowed. */
export const REMINDER_AFTER_MS = 6 * 60 * 60 * 1000;

export type AlertDecision = "notify" | "remind" | "suppress";

/** An incident that is still within the gap window. */
export type OpenIncident = {
  id: string;
  alertFingerprint: string;
  firstDetectedAt: Date;
  lastSeenAt: Date;
  reminderSentAt: Date | null;
};

export type DeliveryInput = {
  severity: AlertSeverity;
  detectedAt: Date;
  /** Whether the location's local clock is inside the user's quiet hours. */
  isQuietHours: boolean;
};

export type DeliveryOutcome = {
  decision: AlertDecision;
  reason: string;
};

/** Severities that always break through quiet hours. */
function alwaysWakesUser(severity: AlertSeverity): boolean {
  return severity === "severe" || severity === "extreme";
}

/**
 * Whether a previously seen incident is still the same occurrence.
 *
 * The gap, not the alert's own fields, is what distinguishes "still happening"
 * from "happened again", because the alert's identity fields are constant and
 * its time window is recomputed every scan.
 */
export function isIncidentOpen(
  lastSeenAt: Date,
  detectedAt: Date,
  gapMs: number = INCIDENT_GAP_MS
): boolean {
  return detectedAt.getTime() - lastSeenAt.getTime() <= gapMs;
}

/**
 * The core state machine.
 *
 * A new incident always notifies. An ongoing incident is silent until it has
 * lasted long enough to justify a single reminder. Quiet hours suppress anything
 * that is not severe or extreme, which today means they suppress nothing at all,
 * but the rule is explicit so that adding moderate alerts later does not quietly
 * violate it.
 */
export function decideAlertDelivery(
  incident: OpenIncident | null,
  input: DeliveryInput
): DeliveryOutcome {
  if (!incident) {
    return { decision: "notify", reason: "new_incident" };
  }

  if (input.isQuietHours && !alwaysWakesUser(input.severity)) {
    return { decision: "suppress", reason: "quiet_hours" };
  }

  const elapsed = input.detectedAt.getTime() - incident.firstDetectedAt.getTime();

  if (incident.reminderSentAt === null && elapsed >= REMINDER_AFTER_MS) {
    return { decision: "remind", reason: "long_running_incident" };
  }

  return { decision: "suppress", reason: "already_notified" };
}

// ─── Quiet hours ──────────────────────────────────────────────────────────────

/** Minutes since local midnight, at a location. */
export function localMinutesAt(date: Date, timezone: string): number {
  // `Intl` carries the zone's rules including daylight saving, which a fixed
  // offset would get wrong twice a year.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function parseHhMm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid quiet-hours time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Quiet-hours time out of range: ${value}`);
  }
  return hours * 60 + minutes;
}

/**
 * Whether local time falls inside the quiet window.
 *
 * Handles a window that wraps midnight, which is the default: 22:00 to 07:00.
 */
export function isWithinQuietHours(
  localMinutes: number,
  quietStart: string,
  quietEnd: string
): boolean {
  const start = parseHhMm(quietStart);
  const end = parseHhMm(quietEnd);

  // An empty or full-day window means quiet hours are switched off.
  if (start === end) return false;

  return start < end
    ? localMinutes >= start && localMinutes < end
    : // Wraps midnight.
      localMinutes >= start || localMinutes < end;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

type IncidentRow = {
  id: string;
  alertFingerprint: string;
  startsAt: Date;
  lastSeenAt: Date;
  reminderSentAt: Date | null;
};

/**
 * Fingerprint of one incident.
 *
 * Deliberately built from the location, the alert type, and a per-pair
 * sequence number. The alert's own `id` and `endsAt` are excluded on purpose:
 * `id` is constant, so keying on it would suppress every future alert of that
 * type for the lifetime of the installation, and `endsAt` moves on every scan.
 */
export function buildFingerprint(
  locationKey: string,
  alertType: string,
  sequence: number
): string {
  return createHash("sha256")
    .update(`${locationKey}:${alertType}:${sequence}`)
    .digest("hex")
    .slice(0, 32);
}

/** The most recent incident for a location and alert type, if still open. */
export async function findOpenIncident(
  locationKey: string,
  alertType: string,
  detectedAt: Date,
  gapMs: number = INCIDENT_GAP_MS
): Promise<OpenIncident | null> {
  const rows = await query<IncidentRow>(
    `SELECT id,
            alert_fingerprint AS "alertFingerprint",
            starts_at AS "startsAt",
            last_seen_at AS "lastSeenAt",
            reminder_sent_at AS "reminderSentAt"
     FROM weather_alert_events
     WHERE location_key = $1
       AND alert_type = $2
       AND last_seen_at >= $3
     ORDER BY last_seen_at DESC
     LIMIT 1`,
    [locationKey, alertType, new Date(detectedAt.getTime() - gapMs)]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    alertFingerprint: row.alertFingerprint,
    firstDetectedAt: row.startsAt,
    lastSeenAt: row.lastSeenAt,
    reminderSentAt: row.reminderSentAt
  };
}

async function countIncidents(locationKey: string, alertType: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM weather_alert_events
     WHERE location_key = $1 AND alert_type = $2`,
    [locationKey, alertType]
  );
  return Number(rows[0]?.count ?? 0);
}

export type EvaluateInput = {
  locationKey: string;
  locationName: string;
  alert: WeatherAlert;
  detectedAt: Date;
  /** IANA zone of the location, used to evaluate quiet hours locally. */
  timezone: string;
  quietHours: { start: string; end: string } | null;
  /**
   * Recorded on the audit row. Null when several installations share a
   * location, because the incident itself is shared between them.
   */
  installationId: string | null;
};

export type EvaluateResult = DeliveryOutcome & {
  incidentId: string;
  alertFingerprint: string;
};

/**
 * Record a detection and decide what to do about it.
 *
 * Every path writes an audit row, including the suppressed ones. The PRD makes
 * an auditable record of each scan decision a requirement, and it is the only
 * practical way to answer "why did I not get a warning about that storm".
 */
export async function evaluateAlert(input: EvaluateInput): Promise<EvaluateResult> {
  const { locationKey, alert, detectedAt, installationId } = input;
  const existing = await findOpenIncident(locationKey, alert.type, detectedAt);

  const isQuietHours = input.quietHours
    ? isWithinQuietHours(
        localMinutesAt(detectedAt, input.timezone),
        input.quietHours.start,
        input.quietHours.end
      )
    : false;

  const outcome = decideAlertDelivery(existing, {
    severity: alert.severity,
    detectedAt,
    isQuietHours
  });

  let incidentId: string;
  let fingerprint: string;

  if (existing) {
    incidentId = existing.id;
    fingerprint = existing.alertFingerprint;
    await query(
      `UPDATE weather_alert_events
       SET last_seen_at = $2,
           reminder_sent_at = CASE WHEN $3 THEN NOW() ELSE reminder_sent_at END
       WHERE id = $1`,
      [incidentId, detectedAt, outcome.decision === "remind"]
    );
  } else {
    const sequence = (await countIncidents(locationKey, alert.type)) + 1;
    fingerprint = buildFingerprint(locationKey, alert.type, sequence);

    try {
      const inserted = await query<{ id: string }>(
        `INSERT INTO weather_alert_events
           (alert_fingerprint, location_key, alert_type, title, severity, starts_at, ends_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $6)
         ON CONFLICT (alert_fingerprint) DO NOTHING
         RETURNING id`,
        [
          fingerprint,
          locationKey,
          alert.type,
          alert.title,
          alert.severity,
          detectedAt,
          alert.endsAt
        ]
      );

      const id = inserted[0]?.id;
      if (!id) {
        // A concurrent scan won the race for this incident number. Treat it as
        // already recorded rather than letting the unique violation abort the
        // whole scan.
        await recordAudit(input, "suppress", "concurrent_incident");
        const race = await findOpenIncident(locationKey, alert.type, detectedAt);
        return {
          decision: "suppress",
          reason: "concurrent_incident",
          incidentId: race?.id ?? "",
          alertFingerprint: fingerprint
        };
      }
      incidentId = id;
    } catch (error) {
      await recordAudit(input, "suppress", "incident_write_failed");
      throw error;
    }
  }

  await recordAudit(input, outcome.decision, outcome.reason);

  return { ...outcome, incidentId, alertFingerprint: fingerprint };
}

async function recordAudit(
  input: EvaluateInput,
  decision: AlertDecision,
  reason: string
): Promise<void> {
  await query(
    `INSERT INTO audit_events (installation_id, event_type, metadata)
     VALUES ($1, 'alert_delivery_decision', $2)`,
    [
      input.installationId,
      JSON.stringify({
        locationKey: input.locationKey,
        locationName: input.locationName,
        alertId: input.alert.id,
        alertType: input.alert.type,
        severity: input.alert.severity,
        decision,
        reason,
        detectedAt: input.detectedAt.toISOString()
      })
    ]
  );
}

/** Record that a push was accepted, so the incident is not retried. */
export async function markDelivered(incidentId: string): Promise<void> {
  await query(`UPDATE weather_alert_events SET delivered_at = NOW() WHERE id = $1`, [incidentId]);
}

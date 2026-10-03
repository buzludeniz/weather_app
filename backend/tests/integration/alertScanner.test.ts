import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeatherAlert } from "@nimbus/shared";

/**
 * End-to-end behaviour of the alert scan loop, against an in-memory stand-in for
 * Postgres.
 *
 * This is where the PRD's success metrics are actually checked: one push per
 * incident, no duplicates, a genuine gap reopening the incident, and one broken
 * location not silencing the others. The decision rules themselves are unit
 * tested in `alertEvents.test.ts`; what matters here is that the scan wires
 * them together correctly and never sends twice.
 */

type Incident = {
  id: string;
  alertFingerprint: string;
  locationKey: string;
  alertType: string;
  severity: string;
  startsAt: Date;
  endsAt: Date;
  lastSeenAt: Date;
  reminderSentAt: Date | null;
  deliveredAt: Date | null;
};

type WatchRow = {
  installationId: string;
  pushToken: string | null;
  latitude: number;
  longitude: number;
  name: string;
  timezone: string;
  severeAlerts: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

const TIRANA = {
  installationId: "11111111-1111-4111-8111-111111111111",
  pushToken: "ExponentPushToken[tirana]",
  latitude: 41.3275,
  longitude: 19.8189,
  name: "Tirana",
  timezone: "Europe/Tirane",
  severeAlerts: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00"
};

const TOKYO = { ...TIRANA, installationId: "22222222-2222-4222-8222-222222222222", pushToken: "ExponentPushToken[tokyo]", latitude: 35.6762, longitude: 139.6503, name: "Tokyo", timezone: "Asia/Tokyo" };

let watchRows: WatchRow[];
let incidents: Incident[];
let audits: Array<{ installationId: string | null; eventType: string; metadata: any }>;
let nextIncidentId: number;
let uniqueViolationOnce: boolean;

function makeAlert(overrides: Partial<WeatherAlert> = {}): WeatherAlert {
  const now = new Date("2024-06-21T10:00:00.000Z");
  return {
    id: "wind-gust",
    type: "wind",
    title: "Strong wind gusts",
    description: "Gusts around 80 km/h.",
    severity: "severe",
    startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 7_200_000).toISOString(),
    source: "Nimbus derived advisory (not an official warning)",
    ...overrides
  };
}

const pushCalls: Array<{ token: string; title: string; body: string }> = [];
let pushOutcome: "sent" | "device_not_registered" | "rejected" | "failed" = "sent";

vi.mock("../../src/db/pool.js", () => {
  const fakeQuery = async (text: string, params: unknown[] = []): Promise<unknown[]> => {
    // Watch list: saved locations joined to installations and preferences.
    if (text.includes("FROM saved_locations sl")) {
      return watchRows
        .filter((row) => row.severeAlerts && row.pushToken !== null)
        .map((row) => ({
          latitude: row.latitude,
          longitude: row.longitude,
          name: row.name,
          timezone: row.timezone,
          installationId: row.installationId,
          pushToken: row.pushToken,
          quietHoursStart: row.quietHoursStart,
          quietHoursEnd: row.quietHoursEnd
        }));
    }

    if (text.includes("COUNT(*)")) {
      const [locationKey, alertType] = params as [string, string];
      const count = incidents.filter(
        (row) => row.locationKey === locationKey && row.alertType === alertType
      ).length;
      return [{ count: String(count) }];
    }

    if (text.includes("last_seen_at >=")) {
      const [locationKey, alertType, since] = params as [string, string, Date];
      const match = incidents
        .filter(
          (row) =>
            row.locationKey === locationKey &&
            row.alertType === alertType &&
            row.lastSeenAt.getTime() >= since.getTime()
        )
        .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())[0];
      return match
        ? [
            {
              id: match.id,
              alertFingerprint: match.alertFingerprint,
              startsAt: match.startsAt,
              lastSeenAt: match.lastSeenAt,
              reminderSentAt: match.reminderSentAt
            }
          ]
        : [];
    }

    if (text.includes("INSERT INTO weather_alert_events")) {
      if (uniqueViolationOnce) {
        uniqueViolationOnce = false;
        // ON CONFLICT DO NOTHING path: no row returned.
        return [];
      }
      const [fingerprint, locationKey, alertType, title, severity, startsAt, endsAt] =
        params as [string, string, string, string, string, Date, Date];
      const row: Incident = {
        id: `incident-${nextIncidentId++}`,
        alertFingerprint: fingerprint,
        locationKey,
        alertType,
        severity,
        title,
        startsAt,
        endsAt,
        lastSeenAt: startsAt,
        reminderSentAt: null,
        deliveredAt: null
      };
      incidents.push(row);
      return [{ id: row.id }];
    }

    if (text.includes("SET last_seen_at = $2")) {
      const [id, lastSeenAt, isReminder] = params as [string, Date, boolean];
      const row = incidents.find((entry) => entry.id === id);
      if (row) {
        row.lastSeenAt = lastSeenAt;
        if (isReminder) row.reminderSentAt = lastSeenAt;
      }
      return [];
    }

    if (text.includes("SET delivered_at")) {
      const [id] = params as [string];
      const row = incidents.find((entry) => entry.id === id);
      if (row) row.deliveredAt = new Date();
      return [];
    }

    if (text.includes("INSERT INTO audit_events")) {
      // Two bound parameters: the event type is a literal in the SQL.
      const [installationId, metadata] = params as [string | null, string];
      audits.push({
        installationId,
        eventType: "alert_delivery_decision",
        metadata: JSON.parse(String(metadata))
      });
      return [];
    }

    if (text.includes("UPDATE installations SET push_token = NULL")) {
      const [installationId] = params as [string];
      const row = watchRows.find((entry) => entry.installationId === installationId);
      if (row) row.pushToken = null;
      return [];
    }

    throw new Error(`Unexpected query in fake pool: ${text.slice(0, 80)}`);
  };

  return { query: fakeQuery, pool: { connect: vi.fn() } };
});

vi.mock("../../src/features/notifications/pushClient.js", () => ({
  sendPush: async (token: string, message: { title: string; body: string }) => {
    pushCalls.push({ token, title: message.title, body: message.body });
    if (pushOutcome === "sent") return { outcome: "sent", ticketId: `t-${pushCalls.length}` };
    if (pushOutcome === "device_not_registered") {
      return { outcome: "device_not_registered", error: "gone" };
    }
    if (pushOutcome === "rejected") return { outcome: "rejected", error: "nope" };
    return { outcome: "failed", error: "offline" };
  }
}));

const { scanLocations, getWatchedLocations } = await import("../../src/jobs/alertScanner.js");
const { logger } = await import("../../src/config/logger.js");

// The scan deliberately swallows per-location errors so one bad place cannot
// silence the rest. That is right in production and wrong in a test, so
// failures are re-thrown here rather than vanishing into the log.
let swallowed: unknown[] = [];
beforeEach(() => {
  swallowed = [];
  vi.spyOn(logger, "error").mockImplementation((...args: unknown[]) => {
    swallowed.push(args);
  });
});

const T0 = new Date("2024-06-21T10:00:00.000Z");
const minutes = (count: number) => new Date(T0.getTime() + count * 60_000);

beforeEach(() => {
  watchRows = [{ ...TIRANA }];
  incidents = [];
  audits = [];
  nextIncidentId = 1;
  uniqueViolationOnce = false;
  pushCalls.length = 0;
  pushOutcome = "sent";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getWatchedLocations", () => {
  it("groups installations that share a location into one entry", async () => {
    watchRows = [
      { ...TIRANA },
      { ...TIRANA, installationId: "33333333-3333-4333-8333-333333333333", pushToken: "ExponentPushToken[other]" }
    ];

    const locations = await getWatchedLocations();

    expect(locations).toHaveLength(1);
    expect(locations[0]!.watchers).toHaveLength(2);
  });

  it("ignores installations that have opted out of severe alerts", async () => {
    watchRows = [{ ...TIRANA, severeAlerts: false }];
    expect(await getWatchedLocations()).toHaveLength(0);
  });

  it("ignores installations with no push token", async () => {
    watchRows = [{ ...TIRANA, pushToken: null }];
    expect(await getWatchedLocations()).toHaveLength(0);
  });
});

describe("scanLocations", () => {
  it("sends one push for a new severe incident", async () => {
    const summary = await scanLocations(await getWatchedLocations(), async () => [makeAlert()], T0);

    expect(swallowed).toEqual([]);
    expect(summary.pushesSent).toBe(1);
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]!.body.toLowerCase()).toContain("not an official weather warning");
  });

  it("does not repeat itself on the next scan", async () => {
    const locations = await getWatchedLocations();
    await scanLocations(locations, async () => [makeAlert()], T0);
    const second = await scanLocations(locations, async () => [makeAlert()], minutes(5));

    expect(pushCalls).toHaveLength(1);
    expect(second.pushesSent).toBe(0);
  });

  it("stays silent across many scans of a long storm", async () => {
    const locations = await getWatchedLocations();
    await scanLocations(locations, async () => [makeAlert()], T0);

    for (let tick = 1; tick <= 12; tick += 1) {
      const summary = await scanLocations(locations, async () => [makeAlert()], minutes(tick * 5));
      // Everything from here to the reminder threshold is a duplicate.
      if (tick * 5 < 360) expect(summary.pushesSent).toBe(0);
    }

    // One initial notification, no duplicates for the first hour.
    expect(pushCalls).toHaveLength(1);
  });

  it("reminds exactly once for a storm that has lasted six hours", async () => {
    const locations = await getWatchedLocations();
    // Every scan from here on keeps detecting the condition, which is what keeps
    // the incident open. Skipping scans would age it out of the gap window and
    // legitimately start a new incident.
    const tick = async (minute: number) =>
      scanLocations(locations, async () => [makeAlert()], minutes(minute));

    await tick(0);
    for (let minute = 5; minute < 360; minute += 5) {
      await tick(minute);
    }
    expect(pushCalls).toHaveLength(1);

    const reminder = await tick(360);
    expect(reminder.pushesSent).toBe(1);
    expect(pushCalls).toHaveLength(2);

    // Still the same incident, so no further reminders for another six hours.
    for (let minute = 365; minute <= 720; minute += 5) {
      await tick(minute);
    }
    expect(pushCalls).toHaveLength(2);
  });

  it("treats an alert after a genuine gap as a new incident", async () => {
    const locations = await getWatchedLocations();
    await scanLocations(locations, async () => [makeAlert()], T0);

    // Nothing detected for longer than the gap, then it comes back.
    const afterGap = await scanLocations(locations, async () => [makeAlert()], minutes(30));

    expect(afterGap.pushesSent).toBe(1);
    expect(pushCalls).toHaveLength(2);
    expect(incidents).toHaveLength(2);
  });

  it("sends one push per location, not one per alert", async () => {
    const summary = await scanLocations(
      await getWatchedLocations(),
      async () => [
        makeAlert({ id: "wind-gust", type: "wind", severity: "extreme" }),
        makeAlert({ id: "heavy-rain", type: "flood", severity: "severe" }),
        makeAlert({ id: "thunderstorm", type: "storm", severity: "severe" })
      ],
      T0
    );

    expect(summary.pushesSent).toBe(1);
    expect(pushCalls).toHaveLength(1);
    // The rest are named rather than sent separately.
    expect(pushCalls[0]!.body).toContain("Also expected:");
  });

  it("records an audit row for every decision, including the suppressed ones", async () => {
    const locations = await getWatchedLocations();
    await scanLocations(locations, async () => [makeAlert()], T0);
    await scanLocations(locations, async () => [makeAlert()], minutes(5));

    expect(audits).toHaveLength(2);
    expect(audits.map((row) => `${row.metadata.decision}:${row.metadata.reason}`)).toEqual([
      "notify:new_incident",
      "suppress:already_notified"
    ]);
  });

  it("does not resend when the push fails, but does not mark it delivered either", async () => {
    const locations = await getWatchedLocations();
    pushOutcome = "failed";

    const summary = await scanLocations(locations, async () => [makeAlert()], T0);

    expect(summary.pushesSent).toBe(0);
    expect(summary.pushesFailed).toBe(1);
    // The incident exists but is undelivered, so it is not stuck as notified.
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.deliveredAt).toBeNull();
  });

  it("clears a token Expo reports as no longer registered", async () => {
    pushOutcome = "device_not_registered";

    await scanLocations(await getWatchedLocations(), async () => [makeAlert()], T0);

    expect(watchRows[0]!.pushToken).toBeNull();
  });

  it("keeps scanning after one location fails", async () => {
    watchRows = [{ ...TIRANA }, { ...TOKYO }];
    const locations = await getWatchedLocations();

    const summary = await scanLocations(
      locations,
      async (location) => {
        if (location.name === "Tirana") throw new Error("provider exploded");
        return [makeAlert()];
      },
      T0
    );

    expect(summary.locationsFailed).toBe(1);
    expect(summary.pushesSent).toBe(1);
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]!.token).toBe("ExponentPushToken[tokyo]");
  });

  it("sends nothing when the only alerts are below the push threshold", async () => {
    const summary = await scanLocations(
      await getWatchedLocations(),
      async () => [makeAlert({ severity: "moderate" }), makeAlert({ severity: "minor" })],
      T0
    );

    expect(summary.pushesSent).toBe(0);
    expect(pushCalls).toHaveLength(0);
  });

  it("survives a concurrent scan claiming the same incident number", async () => {
    // The unique constraint on alert_fingerprint rejects the second insert, and
    // that must not abort the pass.
    uniqueViolationOnce = true;

    const summary = await scanLocations(await getWatchedLocations(), async () => [makeAlert()], T0);

    expect(summary.locationsFailed).toBe(0);
    expect(pushCalls).toHaveLength(0);
    expect(audits.some((row) => row.metadata.reason === "concurrent_incident")).toBe(true);
  });

  it("sends to every installation watching a shared location", async () => {
    watchRows = [
      { ...TIRANA },
      { ...TIRANA, installationId: "33333333-3333-4333-8333-333333333333", pushToken: "ExponentPushToken[other]" }
    ];

    await scanLocations(await getWatchedLocations(), async () => [makeAlert()], T0);

    expect(pushCalls).toHaveLength(2);
    // One incident, not one per watcher: a shared location must not buzz twice
    // because two phones saved the same place.
    expect(incidents).toHaveLength(1);
  });
});

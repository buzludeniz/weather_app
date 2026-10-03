import { describe, expect, it } from "vitest";
import {
  buildFingerprint,
  decideAlertDelivery,
  INCIDENT_GAP_MS,
  isIncidentOpen,
  isWithinQuietHours,
  localMinutesAt,
  parseHhMm,
  REMINDER_AFTER_MS,
  type OpenIncident
} from "../../src/features/notifications/alertEvents.service.js";

/**
 * The alert state machine. These are the rules that decide whether a user's
 * phone buzzes, so they are tested directly rather than only through the scan
 * loop. A bug here is the difference between a useful warning and a phone the
 * user silences.
 */

const HOUR = 60 * 60 * 1000;

function incident(overrides: Partial<OpenIncident> = {}): OpenIncident {
  const firstDetectedAt = new Date("2024-06-21T10:00:00.000Z");
  return {
    id: "incident-1",
    alertFingerprint: "fingerprint-1",
    firstDetectedAt,
    lastSeenAt: firstDetectedAt,
    reminderSentAt: null,
    ...overrides
  };
}

describe("decideAlertDelivery", () => {
  it("notifies on the first detection", () => {
    const outcome = decideAlertDelivery(null, {
      severity: "severe",
      detectedAt: new Date("2024-06-21T10:00:00.000Z"),
      isQuietHours: false
    });
    expect(outcome.decision).toBe("notify");
  });

  it("stays silent while the incident continues", () => {
    const outcome = decideAlertDelivery(incident(), {
      severity: "severe",
      detectedAt: new Date("2024-06-21T10:05:00.000Z"),
      isQuietHours: false
    });
    expect(outcome.decision).toBe("suppress");
    expect(outcome.reason).toBe("already_notified");
  });

  it("reminds exactly once after the incident has lasted long enough", () => {
    const started = new Date("2024-06-21T10:00:00.000Z");
    const outcome = decideAlertDelivery(incident({ firstDetectedAt: started }), {
      severity: "severe",
      detectedAt: new Date(started.getTime() + REMINDER_AFTER_MS),
      isQuietHours: false
    });
    expect(outcome.decision).toBe("remind");
  });

  it("does not remind before the interval has elapsed", () => {
    const started = new Date("2024-06-21T10:00:00.000Z");
    const outcome = decideAlertDelivery(incident({ firstDetectedAt: started }), {
      severity: "severe",
      detectedAt: new Date(started.getTime() + REMINDER_AFTER_MS - 5 * 60 * 1000),
      isQuietHours: false
    });
    expect(outcome.decision).toBe("suppress");
  });

  it("does not remind twice", () => {
    const started = new Date("2024-06-21T10:00:00.000Z");
    const alreadyReminded = incident({
      firstDetectedAt: started,
      reminderSentAt: new Date(started.getTime() + REMINDER_AFTER_MS)
    });

    const outcome = decideAlertDelivery(alreadyReminded, {
      severity: "severe",
      detectedAt: new Date(started.getTime() + 12 * HOUR),
      isQuietHours: false
    });

    expect(outcome.decision).toBe("suppress");
  });

  it("notifies again for a new incident of the same type", () => {
    // `null` means the previous incident aged out of the gap window.
    const outcome = decideAlertDelivery(null, {
      severity: "severe",
      detectedAt: new Date("2024-06-28T10:00:00.000Z"),
      isQuietHours: false
    });
    expect(outcome.decision).toBe("notify");
  });

  it("lets severe and extreme alerts through quiet hours", () => {
    for (const severity of ["severe", "extreme"] as const) {
      const outcome = decideAlertDelivery(incident(), {
        severity,
        detectedAt: new Date("2024-06-21T10:05:00.000Z"),
        isQuietHours: true
      });
      // Suppressed only because it was already notified, never because of the
      // hour. Asserting the reason rather than the decision makes that explicit.
      expect(outcome.reason).toBe("already_notified");
    }
  });

  it("suppresses moderate alerts during quiet hours", () => {
    const outcome = decideAlertDelivery(incident(), {
      severity: "moderate",
      detectedAt: new Date("2024-06-21T10:05:00.000Z"),
      isQuietHours: true
    });
    expect(outcome.decision).toBe("suppress");
    expect(outcome.reason).toBe("quiet_hours");
  });

  it("does not suppress a brand new moderate alert for the wrong reason", () => {
    // A first-time alert during quiet hours is still a decision worth
    // recording, and it is suppressed by the hours rather than by duplication.
    const outcome = decideAlertDelivery(null, {
      severity: "moderate",
      detectedAt: new Date("2024-06-21T23:30:00.000Z"),
      isQuietHours: true
    });
    expect(outcome.decision).toBe("notify");
  });
});

describe("isIncidentOpen", () => {
  const detectedAt = new Date("2024-06-21T10:00:00.000Z");

  it("is open immediately after the last detection", () => {
    expect(isIncidentOpen(new Date("2024-06-21T09:59:00.000Z"), detectedAt)).toBe(true);
  });

  it("is open exactly at the gap boundary", () => {
    const lastSeenAt = new Date(detectedAt.getTime() - INCIDENT_GAP_MS);
    expect(isIncidentOpen(lastSeenAt, detectedAt)).toBe(true);
  });

  it("has closed just past the gap boundary", () => {
    const lastSeenAt = new Date(detectedAt.getTime() - INCIDENT_GAP_MS - 1);
    expect(isIncidentOpen(lastSeenAt, detectedAt)).toBe(false);
  });

  it("tolerates a single missed scan", () => {
    // One quiet five-minute scan must not end a storm.
    const lastSeenAt = new Date(detectedAt.getTime() - 5 * 60 * 1000);
    expect(isIncidentOpen(lastSeenAt, detectedAt)).toBe(true);
  });

  it("closes an incident after the full gap", () => {
    const lastSeenAt = new Date(detectedAt.getTime() - 20 * 60 * 1000);
    expect(isIncidentOpen(lastSeenAt, detectedAt)).toBe(false);
  });
});

describe("quiet hours", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseHhMm("00:00")).toBe(0);
    expect(parseHhMm("07:30")).toBe(450);
    expect(parseHhMm("22:00")).toBe(1320);
  });

  it("rejects a malformed time", () => {
    expect(() => parseHhMm("nonsense")).toThrow();
  });

  it("handles a window that wraps midnight, the default 22:00 to 07:00", () => {
    // 23:00 and 03:00 are inside; 12:00 is not.
    expect(isWithinQuietHours(23 * 60, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(3 * 60, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(6 * 60 + 59, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(12 * 60, "22:00", "07:00")).toBe(false);
  });

  it("honours the exact boundaries", () => {
    expect(isWithinQuietHours(22 * 60, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(7 * 60, "22:00", "07:00")).toBe(false);
  });

  it("handles a daytime window that does not wrap", () => {
    expect(isWithinQuietHours(12 * 60, "09:00", "17:00")).toBe(true);
    expect(isWithinQuietHours(8 * 60, "09:00", "17:00")).toBe(false);
    expect(isWithinQuietHours(18 * 60, "09:00", "17:00")).toBe(false);
  });

  it("treats an empty window as quiet hours switched off", () => {
    expect(isWithinQuietHours(3 * 60, "00:00", "00:00")).toBe(false);
  });

  it("evaluates local time at the location, not in UTC", () => {
    // Tirana is UTC+2 in June, so 23:00 UTC is 01:00 local the next day.
    const lateEvening = new Date("2024-06-21T23:00:00.000Z");
    expect(localMinutesAt(lateEvening, "Europe/Tirane")).toBe(60);
    expect(isWithinQuietHours(localMinutesAt(lateEvening, "Europe/Tirane"), "22:00", "07:00")).toBe(true);
  });

  it("applies daylight saving rather than a fixed offset", () => {
    // London is UTC+1 in June (BST) and UTC+0 in January (GMT), so the same UTC
    // instant maps to a different local time across the year. A hardcoded offset
    // would get quiet hours wrong for half the year.
    const june = new Date("2024-06-21T23:30:00.000Z");
    expect(localMinutesAt(june, "Europe/London")).toBe(30); // 00:30 next day

    const january = new Date("2024-01-21T23:30:00.000Z");
    expect(localMinutesAt(january, "Europe/London")).toBe(23 * 60 + 30); // 23:30 same day

    // Tokyo has no daylight saving, so it is a stable +9.
    expect(localMinutesAt(june, "Asia/Tokyo")).toBe(8 * 60 + 30); // 08:30 next day
  });
});

describe("buildFingerprint", () => {
  it("is stable for the same incident", () => {
    expect(buildFingerprint("41.328:19.819", "wind", 1)).toBe(
      buildFingerprint("41.328:19.819", "wind", 1)
    );
  });

  it("differs by location, type, and incident sequence", () => {
    const base = buildFingerprint("41.328:19.819", "wind", 1);
    expect(buildFingerprint("35.676:139.650", "wind", 1)).not.toBe(base);
    expect(buildFingerprint("41.328:19.819", "storm", 1)).not.toBe(base);
    // The sequence is what makes a later incident a new row rather than a
    // permanent suppression of every future wind alert.
    expect(buildFingerprint("41.328:19.819", "wind", 2)).not.toBe(base);
  });
});

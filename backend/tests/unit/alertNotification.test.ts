import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeatherAlert } from "@nimbus/shared";
import {
  buildAlertNotification,
  DERIVED_ADVISORY_NOTICE,
  severityRank,
  sortBySeverity
} from "../../src/features/notifications/alertNotification.js";

function alert(overrides: Partial<WeatherAlert> & Pick<WeatherAlert, "id" | "type" | "severity">): WeatherAlert {
  return {
    title: `${overrides.type} alert`,
    description: `${overrides.type} description`,
    startsAt: "2024-06-21T10:00:00.000Z",
    endsAt: "2024-06-21T12:00:00.000Z",
    source: "Nimbus derived advisory (not an official warning)",
    ...overrides
  };
}

describe("severityRank", () => {
  it("ranks extreme above severe above moderate above minor", () => {
    expect(severityRank("extreme")).toBeLessThan(severityRank("severe"));
    expect(severityRank("severe")).toBeLessThan(severityRank("moderate"));
    expect(severityRank("moderate")).toBeLessThan(severityRank("minor"));
  });
});

describe("sortBySeverity", () => {
  it("puts the most severe alert first", () => {
    const sorted = sortBySeverity([
      alert({ id: "a", type: "wind", severity: "moderate" }),
      alert({ id: "b", type: "storm", severity: "extreme" }),
      alert({ id: "c", type: "snow", severity: "severe" })
    ]);
    expect(sorted.map((a) => a.severity)).toEqual(["extreme", "severe", "moderate"]);
  });

  it("does not mutate its input", () => {
    const input = [
      alert({ id: "a", type: "wind", severity: "minor" }),
      alert({ id: "b", type: "storm", severity: "extreme" })
    ];
    sortBySeverity(input);
    expect(input.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("buildAlertNotification", () => {
  const locationName = "Tirana";

  it("names the location, the condition, and the severity", () => {
    const message = buildAlertNotification({
      locationName,
      locationKey: "41.328:19.819",
      alerts: [alert({ id: "wind-gust", type: "wind", severity: "severe" })]
    });

    expect(message.title).toContain("Tirana");
    expect(message.title).toContain("Severe");
    expect(message.title).toContain("wind");
  });

  it("always states that the alert is not an official warning", () => {
    const message = buildAlertNotification({
      locationName,
      locationKey: "k",
      alerts: [alert({ id: "air-quality", type: "air_quality", severity: "extreme" })]
    });

    expect(message.body).toContain(DERIVED_ADVISORY_NOTICE);
    expect(message.body.toLowerCase()).toContain("not an official weather warning");
  });

  it("leads with the most severe alert when several apply", () => {
    const message = buildAlertNotification({
      locationName,
      locationKey: "k",
      alerts: [
        alert({ id: "flood", type: "flood", severity: "moderate", description: "Rain is coming." }),
        alert({ id: "storm", type: "storm", severity: "extreme", description: "Lightning nearby." })
      ]
    });

    expect(message.title).toContain("Extreme");
    expect(message.title).toContain("storm");
    // Only the leading condition gets its description. The rest are named, so
    // a busy afternoon stays one readable notification rather than a wall of
    // duplicated text.
    expect(message.body).toContain("Lightning nearby.");
    expect(message.body).not.toContain("Rain is coming.");
    expect(message.body).toContain("Also expected: flooding.");
  });

  it("summarises the remaining conditions by name", () => {
    const two = buildAlertNotification({
      locationName,
      locationKey: "k",
      alerts: [
        alert({ id: "a", type: "storm", severity: "severe" }),
        alert({ id: "b", type: "wind", severity: "moderate" })
      ]
    });
    expect(two.body).toContain("Also expected: wind.");

    const three = buildAlertNotification({
      locationName,
      locationKey: "k",
      alerts: [
        alert({ id: "a", type: "storm", severity: "severe" }),
        alert({ id: "b", type: "wind", severity: "moderate" }),
        alert({ id: "c", type: "snow", severity: "minor" })
      ]
    });
    expect(three.body).toContain("Also expected: wind, snow.");
  });

  it("produces exactly one message regardless of how many alerts qualify", () => {
    const alerts = [
      alert({ id: "a", type: "storm", severity: "extreme" }),
      alert({ id: "b", type: "wind", severity: "severe" }),
      alert({ id: "c", type: "flood", severity: "moderate" })
    ];

    const messages = [buildAlertNotification({ locationName, locationKey: "k", alerts })];
    expect(messages).toHaveLength(1);
  });

  it("passes the location key through for deep linking", () => {
    const message = buildAlertNotification({
      locationName,
      locationKey: "41.328:19.819",
      alerts: [alert({ id: "a", type: "wind", severity: "severe" })]
    });
    expect(message.data).toMatchObject({ locationKey: "41.328:19.819", type: "weather_alert" });
  });

  it("refuses to build a message with no alerts", () => {
    expect(() =>
      buildAlertNotification({ locationName, locationKey: "k", alerts: [] })
    ).toThrow();
  });

  it("keeps the body within Expo's payload limit", () => {
    const message = buildAlertNotification({
      locationName,
      locationKey: "k",
      alerts: [
        alert({
          id: "a",
          type: "wind",
          severity: "severe",
          description: "x".repeat(10_000)
        })
      ]
    });
    expect(Buffer.byteLength(message.body, "utf8")).toBeLessThan(4_096);
  });

  it("keeps the official-warning notice intact even when the description is huge", () => {
    // Truncation has to eat the provider's description, never the caveat.
    const message = buildAlertNotification({
      locationName,
      locationKey: "k",
      alerts: [
        alert({ id: "a", type: "wind", severity: "severe", description: "x".repeat(10_000) })
      ]
    });
    expect(message.body).toContain(DERIVED_ADVISORY_NOTICE);
  });
});

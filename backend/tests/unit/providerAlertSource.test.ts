import { describe, expect, it, vi } from "vitest";
import type { WeatherAlert } from "@nimbus/shared";

/**
 * The provenance gate on the push path. See `providerAlerts` for why it exists.
 *
 * R1 found this by asking where a degraded bundle goes once it leaves the web
 * client, and the answer was "a phone". These assertions exist so the gate cannot
 * be deleted without turning the suite red — which is the specific failure mode
 * this project keeps hitting, where a safety check ships untested.
 *
 * `db/pool` and `pushClient` are mocked only because `alertScanner` imports them
 * at module load; nothing here exercises the push path itself.
 */
vi.mock("../../src/db/pool.js", () => ({ query: async () => [] }));
vi.mock("../../src/features/notifications/pushClient.js", () => ({
  sendPush: async () => ({ outcome: "sent", ticketId: "t" })
}));

const severe: WeatherAlert = {
  id: "wind-gust-watch",
  type: "wind",
  title: "Strong wind watch",
  description: "Gusts may make travel and outdoor activity difficult.",
  severity: "severe",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-10-01T02:00:00.000Z",
  source: "Nimbus forecast model"
};

const bundle = {
  source: "openweathermap" as string | undefined,
  alerts: [severe] as WeatherAlert[]
};

vi.mock("../../src/features/weather/weather.service.js", () => ({
  getWeatherBundle: async () => bundle
}));

const { providerAlerts } = await import("../../src/jobs/alertScanner.js");

const WHERE = {
  latitude: 41.3275,
  longitude: 19.8189,
  name: "Tirana",
  timezone: "Europe/Tirane"
};

describe("providerAlerts will not push a fabricated severe warning", () => {
  it("pushes a real severe alert from live provider data", async () => {
    bundle.source = "openweathermap";
    bundle.alerts = [severe];
    const alerts = await providerAlerts(WHERE);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("severe");
  });

  it("returns nothing when the bundle is degraded sample data", async () => {
    // THE REGRESSION THIS EXISTS FOR. The sample provider emits
    // `wind-gust-watch` at `severe` once its synthesised gust passes 60, and
    // `PUSHABLE_SEVERITIES` contains "severe". Before this gate, a bundle that had
    // already failed to reach OpenWeatherMap produced a push notification telling
    // a real person their saved location was in severe wind.
    bundle.source = "sample";
    bundle.alerts = [severe];
    expect(await providerAlerts(WHERE)).toEqual([]);
  });

  it("refuses when provenance is absent, because `source` is optional", async () => {
    // `WeatherBundleSchema` declares `source` optional. An unconfirmed bundle must
    // not claim a phone is in danger — a disabled alert is a far better failure
    // than a fabricated one.
    bundle.source = undefined;
    bundle.alerts = [severe];
    expect(await providerAlerts(WHERE)).toEqual([]);
  });

  it("refuses an unrecognised source value too", async () => {
    bundle.source = "some-other-provider";
    bundle.alerts = [severe];
    expect(await providerAlerts(WHERE)).toEqual([]);
  });

  it("still filters by severity once provenance is confirmed", async () => {
    // The gate must not become a way to push everything: an unconfirmed bundle
    // yields nothing, a confirmed one still yields only severe/extreme.
    bundle.source = "openweathermap";
    bundle.alerts = [
      { ...severe, severity: "moderate" },
      { ...severe, id: "b", severity: "extreme" }
    ];
    const alerts = await providerAlerts(WHERE);
    expect(alerts.map((a) => a.severity)).toEqual(["extreme"]);
  });
});
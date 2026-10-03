import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { buildWeatherBundle, mapLayers } from "../../src/features/weather/provider.js";

describe("weather provider", () => {
  afterEach(() => {
    delete (env as Record<string, unknown>).WEATHER_PROVIDER_API_KEY;
  });

  it("generates a complete 48 hour and 14 day bundle", () => {
    const bundle = buildWeatherBundle({
      id: "test",
      name: "Test City",
      country: "Testland",
      coordinates: { lat: 41.3, lon: 19.8 },
      timezone: "Europe/Tirane",
      isFavorite: false
    });

    expect(bundle.hourly).toHaveLength(48);
    expect(bundle.daily).toHaveLength(14);
    expect(bundle.insights.length).toBeGreaterThan(0);
    expect(bundle.mapLayers.map((layer) => layer.id)).toContain("radar");
  });

  /* The tile credential used to be a literal in frontend/app.js. Two failures
   * came of it: the bundle shipped a live key to every visitor, and that key had
   * been revoked, so all five overlay layers 401'd and the map layers rendered
   * empty. The backend signs the templates now; these lock that in. */
  describe("tile template signing", () => {
    it("appends the configured key to every layer template", () => {
      (env as Record<string, unknown>).WEATHER_PROVIDER_API_KEY = "test-key-123";

      const layers = mapLayers();
      expect(layers.length).toBeGreaterThan(0);

      for (const layer of layers) {
        expect(layer.tileUrlTemplate).toContain("appid=test-key-123");
      }
    });

    it("keeps the {z}/{x}/{y} placeholders intact so Leaflet can substitute", () => {
      (env as Record<string, unknown>).WEATHER_PROVIDER_API_KEY = "test-key-123";

      for (const layer of mapLayers()) {
        expect(layer.tileUrlTemplate).toContain("{z}");
        expect(layer.tileUrlTemplate).toContain("{x}");
        expect(layer.tileUrlTemplate).toContain("{y}");
      }
    });

    it("carries no credential at all when no key is configured", () => {
      delete (env as Record<string, unknown>).WEATHER_PROVIDER_API_KEY;

      for (const layer of mapLayers()) {
        expect(layer.tileUrlTemplate).not.toContain("appid");
      }
    });
  });
});

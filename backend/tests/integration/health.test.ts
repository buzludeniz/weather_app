import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

describe("API routes", () => {
  it("returns weather bundles", async () => {
    const response = await request(createApp())
      .get("/v1/weather/bundle")
      .query({ lat: 41.3275, lon: 19.8189 })
      .expect(200);

    expect(response.body.data.current.temperature).toEqual(expect.any(Number));
    expect(response.body.data.airQuality.aqi).toEqual(expect.any(Number));
  });
});

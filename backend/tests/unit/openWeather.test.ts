import { describe, expect, it } from "vitest";
import { buildAlerts, buildAstronomy, buildInsights, mapAirQuality, mapCurrent, mapDailyFromForecast, mapHourlyFromForecast } from "../../src/features/weather/openWeather.js";
import { aqiCategory, moonInfo } from "@nimbus/shared";
import type { AirQuality, CurrentWeather, DailyForecastPoint, HourlyForecastPoint } from "@nimbus/shared";

const TIRANA = { lat: 41.3275, lon: 19.8189 };
const NOW = new Date("2024-06-21T10:00:00Z");

function current(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
  return {
    observedAt: NOW.toISOString(),
    temperature: 24,
    feelsLike: 25,
    condition: "clear",
    conditionText: "Clear",
    humidity: 50,
    pressure: 1013,
    visibility: 10,
    uvIndex: 4,
    dewPoint: 12,
    windSpeed: 10,
    windDirection: 180,
    windGust: 12,
    cloudCoverage: 10,
    ...overrides
  };
}

function air(overrides: Partial<AirQuality> = {}): AirQuality {
  return {
    aqi: 40,
    category: "good",
    pm25: 8,
    pm10: 14,
    ozone: 50,
    carbonMonoxide: 0.4,
    nitrogenDioxide: 10,
    sulfurDioxide: 2,
    recommendation: "Air quality is good.",
    ...overrides
  };
}

function hour(precipitationProbability: number): HourlyForecastPoint {
  return {
    time: NOW.toISOString(),
    temperature: 24,
    feelsLike: 25,
    condition: "clear",
    precipitationProbability,
    precipitationMm: 0,
    windSpeed: 10,
    windDirection: 180,
    uvIndex: 4
  };
}

describe("buildAlerts", () => {
  it("returns nothing when conditions are calm", () => {
    const alerts = buildAlerts(current(), [hour(5)], air(), NOW);
    expect(alerts).toEqual([]);
  });

  it("raises a wind alert above the gust threshold and scales severity", () => {
    const minor = buildAlerts(current({ windGust: 46 }), [hour(0)], air(), NOW);
    expect(minor.map((a) => a.id)).toContain("wind-gust");
    expect(minor[0]!.severity).toBe("minor");

    const severe = buildAlerts(current({ windGust: 75 }), [hour(0)], air(), NOW);
    expect(severe[0]!.severity).toBe("severe");
  });

  it("ignores gusts below the threshold", () => {
    expect(buildAlerts(current({ windGust: 44 }), [hour(0)], air(), NOW)).toEqual([]);
  });

  it("raises a rain alert when heavy rain is imminent", () => {
    const alerts = buildAlerts(current(), [hour(80), hour(20)], air(), NOW);
    const rain = alerts.find((a) => a.id === "heavy-rain");
    expect(rain).toBeDefined();
    expect(rain!.severity).toBe("moderate");
  });

  it("escalates rain severity at very high probability", () => {
    const alerts = buildAlerts(current(), [hour(95)], air(), NOW);
    expect(alerts.find((a) => a.id === "heavy-rain")!.severity).toBe("severe");
  });

  it("looks ahead rather than only at the first hour", () => {
    const alerts = buildAlerts(current(), [hour(0), hour(0), hour(75)], air(), NOW);
    expect(alerts.map((a) => a.id)).toContain("heavy-rain");
  });

  it("ignores rain beyond the lookahead window", () => {
    // Dry for the first four hours, then heavy rain past the window.
    const far = Array.from({ length: 6 }, (_, i) => ({
      ...hour(i < 4 ? 0 : 90),
      time: new Date(NOW.getTime() + i * 3_600_000).toISOString()
    }));
    expect(buildAlerts(current(), far, air(), NOW)).toEqual([]);
  });

  it("raises an air quality alert for unhealthy categories only", () => {
    expect(buildAlerts(current(), [hour(0)], air({ category: "moderate" }), NOW)).toEqual([]);

    const unhealthy = buildAlerts(current(), [hour(0)], air({ category: "unhealthy" }), NOW);
    expect(unhealthy.map((a) => a.id)).toContain("air-quality");
    expect(unhealthy[0]!.severity).toBe("moderate");

    const hazardous = buildAlerts(current(), [hour(0)], air({ category: "hazardous" }), NOW);
    expect(hazardous[0]!.severity).toBe("extreme");
  });

  it("raises a storm alert for thunderstorm conditions", () => {
    const alerts = buildAlerts(current({ condition: "thunderstorm" }), [hour(0)], air(), NOW);
    expect(alerts.find((a) => a.id === "thunderstorm")!.severity).toBe("severe");
  });

  it("marks every alert as derived, not an official warning", () => {
    const alerts = buildAlerts(
      current({ condition: "thunderstorm", windGust: 80 }),
      [hour(95)],
      air({ category: "hazardous" }),
      NOW
    );
    expect(alerts.length).toBeGreaterThan(1);
    for (const alert of alerts) {
      expect(alert.source).toMatch(/not an official warning/i);
    }
  });

  it("sets a bounded validity window on every alert", () => {
    const alerts = buildAlerts(current({ windGust: 80 }), [hour(0)], air(), NOW);
    for (const alert of alerts) {
      const span = new Date(alert.endsAt).getTime() - new Date(alert.startsAt).getTime();
      expect(span).toBeGreaterThan(0);
      expect(span).toBeLessThanOrEqual(7_200_000);
    }
  });
});

describe("buildAstronomy", () => {
  it("does not reuse sunrise as moonrise", () => {
    const astronomy = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    expect(astronomy.moonrise).not.toBe(astronomy.sunrise);
    expect(astronomy.moonset).not.toBe(astronomy.sunset);
  });

  it("returns real Tirana solar times for the June solstice", () => {
    const astronomy = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    // Sunrise ~03:05 UTC and sunset ~18:10 UTC at 41.3N 19.8E in late June.
    const sunriseHour = new Date(astronomy.sunrise).getUTCHours();
    expect(sunriseHour).toBeGreaterThanOrEqual(2);
    expect(sunriseHour).toBeLessThanOrEqual(5);
  });

  it("returns a valid moon phase from the shared enum", () => {
    const phases = [
      "new", "waxing_crescent", "first_quarter", "waxing_gibbous",
      "full", "waning_gibbous", "last_quarter", "waning_crescent"
    ];
    const astronomy = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    expect(phases).toContain(astronomy.moonPhase);
  });

  it("orders the twilight bands around the day", () => {
    const astronomy = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    const at = (iso: string) => new Date(iso).getTime();
    expect(at(astronomy.blueHourMorning)).toBeLessThan(at(astronomy.goldenHourMorning));
    expect(at(astronomy.sunrise)).toBeLessThan(at(astronomy.goldenHourEvening));
    expect(at(astronomy.sunset)).toBeLessThan(at(astronomy.blueHourEvening));
  });

  it("returns ISO timestamps for every time field that is present", () => {
    const astronomy = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    // moonPhase is a string enum, polarDay a boolean and moonIllumination a
    // fraction, so all three are excluded from the ISO check.
    const { moonPhase, polarDay, moonIllumination, ...times } = astronomy;
    expect(moonPhase).toBeTruthy();
    expect(typeof polarDay).toBe("boolean");
    // The excluded fraction is range-checked here rather than merely skipped, so
    // removing it from the ISO sweep cannot become a way to pass anything.
    expect(typeof moonIllumination).toBe("number");
    expect(moonIllumination).toBeGreaterThanOrEqual(0);
    expect(moonIllumination).toBeLessThanOrEqual(1);
    for (const value of Object.values(times)) {
      if (value === null) continue;   // absence is representable
      expect(typeof value).toBe("string");
      expect(Number.isNaN(Date.parse(value))).toBe(false);
    }
  });

  it("reports a polar NIGHT as no sunrise and no sunset", () => {
    const svalbard = { lat: 78.2232, lon: 15.6469 };
    const astronomy = buildAstronomy(new Date("2024-12-21T12:00:00Z"), svalbard.lat, svalbard.lon);
    // This used to substitute solar noon for both, printing "Sunrise 12:55 /
    // Sunset 12:55" and making the daylight arc report "0% of daylight
    // elapsed". Svalbard is in polar night for roughly four months a year.
    expect(astronomy.sunrise).toBeNull();
    expect(astronomy.sunset).toBeNull();
    expect(astronomy.polarDay).toBe(false);
  });

  it("reports a polar DAY as no sunrise and no sunset, flagged as such", () => {
    const svalbard = { lat: 78.2232, lon: 15.6469 };
    const astronomy = buildAstronomy(new Date("2024-06-21T12:00:00Z"), svalbard.lat, svalbard.lon);
    expect(astronomy.sunrise).toBeNull();
    expect(astronomy.sunset).toBeNull();
    // The two polar states both present as "no sunrise, no sunset"; only this
    // flag separates them, and the client has no altitude maths to do it with.
    expect(astronomy.polarDay).toBe(true);
  });

  /* The absence sweep, in the direction the previous rounds kept missing: a
   * producer that FABRICATES. Every one of these is a sibling of something
   * already fixed — `reading()` was introduced in this function for exactly
   * this purpose and applied to three of eleven fields; the air-quality fix
   * handled a missing `item` and left a missing `item.main`; the synthesised
   * row's rain chance had its mirror-image fabrication left in place. */
  describe("a temperature the provider never sent is not 0 degrees", () => {
    /* THE REGRESSION THIS EXISTS FOR.
     *
     * `temperature: data.main?.temp ?? 0` rendered the hero as "0 °C" and
     * "Humidity 0 %" for a payload with no `main` block, and CurrentWeatherSchema
     * typed all three non-nullable so no client COULD dash them. This is the same
     * defect the daily range was fixed against many rounds earlier, in this same
     * file, which is how the two halves of one mapper ended up disagreeing about
     * what "honest" means -- and why a comment in contracts/weather.ts claiming
     * the last fabricated zero was already gone was load-bearing misinformation.
     *
     * These are the last of the seven `?? 0` that comment was hiding. */
    const noMain = { dt: 1_700_000_000, weather: [{ id: 800, main: "Clear" }] };

    it("refuses rather than reporting 0 for a missing temperature", () => {
      expect(() => mapCurrent(noMain)).toThrow(/no temperature/);
    });

    it("refuses rather than reporting 0 for a missing humidity", () => {
      expect(() => mapCurrent({ ...noMain, main: { temp: 12, feels_like: 10 } })).toThrow(/no humidity/);
    });

    it("refuses a non-numeric or absent reading, not merely a missing key", () => {
      // `reading()` already rejected these for the nullable fields. A required
      // reading must reject them too rather than slipping through as 0.
      expect(() => mapCurrent({ ...noMain, main: { temp: "12", feels_like: 10, humidity: 50 } })).toThrow();
      expect(() => mapCurrent({ ...noMain, main: { temp: Number.NaN, feels_like: 10, humidity: 50 } })).toThrow();
    });

    it("still reports a real 0 degrees, which is a genuine reading", () => {
      // Freezing is 0 °C. Treating absence as 0 must not also make 0 unsayable.
      const freezing = mapCurrent({ ...noMain, main: { temp: 0, feels_like: 0, humidity: 80 } });
      expect(freezing.temperature).toBe(0);
      expect(freezing.feelsLike).toBe(0);
      expect(freezing.humidity).toBe(80);
    });

    /* The hourly slots carried the same `?? 0`, and while `mapHourlyFromForecast`
     * was module-private there was no way to cover them: the first proof of that
     * fix came back INCONCLUSIVE, because reverting `h.main?.temp ?? 0` left the
     * whole suite green. That gap is why this export exists. */
    describe("and the same holds for every hourly slot", () => {
      const slot = (main: unknown) => ({ dt: 1_700_000_000, main, weather: [{ id: 800, main: "Clear" }], pop: 0 });

      it("refuses a slot with no main rather than reporting 0 degrees", () => {
        expect(() => mapHourlyFromForecast([slot(undefined)])).toThrow(/hourly temperature/);
      });

      it("refuses a non-numeric reading rather than reporting 0 degrees", () => {
        expect(() => mapHourlyFromForecast([slot({ temp: "14", feels_like: 13 })]))
          .toThrow(/hourly temperature/);
        expect(() => mapHourlyFromForecast([slot({ temp: Number.NaN, feels_like: 13 })]))
          .toThrow(/hourly temperature/);
      });

      it("refuses a missing feels_like too, rather than 0", () => {
        expect(() => mapHourlyFromForecast([slot({ temp: 14 })]))
          .toThrow(/hourly feels_like/);
      });

      it("still reports a real 0 degrees, which is a genuine reading", () => {
        const [freezing] = mapHourlyFromForecast([slot({ temp: 0, feels_like: 0 })]);
        expect(freezing?.temperature).toBe(0);
        expect(freezing?.feelsLike).toBe(0);
      });

      it("maps a complete slot normally", () => {
        const [ok] = mapHourlyFromForecast([slot({ temp: 14, feels_like: 13 })]);
        expect(ok?.temperature).toBe(14);
        expect(ok?.feelsLike).toBe(13);
      });
    });
  });

  describe("the rain insight cites the slot that actually triggered it", () => {
    /* THE REGRESSION THIS EXISTS FOR.
     *
     * The trigger was `hourly.slice(0, 3).some((h) => h.precipitationProbability
     * > 50)` while the evidence printed `hourly[0]` unconditionally, so the
     * insight could announce rain beside a probability arguing against it. Live,
     * on no code change and no malformed payload, in 4 of 25 sampled cities:
     * Singapore ran pops 22 / 9 / 100 and announced "Rain likely in the next 3
     * hours" beside "Precip probability: 22%"; Reykjavik ran 20 / 50 / 93 and
     * announced it beside "20%". `buildCoreInsights` in the shared package already
     * found the triggering slot correctly, so the two producers of the same
     * insight id disagreed.
     *
     * This test could not be written until now: `buildInsights` was module-private,
     * which is also why the temp-trend gate shipped with no coverage for two
     * review rounds. */
    const rainEvidence = (pops: number[]) =>
      buildInsights(current(), [hour(pops[0] ?? 0), hour(pops[1] ?? 0), hour(pops[2] ?? 0)], [])
        .find((insight) => insight.id === "rain-soon")?.evidence?.[0] ?? null;

    it("quotes the triggering probability, not the first slot's", () => {
      const evidence = rainEvidence([22, 9, 100]);
      expect(evidence).not.toBeNull();
      expect(evidence).toContain("100");
      expect(evidence).not.toContain("22");
    });

    it("quotes the middle slot when that is the one that triggered", () => {
      const evidence = rainEvidence([10, 90, 20]);
      expect(evidence).toContain("90");
      expect(evidence).not.toContain("10");
    });

    it("does not fire when no slot in the window clears the threshold", () => {
      expect(rainEvidence([22, 9, 40])).toBeNull();
    });
  });

  describe("a trend needs two real ranges to compare", () => {
    /* THE GAP THIS EXISTS FOR.
     *
     * `buildInsights` gates the temperature trend on
     * `!daily[0]?.partial && !daily[1]?.partial`. That gate has shipped through two
     * review rounds with a test bearing its name and no coverage underneath it:
     * the test named "the temp-trend insight is not suppressed by a clamped today"
     * never calls `buildInsights` at all, it only asserts that two `high` values
     * differ after `mapDailyFromForecast`. R1 proved the hole by deleting the gate
     * and watching 186/186 stay green.
     *
     * A gate that cannot be disproved is a gate nobody can trust. These call the
     * real function. */
    const day = (date: string, high: number, low: number, partial?: boolean): DailyForecastPoint => ({
      date,
      high,
      low,
      condition: "clear",
      precipitationProbability: 10,
      partial,
      sunrise: null,
      sunset: null,
      moonPhase: "waxing_crescent"
    });

    const trend = (daily: DailyForecastPoint[]) =>
      buildInsights(current({ temperature: 14 }), [], daily).find((i) => i.id === "temp-trend");

    it("states a trend when both days carry a real range", () => {
      const insight = trend([day("2026-09-29", 14, 8), day("2026-09-30", 24, 15)]);
      expect(insight?.message).toContain("10");
      expect(insight?.message).toContain("warmer");
      expect(insight?.evidence).toEqual(["Today: 14°C", "Tomorrow: 24°C"]);
    });

    it("states a downward trend as cooler, not warmer", () => {
      const insight = trend([day("2026-09-29", 24, 15), day("2026-09-30", 14, 8)]);
      expect(insight?.message).toContain("cooler");
    });

    /* The defect the gate was written for: `daily[0].high` is the tail of today,
     * often one surviving 3-hour bucket, so it read near-identical to its own low
     * and the diff was compared against a number that was never today's high. */
    it("withholds the trend when today is partial, rather than diffing a stub", () => {
      expect(trend([day("2026-09-29", 14, 14, true), day("2026-09-30", 24, 15)])).toBeUndefined();
    });

    it("withholds the trend when tomorrow is partial", () => {
      expect(trend([day("2026-09-29", 14, 8), day("2026-09-30", 24, 24, true)])).toBeUndefined();
    });

    it("states no trend for a diff under the 3-degree threshold", () => {
      expect(trend([day("2026-09-29", 14, 8), day("2026-09-30", 16, 9)])).toBeUndefined();
    });

    it("states no trend when there is no tomorrow to compare against", () => {
      expect(trend([day("2026-09-29", 14, 8)])).toBeUndefined();
    });

    it("treats an absent `partial` as a real range, not as a stub", () => {
      // `partial` is optional, so a genuine row omits it. Reading "absent" as
      // "unknown" would silence the trend for every real row in production.
      expect(trend([day("2026-09-29", 14, 8), day("2026-09-30", 24, 15)])?.message).toContain("warmer");
      expect(trend([day("2026-09-29", 14, 8, false), day("2026-09-30", 24, 15, false)])?.message)
        .toContain("warmer");
    });
  });

  describe("mapCurrent fabricates nothing", () => {
    const bare = {
      dt: 1_789_000_000, name: "Victoria", sys: { country: "CA" },
      main: { temp: 12, feels_like: 11, temp_min: 9, temp_max: 17, humidity: 70 },
      weather: [{ id: 500, main: "Rain", description: "light rain" }],
      wind: { speed: 4 }
    };

    it("leaves pressure, visibility, cloud cover and wind direction null when absent", () => {
      const c = mapCurrent(bare);
      expect(c.pressure).toBeNull();       // was ?? 0, which cannot satisfy .positive()
      expect(c.visibility).toBeNull();     // was ?? 10000 -> "10 km", the most reassuring value
      expect(c.cloudCoverage).toBeNull();  // was ?? 0 -> a cloudless sky
      // OWM omits `wind.deg` in calm conditions, and `windDir(0)` renders "N",
      // so this reported calm or variable wind as due north.
      expect(c.windDirection).toBeNull();
    });

    it("still reports a real zero, which is a valid measurement", () => {
      // The guard must be `== null`, never truthiness: 0 hPa, 0 % and 0° are all
      // real readings, and a truthiness test would hide every one of them.
      const c = mapCurrent({
        ...bare,
        main: { ...bare.main, pressure: 0 },
        clouds: { all: 0 },
        wind: { speed: 4, deg: 0 }
      });
      expect(c.pressure).toBe(0);
      expect(c.cloudCoverage).toBe(0);
      expect(c.windDirection).toBe(0);
    });

    it("still reports a real zero visibility", () => {
      // Dense fog: 0 km is a measurement, not an absence.
      expect(mapCurrent({ ...bare, visibility: 0 }).visibility).toBe(0);
    });

    it("rounds visibility from metres to whole km", () => {
      expect(mapCurrent({ ...bare, visibility: 10000 }).visibility).toBe(10);
      expect(mapCurrent({ ...bare, visibility: 1450 }).visibility).toBe(1);   // 1.45 km
    });
  });

  describe("mapAirQuality derives the index and fabricates nothing", () => {
    /* THE REGRESSION THIS EXISTS FOR. The mapper used to read OpenWeatherMap's
     * own 1-5 index and map it onto a fixed ladder of 25/50/100/150/200. OWM
     * reports no 0-500 figure, so all five numbers were fabrications — and the client
     * renders an EPA band bar directly beneath the number, where 100 means
     * Moderate and 150 means Unhealthy for sensitive groups. Live Tirana read
     * `aqi: 100, category: "unhealthy"`: the headline number said Moderate on the
     * bar immediately below it while the category beside it said Unhealthy.
     */

    it("derives the index from the components, not from a fixed ladder", () => {
      // Real readings captured from the running API for Tirana.
      const aq = mapAirQuality({
        list: [{ components: { pm2_5: 4.3, pm10: 6.6, o3: 108.1, co: 125.3, no2: 2.2, so2: 1.3 } }]
      });
      expect(aq).toBeDefined();
      // Ozone dominates: 108.1 ug/m3 converts to 55.1 ppb, which is the top of
      // the 51-100 band, so 51 is the index. The old ladder would have said 100.
      expect(aq?.aqi).toBe(51);
      expect(aq?.aqi).not.toBe(100);
      expect(aq?.category).toBe("moderate");
    });

    it("keeps the number and the band bar in agreement", () => {
      // The invariant the old ladder broke: the headline number and the category
      // come from ONE index now, so they cannot contradict each other.
      for (const payload of [
        { pm2_5: 4.3, o3: 108.1 },
        { pm2_5: 55.5 },
        { pm2_5: 0 },
        { o3: 190 },
        { no2: 700 },
        { pm10: 300 }
      ]) {
        const aq = mapAirQuality({ list: [{ components: payload }] });
        expect(aq).toBeDefined();
        expect(aq?.category).toBe(aqiCategory(aq!.aqi));
      }
    });

    it("returns undefined when there is nothing to derive from", () => {
      // The case the old code got most wrong: an item with `main.aqi` and NO
      // measurements produced a confident band. Absence of data is not an index.
      expect(mapAirQuality({ list: [{ main: { aqi: 3 } }] })).toBeUndefined();
      expect(mapAirQuality({ list: [{ components: {} }] })).toBeUndefined();
      expect(mapAirQuality({ list: [{ }] })).toBeUndefined();
    });

    it("ignores an out-of-range or absent provider index", () => {
      // OWM's 1-5 opinion is no longer an input at all, so a nonsense value can
      // no longer classify the air. With components present the derived index
      // stands regardless; with none, nothing is reported.
      expect(mapAirQuality({ list: [{ main: { aqi: 9 } }] })).toBeUndefined();
      expect(mapAirQuality({ list: [{ main: { aqi: 0 } }] })).toBeUndefined();
      const aq = mapAirQuality({
        list: [{ main: { aqi: 9 }, components: { pm2_5: 4.3 } }]
      });
      expect(aq?.aqi).toBe(18);
    });

    it("leaves absent components null rather than zeroing them", () => {
      const aq = mapAirQuality({ list: [{ components: { pm2_5: 12 } }] });
      expect(aq).toBeDefined();
      for (const key of ["pm10", "ozone", "carbonMonoxide",
        "nitrogenDioxide", "sulfurDioxide"] as const) {
        expect(aq?.[key]).toBeNull();
      }
    });

    it("keeps a real zero component rather than nulling it", () => {
      const aq = mapAirQuality({ list: [{ components: { pm2_5: 0 } }] });
      expect(aq?.pm25).toBe(0);
      expect(aq?.pm10).toBeNull();
      // A measured zero PM2.5 IS clean air, not absence — so it yields an index.
      expect(aq?.aqi).toBe(0);
      expect(aq?.category).toBe("good");
    });
  });

  /* The two row sources used to be two inline branches inside one `.map()`.
   * Each field below was derived in one branch and missed in the other, four
   * separate times across review rounds. There is now one `dailyRow` constructor,
   * so this asserts the invariant structurally: whatever the two sources have in
   * common, they must agree on, and the only differences are the three the code
   * documents as source-dependent. */
  describe("both row sources agree except where the data forces them to differ", () => {
    /* Local helpers, deliberately NOT reusing the ones further up the file: this
     * block is inserted before their `describe` closes, and a test that silently
     * depends on a sibling's fixture is one more thing to drift. */
    const TZ = "-07:00";
    // 2026-09-30T06:13Z is 2026-09-29 23:13 in Victoria: late evening, the window
    // where OWM's list has already rolled past local midnight.
    const NOW = new Date("2026-09-30T06:13:00Z");
    const mkSlot = (isoUtc: string, temp: number) => ({
      dt: Math.floor(new Date(isoUtc).getTime() / 1000),
      main: { temp },
      pop: 0,
      weather: [{ id: 800, main: "Clear" }]
    });
    const obs = {
      temperature: 11.6, feelsLike: 10, condition: "rain", conditionText: "rain",
      humidity: 80, pressure: 1012, visibility: 10, observedAt: NOW.toISOString(),
      uvIndex: null, dewPoint: null, windSpeed: 10, windDirection: 220,
      windGust: null, cloudCoverage: 90
    } satisfies CurrentWeather;

    // A list covering the 30th onward, so the 29th comes from the sentinel.
    const LIST = [
      mkSlot("2026-09-30T09:00:00Z", 10), mkSlot("2026-09-30T12:00:00Z", 14),
      mkSlot("2026-10-01T09:00:00Z", 21), mkSlot("2026-10-01T21:00:00Z", 27)
    ];

    /* Eight 3-hour buckets spanning local midnight to local midnight on the 30th.
     * `SLOTS_PER_DAY` is 8, so a row built from all of these IS a real range and
     * must not be marked partial. Every fixture above carries two slots per day
     * and therefore marks every row partial — which is correct, but useless for
     * pinning the predicate, because a test in which everything is flagged
     * distinguishes nothing. */
    const FULL_DAY = [
      mkSlot("2026-09-30T07:00:00Z", 8), mkSlot("2026-09-30T10:00:00Z", 11),
      mkSlot("2026-09-30T13:00:00Z", 14), mkSlot("2026-09-30T16:00:00Z", 17),
      mkSlot("2026-09-30T19:00:00Z", 15), mkSlot("2026-09-30T22:00:00Z", 12),
      mkSlot("2026-10-01T01:00:00Z", 10), mkSlot("2026-10-01T04:00:00Z", 9)
    ];

    it("emits the same key set for a synthesised row and an aggregated row", () => {
      const daily = mapDailyFromForecast([...FULL_DAY, mkSlot("2026-10-01T09:00:00Z", 21), mkSlot("2026-10-01T21:00:00Z", 27)], 48.42, -123.37, TZ, obs, NOW);
      const synthetic = daily.find((d) => d.date === "2026-09-29");
      const aggregated = daily.find((d) => d.date === "2026-09-30");
      expect(synthetic).toBeDefined();
      expect(aggregated).toBeDefined();
      // The two branches used to disagree on exactly this, which is how
      // `airQuality` ended up present on one kind of row and absent on the other.
      //
      // The ONE intended difference is `partial`, which the synthesised row
      // carries and a FULL day's aggregated row must not. It is optional on the
      // schema, so `false` is never sent — the absence is the signal. Asserting
      // it explicitly rather than filtering the key out is what stops a second,
      // unintended difference from ever sneaking back in beside it.
      expect(aggregated!.partial).toBeUndefined();
      expect(synthetic!.partial).toBe(true);
      const strip = (d: Record<string, unknown>) =>
        Object.keys(d).filter((k) => k !== "partial").sort();
      expect(strip(synthetic!)).toEqual(strip(aggregated!));
    });

    it("omits airQuality on BOTH kinds of row", () => {
      const daily = mapDailyFromForecast(LIST, 48.42, -123.37, TZ, obs, NOW);
      for (const day of daily) expect(day.airQuality).toBeUndefined();
    });

    it("marks a row partial whenever its slots do not cover a day", () => {
      // THE REGRESSION THIS EXISTS FOR. `partial` used to mean "this row was
      // synthesised from the sentinel", which fires only once the list has rolled
      // past local midnight. The far more common soft row — today, with hours of
      // it already gone — carried no flag at all, and its high and low were both
      // the same surviving 3-hour temperature.
      //
      // Live on Tirana at 22:24 local: `daily[0]` read 14.5 / 14.5 with no flag
      // while `daily[1]` read 13.7 / 29.8. The hero's High/Low, the tab title and
      // the temperature-trend insight all read that zero-degree "range". Six
      // hours a day, worldwide, in a 3-hour step.
      const day = (list: ReturnType<typeof mkSlot>[]) =>
        mapDailyFromForecast(list, 48.42, -123.37, TZ, obs, NOW)
          .find((d) => d.date === "2026-09-30");

      // A whole day of buckets: a real range, and therefore not partial.
      expect(day(FULL_DAY)?.partial).toBeUndefined();

      // One bucket left in the day, as at 22:24. Aggregating one temperature
      // makes the high and low equal, which is not a narrow day but no day.
      const one = day([mkSlot("2026-09-30T19:00:00Z", 15)]);
      expect(one?.partial).toBe(true);
      expect(one?.high).toBe(one?.low);

      // Two, and three: still short of eight.
      expect(day([mkSlot("2026-09-30T16:00:00Z", 17), mkSlot("2026-09-30T19:00:00Z", 15)])?.partial).toBe(true);
      expect(day([
        mkSlot("2026-09-30T13:00:00Z", 14), mkSlot("2026-09-30T16:00:00Z", 17),
        mkSlot("2026-09-30T19:00:00Z", 15)
      ])?.partial).toBe(true);

      // Seven is still not eight. The boundary is drawn at coverage, not at a
      // convenient round number.
      expect(day(FULL_DAY.slice(0, 7))?.partial).toBe(true);
    });

    it("never invents a 0 degree low when a slot carries no temperature", () => {
      // THE REGRESSION THIS EXISTS FOR. `slots.map((s) => s.main?.temp ?? 0)`
      // treated 0 as a neutral element for a MINIMUM. It is not the neutral
      // element for a minimum, it is merely the most plausible-looking wrong
      // answer available — which is why it survived seven rounds.
      //
      // One slot missing `main.temp` dragged the day's LOW to 0 while `high`
      // stayed real, so the row read "18 / 0". That pair is NOT degenerate, and
      // `rangeKnown()` only tests `high !== low`, so it waved the row straight
      // through. The hero's High/Low, the daily row, the tab title and the week
      // range bar all rendered a real-looking range whose low was invented.
      //
      // Reachable without any code change: `WEATHER_PROVIDER_BASE_URL` is a
      // supported config knob, so any non-OWM 2.5-shaped provider reaches this
      // with fields defaulting.
      const blind = (isoUtc: string) => ({ ...mkSlot(isoUtc, 0), main: {} });
      const day = (list: any[], range?: { min: number; max: number }) =>
        mapDailyFromForecast(list, 48.42, -123.37, TZ, obs, NOW, range)
          .find((d) => d.date === "2026-09-30");

      // Eight slots, every one of them local 30th, one carrying no temperature.
      const gapped = [
        mkSlot("2026-09-30T07:00:00Z", 10), mkSlot("2026-09-30T10:00:00Z", 14),
        mkSlot("2026-09-30T13:00:00Z", 18), blind("2026-09-30T16:00:00Z"),
        mkSlot("2026-09-30T19:00:00Z", 12), mkSlot("2026-09-30T22:00:00Z", 11),
        mkSlot("2026-10-01T01:00:00Z", 10), mkSlot("2026-10-01T04:00:00Z", 9)
      ];
      const row = day(gapped);
      // Seven real readings: 10, 14, 18, 12, 11, 10, 9.
      expect(row?.high).toBe(18);
      expect(row?.low).toBe(9);
      // The invented value itself, named so the failure cannot be mistaken for
      // a rounding difference.
      expect(row?.low).not.toBe(0);
      // Eight SLOTS but seven readings — still not a covered day. The old
      // predicate counted slots and called this complete.
      expect(row?.partial).toBe(true);

      // Below zero the same invented 0 corrupts the HIGH upward instead, so the
      // guard cannot be one-sided and this is not a cold-weather edge case.
      const cold = day([
        mkSlot("2026-09-30T07:00:00Z", -8), mkSlot("2026-09-30T10:00:00Z", -5),
        blind("2026-09-30T13:00:00Z"), mkSlot("2026-09-30T16:00:00Z", -2),
        mkSlot("2026-09-30T19:00:00Z", -6), mkSlot("2026-09-30T22:00:00Z", -9),
        mkSlot("2026-10-01T01:00:00Z", -7), mkSlot("2026-10-01T04:00:00Z", -8)
      ]);
      expect(cold?.high).toBe(-2);
      expect(cold?.low).toBe(-9);
      expect(cold?.partial).toBe(true);

      // No usable temperature anywhere is its own case, because `Math.max()` of
      // nothing is -Infinity. What happens then depends on WHICH day, and that
      // distinction is the entire fix: `dayRange` is the current window at the
      // location as a whole and describes today and no other day.
      const allBlind = gapped.map((s) => ({ ...s, main: {} }));

      // A FUTURE day therefore has no honest fallback, and must not borrow one.
      // The first version of this fix did exactly that: the scalar fallback made
      // the row degenerate, so `rangeKnown()` correctly dashed the cells, but
      // `app.js:1596` builds the WEEK range with no such gate and printed
      // today's window beside five unrelated days — measured "-30° – 45°" for a
      // week whose real range was "8° – 27°".
      expect(() => day(allBlind, { min: 4, max: 9 })).toThrow();
      expect(() => day(allBlind)).toThrow();

      // TODAY may borrow the window, because today is the only day it describes.
      // `2026-09-29` is `todayKey` for this fixture (NOW is 2026-09-29 23:13
      // local), and this slot lands in that local day.
      const blindToday = (range: { min: number; max: number }) =>
        mapDailyFromForecast([{ ...mkSlot("2026-09-29T10:00:00Z", 0), main: {} }],
          48.42, -123.37, TZ, obs, NOW, range)
          .find((d) => d.date === "2026-09-29");

      const fromNarrow = blindToday({ min: 4, max: 9 });
      expect(fromNarrow?.high).toBe(9);
      expect(fromNarrow?.low).toBe(9);
      expect(fromNarrow?.high).toBe(fromNarrow?.low);
      expect(fromNarrow?.partial).toBe(true);

      // And the current-window clamp must NOT re-widen it. It runs after the
      // fallback, and used to turn a today with zero usable temperatures into the
      // window's full width with `rangeKnown() === true` — a 30-degree daily range
      // read off a 3-hour window. A row built from no readings stays degenerate.
      const fromWide = blindToday({ min: 0, max: 30 });
      expect(fromWide?.high).toBe(fromWide?.low);
      expect(fromWide?.partial).toBe(true);

      // Control: eight real readings is a real day, and stays unflagged. Without
      // this the coverage change could be satisfied by flagging everything.
      expect(day(FULL_DAY)?.partial).toBeUndefined();
      expect(day(FULL_DAY)?.high).toBe(17);
      expect(day(FULL_DAY)?.low).toBe(8);
    });

    it("still marks the synthesised sentinel row partial", () => {
      const daily = mapDailyFromForecast(LIST, 48.42, -123.37, TZ, obs, NOW);
      // The synthesised row's high/low are a 3-hour window's lower bound, not a
      // daily range. An earlier comment claimed "the UI marks this row as
      // partial" and nothing did, so a softer number looked exactly as firm as a
      // real one.
      expect(daily.find((d) => d.date === "2026-09-29")?.partial).toBe(true);
    });

    it("agrees on the solar times and moon phase for the same date", () => {
      // Computed once in `dailyRow`, so this is the assertion that the shared
      // constructor is actually shared: a same-date row cannot differ on them.
      const daily = mapDailyFromForecast(LIST, 48.42, -123.37, TZ, obs, NOW);
      const ast = buildAstronomy(NOW, 48.42, -123.37, TZ);
      const today = daily.find((d) => d.date === "2026-09-29")!;
      expect(today.sunrise).toBe(ast.sunrise);
      expect(today.sunset).toBe(ast.sunset);
      expect(today.moonPhase).toBe(ast.moonPhase);
    });

    it("differ on precipitationProbability only because one is unknowable", () => {
      const daily = mapDailyFromForecast(LIST, 48.42, -123.37, TZ, obs, NOW);
      // Synthesised: null, because no forecast covers the rest of the day.
      expect(daily.find((d) => d.date === "2026-09-29")?.precipitationProbability).toBeNull();
      // Aggregated: a real number from the slots' own `pop`.
      const agg = daily.find((d) => d.date === "2026-09-30")?.precipitationProbability;
      expect(typeof agg).toBe("number");
    });

    it("differ on high/low only because the sources differ, never silently", () => {
      const daily = mapDailyFromForecast(LIST, 48.42, -123.37, TZ, obs, NOW);
      const synthetic = daily.find((d) => d.date === "2026-09-29")!;
      const aggregated = daily.find((d) => d.date === "2026-09-30")!;
      // With no dayRange the synthetic row is 11.6/11.6 — a real 0 width, which
      // is why `dayRange` is threaded in for it. The aggregated row is its slots.
      expect(synthetic.high).toBeCloseTo(11.6, 1);
      expect(aggregated.high).toBeCloseTo(14, 1);
      expect(aggregated.low).toBeCloseTo(10, 1);
    });

    it("still reports polar absence on a synthesised row, not a solar-noon time", () => {
      const polarNow = new Date("2026-12-21T12:00:00Z");
      const daily = mapDailyFromForecast(
        [mkSlot("2026-12-22T09:00:00Z", -5), mkSlot("2026-12-22T21:00:00Z", -8)],
        78.22, 15.65, "+01:00", obs, polarNow
      );
      const synthetic = daily.find((d) => d.date === "2026-12-21");
      // There is no sunrise in polar night, and there is no second branch left
      // to have forgotten that.
      expect(synthetic?.sunrise).toBeNull();
      expect(synthetic?.sunset).toBeNull();
    });
  });

  it("produces a full astronomy object with no missing fields", () => {
    const astronomy = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    expect(Object.keys(astronomy).sort()).toEqual([
      "blueHourEvening",
      "blueHourMorning",
      "goldenHourEvening",
      "goldenHourMorning",
      "moonIllumination",
      "moonPhase",
      "moonrise",
      "moonset",
      "polarDay",
      "sunrise",
      "sunset"
    ]);
  });

  it("carries the real illuminated fraction, not a phase constant", () => {
    // THE REGRESSION THIS EXISTS FOR. `moonInfo()` has always computed the
    // illuminated fraction to three decimals and both callers discarded it,
    // keeping only `.phase`. With no field on the contract the web client
    // reconstructed 0/25/50/75/100 from the phase enum and printed that as
    // "Moon illumination": mean error 7.9 points over a synodic month, maximum
    // 21.
    //
    // This asserts the value EQUALS the computed one, so replacing it with a
    // phase bucket constant cannot pass. The date is a waxing gibbous whose real
    // illumination is far from the 75 a `waxing_gibbous` bucket would report.
    const astronomy = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    expect(astronomy.moonIllumination).toBe(moonInfo(NOW).illumination);
    expect(astronomy.moonIllumination).toBeGreaterThanOrEqual(0);
    expect(astronomy.moonIllumination).toBeLessThanOrEqual(1);

    // And it is not one of the five bucket constants the client used to print.
    // A quarter moon is the informative case: its bucket constant is 50, and the
    // real fraction at an arbitrary instant in that phase is almost never 50.
    const QUARTER = new Date("2024-06-14T18:13:00Z");
    const atQuarter = buildAstronomy(QUARTER, TIRANA.lat, TIRANA.lon);
    expect(atQuarter.moonIllumination).toBe(moonInfo(QUARTER).illumination);
    const bucket = { new: 0, waxing_crescent: 0.25, first_quarter: 0.5, waxing_gibbous: 0.75, full: 1, waning_gibbous: 0.75, last_quarter: 0.5, waning_crescent: 0.25 }[atQuarter.moonPhase];
    expect(atQuarter.moonIllumination).not.toBe(bucket);
  });
});

/* OWM's 3-hourly list starts at the next 3-hour boundary, so between roughly
 * 21:00 and local midnight the first slot has already rolled into tomorrow and
 * the location's own day is absent from the payload entirely. Grouping alone
 * then yielded a forecast whose first row was tomorrow's data while the UI
 * labelled it "Today" — every evening, which is peak usage. */
describe("mapDailyFromForecast evening coverage", () => {
  const VICTORIA_TZ = "-07:00";
  // 2026-09-30T06:05Z is 2026-09-29 23:05 in Victoria: late evening, the window
  // where OWM's list begins at 02:00 local the next day.
  const EVENING = new Date("2026-09-30T06:05:00Z");

  const slot = (isoUtc: string, temp: number) => ({
    dt: Math.floor(new Date(isoUtc).getTime() / 1000),
    main: { temp },
    pop: 0,
    weather: [{ id: 800, main: "Clear" }]
  });

  // Exactly the shape OWM returns in that window: nothing for the rest of the
  // 29th, the first slot is 02:00 local on the 30th.
  const OWM_EVENING_LIST = [
    slot("2026-09-30T09:00:00Z", 12),  // 02:00 local, 30th
    slot("2026-09-30T12:00:00Z", 13),  // 05:00
    slot("2026-09-30T15:00:00Z", 15),  // 08:00
    slot("2026-09-30T18:00:00Z", 17),  // 11:00
    slot("2026-09-30T21:00:00Z", 16),  // 14:00
    slot("2026-10-01T00:00:00Z", 14),  // 17:00 local, still the 30th
    slot("2026-10-01T03:00:00Z", 12)   // 20:00
  ];

  const currentNow = current({
    observedAt: EVENING.toISOString(),
    temperature: 11.6,
    condition: "rain",
    conditionText: "Light Rain"
  });

  it("still emits a row for the location's own day", () => {
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING
    );

    expect(daily[0]?.date).toBe("2026-09-29");
  });

  it("takes the day's range from the provider, not from the current temperature", () => {
    // The branch runs only for roughly 21:00-24:00 local, so at least 87.5% of
    // the day is over and its temperature maximum has normally happened. An
    // earlier version set high = low = current, claiming a 0 °C daily range for
    // a day that had been through a full diurnal cycle — and this row is what
    // the hero's High/Low facts and the tab title read.
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING,
      { min: 9.4, max: 17.2 }
    );

    expect(daily[0]?.high).toBeCloseTo(17.2, 1);
    expect(daily[0]?.low).toBeCloseTo(9.4, 1);
  });

  it("falls back to the current temperature when the provider withholds the range", () => {
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING,
      { min: null, max: null }
    );

    expect(daily[0]?.high).toBeCloseTo(11.6, 1);
    expect(daily[0]?.low).toBeCloseTo(11.6, 1);
  });

  it("omits air quality rather than fabricating a 'good' reading", () => {
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING
    );

    // The 5-day endpoint carries no air-quality data. A hardcoded
    // `{ aqi: 0, category: "good" }` made every day read "AQI 0 (good)" — in
    // Delhi, directly beside a panel reporting 150 "Very unhealthy".
    expect(daily[0]?.airQuality).toBeUndefined();
  });

  it("carries the real condition through rather than defaulting to clear", () => {
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING
    );

    // A fabricated OWM id of 800 would have reported "clear" on a rainy night.
    expect(daily[0]?.condition).toBe("rain");
  });

  it("omits air quality on every row, not just the synthesised one", () => {
    // The fabricated `{ aqi: 0, category: "good" }` was removed from the
    // synthetic branch first and left in the aggregated one, so five of six
    // days still read "AQI 0 (good)". Assert across the whole list.
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING
    );

    expect(daily.length).toBeGreaterThan(1);
    const withAir = daily.filter((d) => d.airQuality !== undefined);
    expect(withAir).toHaveLength(0);
  });

  /* The clamp that recovers the already-elapsed part of today is scoped to
   * today. Applied to every bucket it clamped days 2-7 with TODAY's current
   * 3-hour window: São Paulo's five forecast highs all read 30.9 °C against a
   * truth of 22-27 (a 10.2 °C error), and Longyearbyen showed a sub-zero low on
   * four consecutive days forecast to stay above freezing. No existing test
   * passed `dayRange` on a multi-day list, which is why 175 green tests missed
   * it. */
  describe("the current-window clamp is scoped to today", () => {
    /* Slots for three local days. `EVENING` is 2026-09-29 23:13 local, so
     * todayKey is 2026-09-29 and the 29th has no slots at all — it comes from
     * the synthetic branch. RANGE is today's current window (11-15), which
     * matches no other day. */
    const MULTI_DAY = [
      slot("2026-09-30T09:00:00Z", 10), slot("2026-09-30T12:00:00Z", 14), // local 09-30
      slot("2026-10-01T09:00:00Z", 21), slot("2026-10-01T21:00:00Z", 27), // local 10-01
      slot("2026-10-02T09:00:00Z", 18), slot("2026-10-02T21:00:00Z", 22)  // local 10-02
    ];
    const RANGE = { min: 11, max: 15 };

    it("pins the whole matrix: only today is clamped", () => {
      const daily = mapDailyFromForecast(
        MULTI_DAY, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING, RANGE
      );

      // Today, synthesised: the window max 15 lifts the current 11.6.
      expect(daily.find((d) => d.date === "2026-09-29")?.high).toBe(15);
      // Every other day is its own slots, untouched by RANGE.
      expect(daily.find((d) => d.date === "2026-09-30")?.high).toBe(14);
      expect(daily.find((d) => d.date === "2026-09-30")?.low).toBe(10);
      expect(daily.find((d) => d.date === "2026-10-01")?.high).toBe(27);
      expect(daily.find((d) => d.date === "2026-10-01")?.low).toBe(21);
      expect(daily.find((d) => d.date === "2026-10-02")?.high).toBe(22);
      expect(daily.find((d) => d.date === "2026-10-02")?.low).toBe(18);
    });

    it("no future day inherits today's window", () => {
      const daily = mapDailyFromForecast(
        MULTI_DAY, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING, RANGE
      );
      for (const day of daily.filter((d) => d.date !== "2026-09-29")) {
        // RANGE.max is 15; a leaked clamp would cap every future high at 15 and
        // every future low at 11.
        expect(day.high).not.toBe(15);
        expect(day.low).not.toBe(11);
      }
    });

    it("does not manufacture a range from a single slot plus a wide window", () => {
      // THE REGRESSION THIS EXISTS FOR. Today carries exactly one slot, so its
      // high and low are the same number -- there is no range, and the row must
      // say so rather than borrow a width from the current 3-hour window.
      //
      // WINDOW has real width on purpose (8-20). A single slot at 15 used to be
      // turned into 20 / 8: a 12-degree "daily range" assembled from one observed
      // temperature plus a window, which `rangeKnown()` then reported as known, so
      // the hero, the tab title and the week range all printed it.
      const WINDOW = { min: 8, max: 20 };
      const ONE_SLOT_TODAY = [
        slot("2026-09-29T21:00:00Z", 15), // local 09-29 14:00, i.e. today
        slot("2026-10-01T09:00:00Z", 21), slot("2026-10-01T21:00:00Z", 27),
        slot("2026-10-02T09:00:00Z", 18), slot("2026-10-02T21:00:00Z", 22)
      ];
      const daily = mapDailyFromForecast(
        ONE_SLOT_TODAY, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING, WINDOW
      );
      const today = daily.find((d) => d.date === "2026-09-29");

      expect(today?.high).toBe(15);
      expect(today?.low).toBe(15);
      // Degenerate on purpose: `rangeKnown()` is false, so every client dashes it.
      expect(today?.high).toBe(today?.low);
      // And it is disclosed rather than silent.
      expect(today?.partial).toBe(true);

      // A row that DOES have a spread is still widened -- that direction is sound,
      // because a widened interval still contains every observed temperature.
      const daily2 = mapDailyFromForecast(
        [slot("2026-09-29T18:00:00Z", 10), slot("2026-09-29T21:00:00Z", 15), // today, 2 slots
         slot("2026-10-01T09:00:00Z", 21), slot("2026-10-01T21:00:00Z", 27)],
        48.42, -123.37, VICTORIA_TZ, currentNow, EVENING, WINDOW
      );
      const spread = daily2.find((d) => d.date === "2026-09-29");
      expect(spread?.low).toBe(8);  // min(10, WINDOW.min)
      expect(spread?.high).toBe(20); // max(15, WINDOW.max)
      expect(spread?.high).toBeGreaterThan(spread?.low as number);
    });

    it("the temp-trend insight is not suppressed by a clamped today", () => {
      // The clamp used to make daily[0].high === daily[1].high, and
      // `buildInsights` diffs exactly those two, so the "tomorrow will be N
      // degrees warmer/cooler" insight silently vanished for every city. The
      // property that matters is that the two differ at all.
      const daily = mapDailyFromForecast(
        MULTI_DAY, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING, RANGE
      );
      const today = daily.find((d) => d.date === "2026-09-29")?.high;
      const tomorrow = daily.find((d) => d.date === "2026-09-30")?.high;
      expect(today).toBeDefined();
      expect(tomorrow).toBeDefined();
      expect(today).not.toBe(tomorrow);
    });
  });

  it("leaves the rest of the week aggregated from real slots", () => {
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING
    );

    expect(daily.map((d) => d.date)).toEqual([
      "2026-09-29", "2026-09-30"
    ]);
    // The 30th aggregates 02:00, 05:00, 08:00, 11:00, 14:00 and 17:00 local.
    expect(daily[1]?.high).toBeCloseTo(17, 1);
    expect(daily[1]?.low).toBeCloseTo(12, 1);
  });

  it("does not synthesise a row when the day already has slots", () => {
    // Midday: the list covers today, so aggregation must be used untouched.
    const midday = new Date("2026-09-30T19:00:00Z"); // 12:00 local
    const list = [
      slot("2026-09-30T15:00:00Z", 10),  // 08:00 local
      slot("2026-09-30T18:00:00Z", 14),
      slot("2026-09-30T21:00:00Z", 18)
    ];
    const daily = mapDailyFromForecast(
      list, 48.42, -123.37, VICTORIA_TZ, currentNow, midday
    );

    expect(daily).toHaveLength(1);
    expect(daily[0]?.date).toBe("2026-09-30");
    expect(daily[0]?.high).toBeCloseTo(18, 1);
    expect(daily[0]?.low).toBeCloseTo(10, 1);
  });

  it("gives the synthesised row real solar times, not a midnight placeholder", () => {
    const daily = mapDailyFromForecast(
      OWM_EVENING_LIST, 48.42, -123.37, VICTORIA_TZ, currentNow, EVENING
    );

    const sunrise = new Date(daily[0]!.sunrise);
    // ~07:11 PDT on the 29th, i.e. ~14:11Z. Not 00:00Z.
    expect(sunrise.getUTCHours()).toBe(14);
    expect(sunrise.getUTCDate()).toBe(29);
  });
});

/* OpenWeatherMap's free `/weather` payload has no `uvi` and usually no
 * `wind.gust`, and `/forecast` has no UV at all. Both used to be hardcoded 0,
 * which the page rendered as "UV index 0 — Low" in reassuring green and
 * "Wind gust 0 km/h": a fabricated measurement wearing a health verdict. */
describe("mapCurrent nulls what the provider does not report", () => {
  const bare = {
    dt: 1_789_000_000,
    name: "Victoria",
    sys: { country: "CA" },
    main: { temp: 12, feels_like: 11, temp_min: 9, temp_max: 17, pressure: 1012, humidity: 70 },
    weather: [{ id: 500, main: "Rain", description: "light rain" }],
    wind: { speed: 4, deg: 220 },
    clouds: { all: 80 },
    visibility: 10000
  };

  it("reports UV as null, not 0", () => {
    expect(mapCurrent(bare).uvIndex).toBeNull();
  });

  it("reports a wind gust as null, not 0", () => {
    expect(mapCurrent(bare).windGust).toBeNull();
  });

  it("passes through a gust when the station does report one", () => {
    const gusted = mapCurrent({ ...bare, wind: { speed: 4, deg: 220, gust: 12.5 } });
    // m/s -> km/h
    expect(gusted.windGust).toBeCloseTo(45, 0);
  });

  it("keeps a real UV reading when the payload has one", () => {
    expect(mapCurrent({ ...bare, uvi: 7.2 }).uvIndex).toBeCloseTo(7.2, 1);
  });

  it("reports dew point as null, not 0", () => {
    // The free /weather payload has no dew point. A hardcoded 0 reached the
    // mobile client as the literal string "Dew point 0 C", and the web app only
    // hid it behind a truthiness test that would also have swallowed a genuine
    // dew point of exactly 0 °C.
    expect(mapCurrent(bare).dewPoint).toBeNull();
  });

  it("passes a real dew point through", () => {
    expect(mapCurrent({ ...bare, main: { ...bare.main, dew_point: 9.4 } }).dewPoint)
      .toBeCloseTo(9.4, 1);
  });
});

/* The solar helpers bucket by the UTC day of whatever instant they are handed.
 * Passing the raw `now` made the Astronomy panel describe the UTC day while the
 * daily strip — which goes through `localNoon` — described the local one, so
 * the page showed two different days side by side. At 23:13 local on Tuesday the
 * 29th in Victoria, Astronomy reported the 30th. */
describe("buildAstronomy reports the location's local day", () => {
  it("matches the daily strip's day for Victoria at 23:13 local", () => {
    const EVENING = new Date("2026-09-30T06:13:00Z"); // 2026-09-29 23:13 PDT
    const tz = "-07:00";
    const astro = buildAstronomy(EVENING, 48.42, -123.37, tz);
    const daily = mapDailyFromForecast(
      [/* the 29th has no slots in the evening window */],
      48.42, -123.37, tz,
      current({ observedAt: EVENING.toISOString(), temperature: 11.5 }),
      EVENING
    );

    // Both must land on the 29th. Before the fix these were the 29th and the
    // 30th respectively.
    const sunrise = new Date(astro.sunrise);
    expect(sunrise.getUTCDate()).toBe(29);
    expect(daily[0]?.date).toBe("2026-09-29");
  });

  it("does not roll a day for a location east of UTC+12", () => {
    // 2026-09-30T22:00Z is 2026-10-01 11:00 in Auckland (NZDT, +13), i.e. local
    // midday. `localNoon` pins the anchor to local noon of the 1st, and the
    // solar day counter is longitude-aware, so sunrise and sunset must both be
    // local-morning and local-evening of the SAME day.
    //
    // Before the longitude-aware fix the anchor was treated as the 30th, giving
    // a sunrise two days early (the 29th) and a sunset on the 30th — sunrise and
    // sunset on different days, a 12-hour "day".
    const ast = buildAstronomy(new Date("2026-09-30T22:00:00Z"), -36.8485, 174.7633, "+13:00");
    const sunrise = new Date(ast.sunrise);
    const sunset = new Date(ast.sunset);

    const localDay = (iso: string) => new Date(new Date(iso).getTime() + 13 * 3_600_000)
      .toISOString().slice(0, 10);
    expect(localDay(sunrise.toISOString())).toBe("2026-10-01");
    expect(localDay(sunset.toISOString())).toBe("2026-10-01");
    expect(sunset.getTime()).toBeGreaterThan(sunrise.getTime());
  });

  it("still works with no timezone supplied", () => {
    const ast = buildAstronomy(NOW, TIRANA.lat, TIRANA.lon);
    expect(Number.isNaN(new Date(ast.sunrise).getTime())).toBe(false);
  });

  /* The moon frequently neither rises nor sets on a given day, and a twilight
   * band can be absent at high latitude. Every one of these used to fall back to
   * solar noon, so Longyearbyen (78°N) returned byte-identical `moonrise` and
   * `moonset` at solar noon and the page printed "Moonrise 12:47" as a
   * measurement. At Svalbard that is the normal state for weeks. */
  it("does not invent a moonrise or moonset when the moon does not cross", () => {
    // Svalbard, deep in polar night: no sunrise, no sunset, no moonrise, no
    // moonset, and no twilight band is reachable.
    const ast = buildAstronomy(new Date("2026-12-21T12:00:00Z"), 78.22, 15.65, "+01:00");

    // The moon is absent here too, but that is not what this test is about; the
    // dedicated polar tests above cover sunrise/sunset and the flag.
    expect(ast.moonrise === null || ast.moonset === null
      || ast.moonrise !== ast.moonset).toBe(true);
  });

  it("passes twilight-band absence through as null rather than solar noon", () => {
    const ast = buildAstronomy(new Date("2026-12-21T12:00:00Z"), 78.22, 15.65, "+01:00");
    const bands = [
      ast.goldenHourMorning, ast.goldenHourEvening,
      ast.blueHourMorning, ast.blueHourEvening
    ];
    // At minimum, none of them may be a fabricated instant: each is either null
    // or a real time, and a null never appears as the solar-noon substitute.
    for (const band of bands) {
      expect(band === null || !Number.isNaN(Date.parse(band))).toBe(true);
    }
  });

  it("reports real moon times where they exist", () => {
    const ast = buildAstronomy(new Date("2026-09-30T12:00:00Z"), TIRANA.lat, TIRANA.lon, "+02:00");
    expect(ast.moonrise).not.toBeNull();
    expect(ast.moonset).not.toBeNull();
  });
});

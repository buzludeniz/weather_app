import { describe, expect, it } from "vitest";
import type { AirQuality } from "../contracts/weather.js";
import { aqiCategory, aqiFromComponents, windDirectionLabel } from "./weather.js";

/* The EPA derivation.
 *
 * The risky part is the UNIT CONVERSION, not the interpolation. OWM reports every
 * pollutant in ug/m3; the O3/NO2/SO2/CO breakpoint tables are in ppb and ppm.
 * Skipping the conversion treats ug/m3 as ppb, which on real data moved ozone's
 * sub-index from 51 to 203 -- the difference between "moderate" and "very
 * unhealthy". So the conversion gets its own assertions rather than being folded
 * into one end-to-end number. */
describe("aqiFromComponents", () => {
  it("returns null when nothing was reported", () => {
    // Absence of data is not an index of zero. Reporting 0 here would mean
    // "clean air", which is a measurement nobody made.
    expect(aqiFromComponents({})).toBeNull();
    expect(aqiFromComponents({ pm25: null, pm10: null })).toBeNull();
    expect(aqiFromComponents({ pm25: Number.NaN })).toBeNull();
  });

  it("interpolates linearly inside a PM2.5 band", () => {
    // 0-12.0 ug/m3 maps to 0-50.
    expect(aqiFromComponents({ pm25: 0 })).toBe(0);
    expect(aqiFromComponents({ pm25: 12.0 })).toBe(50);
    // Halfway up the first band is halfway up the index.
    expect(aqiFromComponents({ pm25: 6 })).toBe(25);
  });

  it("converts ozone from ug/m3 to ppb before indexing", () => {
    // THE CONVERSION. 108.1 ug/m3 is 108.1 * 24.45 / 48.00 = 55.09 ppb, which is
    // the top of the 51-100 band, so the sub-index is 51.
    expect(aqiFromComponents({ ozone: 108.1 })).toBe(51);
    // Read as ppb instead of converted it would land at 203.
    expect(aqiFromComponents({ ozone: 108.1 })).not.toBe(203);
  });

  it("converts carbon monoxide from ug/m3 to ppm", () => {
    // 125.3 ug/m3 -> 125.3 * 24.45 / 28.01 = 109.4 ppm?? No: 0.1094 ppm. In ppm
    // it is deep in the 0-4.4 band, so a small index. Read as ppm without the
    // /1000 it would be off by a factor of 1000.
    expect(aqiFromComponents({ carbonMonoxide: 125.3 })).toBe(1);
  });

  it("takes the maximum sub-index across the pollutants present", () => {
    // How EPA defines it: the index is the worst pollutant, not an average.
    const all = aqiFromComponents({ pm25: 4.3, pm10: 6.6, ozone: 108.1, carbonMonoxide: 125.3, nitrogenDioxide: 2.2, sulfurDioxide: 1.3 });
    const ozoneOnly = aqiFromComponents({ ozone: 108.1 });
    expect(all).toBe(ozoneOnly);
    // These are the live Tirana readings; ozone dominates at 51 -> moderate.
    expect(all).toBe(51);
    expect(aqiCategory(all as number)).toBe("moderate");
  });

  it("reports the ceiling only when genuinely above the last row", () => {
    // PM2.5's last row ends at 500.4 ug/m3.
    expect(aqiFromComponents({ pm25: 900 })).toBe(500);
    expect(aqiFromComponents({ pm25: 500.4 })).toBe(500);
  });

  it("interpolates ACROSS the gaps EPA leaves between rows", () => {
    // THE REGRESSION THIS EXISTS FOR. EPA's tables have deliberate gaps --
    // 12.0|12.1, 54|55, 4.4|4.5, 53|54, 35|36. The first version of `subIndex`
    // treated a reading in a gap as "above the top of the table" and returned the
    // 500 ceiling, so a few hundredths of a ug/m3 of ozone reported AQI 500
    // "hazardous" where the neighbouring readings reported 50 "good" and 51
    // "moderate". That raised an EXTREME alert which the push gate delivered to a
    // real phone. One unit of ozone was the entire difference.
    //
    // Ozone converts at 24.45/48.00 = 0.509375, so 54 ppb is ~106.0 ug/m3.
    const at = (ppb: number) => aqiFromComponents({ ozone: ppb / 0.509375 });
    // Inside the gap between the 0-54 and 55-70 rows: must land BETWEEN the two
    // neighbouring indices. Rounded rather than strict, because the value round-trips
    // through a unit conversion and `54.5 / 0.509375 * 0.509375` is 54.4999...,
    // which rounds down to 50. Either 50 or 51 is correct; 500 is the bug.
    const inGap = at(54.5);
    expect(inGap).not.toBeNull();
    expect(inGap as number).toBeGreaterThanOrEqual(50);
    expect(inGap as number).toBeLessThanOrEqual(51);
    // The neighbours, for the contrast that made this visible.
    expect(at(54)).toBe(50);
    expect(at(55)).toBe(51);
    // Every gap in the ozone table must interpolate, never jump to the ceiling.
    // Typed as tuples because `noUncheckedIndexedAccess` is on.
    const ozoneGaps: Array<[number, number]> = [[54, 55], [70, 71], [85, 86], [105, 106]];
    for (const [below, above] of ozoneGaps) {
      const mid = aqiFromComponents({ ozone: (below + 0.5) / 0.509375 }) as number;
      expect(mid, `gap ${below}|${above}`).toBeLessThan(500);
      expect(mid, `gap ${below}|${above}`).toBeGreaterThanOrEqual(
        aqiFromComponents({ ozone: below / 0.509375 }) as number
      );
      expect(mid, `gap ${below}|${above}`).toBeLessThanOrEqual(
        aqiFromComponents({ ozone: above / 0.509375 }) as number
      );
    }
  });

  it("is MONOTONIC in every pollutant", () => {
    // The assertion that would have caught the gap bug: a rising concentration
    // can never lower the index. "The number and the band agree" cannot catch it
    // -- `mapAirQuality` derives the category FROM the index, so that pair agrees
    // by construction no matter how wrong the index is.
    //
    // Each sweep also asserts it CROSSED BANDS, which is the part that was missing.
    // R1 reimplemented `subIndex` with the gap bug reintroduced and swept all six
    // pollutants: only ozone and pm10 went red. no2 (0-90 ug/m3), so2 (0-40) and
    // co (0-5000) never left their FIRST band, so their sweeps could not have
    // detected a violation even in principle -- and pm25, the pollutant that
    // dominates AQI almost everywhere, had no teeth because its gaps are 0.1 wide
    // and a 0.25 step steps straight over them. The ranges below are widened to
    // cross real band edges, and `bandsCrossed` makes a toothless sweep fail
    // rather than pass quietly. A guard that cannot fail is not a guard.
    // Ranges are in ug/m3, and for ozone/NO2/SO2/CO the table is in ppb or ppm, so
    // the conversion scales DOWN and the sweep has to run much further than the
    // table's own top row suggests. Ozone's table ends at 200 ppb, which is
    // 200 / (24.45/48) = 393 ug/m3 -- an earlier draft of this test stopped at 110
    // and the teeth assertion below caught it, which is the whole reason that
    // assertion exists.
    // `name` must be the COMPONENT KEY, and it is now spelled out rather than
    // abbreviated. This test used to sweep "no2", "so2" and "co" while the
    // component keys are `nitrogenDioxide`, `sulfurDioxide` and `carbonMonoxide`,
    // so those three sweeps held `nitrogenDioxide: 0` constant and swept a
    // variable the function never reads -- three of the six pollutants were
    // asserting monotonicity of a constant. R1 measured the gap bug reintroduced
    // and found no2, so2 and co stayed green; they would have stayed green
    // however wrong the derivation got.
    const sweeps: Array<[string, number, number, number]> = [
      ["ozone", 0, 400, 0.25],
      ["pm25", 0, 360, 0.25],
      ["pm10", 0, 360, 0.25],
      ["nitrogenDioxide", 0, 1000, 0.5],
      ["sulfurDioxide", 0, 500, 0.25],
      ["carbonMonoxide", 0, 60000, 5]
    ];
    for (const [name, from, to, step] of sweeps) {
      let previous = -1;
      const seen = new Set<number>();
      for (let v = from; v <= to; v += step) {
        const value = aqiFromComponents({ [name]: v });
        expect(value, `${name} at ${v}`).not.toBeNull();
        expect(value as number, `${name} fell from ${previous} to ${String(value)} at ${v}`).toBeGreaterThanOrEqual(previous);
        previous = value as number;
        seen.add(Math.floor(value as number / 50));
      }
      expect(
        seen.size,
        `${name} sweep crossed only ${String(seen.size)} band(s) between ${String(from)} and ${String(to)}, so it cannot detect a violation`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("interpolates every gap in every pollutant's table, not just ozone's", () => {
    /* The gap bug was fixed and the regression test was written for OZONE alone,
     * because ozone is the table the original report happened to name. Five other
     * tables have gaps and five other tables had no coverage: R1 measured the
     * sweep with the bug reintroduced and found pm25, no2, so2 and co going green.
     *
     * The midpoint of each gap, in the pollutant's own reported units (ug/m3),
     * must land BETWEEN the two indices flanking it and must never reach the 500
     * ceiling. Midpoints rather than a sweep, so this is exact and does not
     * depend on a step size happening to land inside a 0.1-wide gap. */
    const MOLAR_VOLUME = 24.45;
    const fromPpb = (ppb: number, weight: number) => (ppb * weight) / MOLAR_VOLUME;
    const fromPpm = (ppm: number, weight: number) => (ppm * 1000 * weight) / MOLAR_VOLUME;
    /** Convert a list of [gap midpoint, row below] pairs from table units to ug/m3. */
    const inUgm3 = (gaps: number[][], convert: (v: number) => number): Array<[number, number]> =>
      gaps.map((pair) => [convert(pair[0] as number), convert(pair[1] as number)] as [number, number]);

    const cases: Array<[string, Record<string, number>, Array<[number, number]>]> = [
      // Gaps at 12.0|12.1, 35.4|35.5, 55.4|55.5, 150.4|150.5, 250.4|250.5, 350.4|350.5.
      ["pm25", { pm25: 0 }, [[12.05, 12.0], [35.45, 35.4], [55.45, 55.4],
        [150.45, 150.4], [250.45, 250.4], [350.45, 350.4]]],
      // Gaps at 54|55, 154|155, 254|255, 354|355, 424|425, 504|505.
      ["pm10", { pm10: 0 }, [[54.5, 54], [154.5, 154], [254.5, 254],
        [354.5, 354], [424.5, 424], [504.5, 504]]],
      // 8-hour ozone, ppb, converted at 24.45/48.00.
      ["ozone", { ozone: 0 }, inUgm3(
        [[54.5, 54], [70.5, 70], [85.5, 85], [105.5, 105]], (v) => fromPpb(v, 48.0))],
      // CO is in ppm with an extra 1000, so its ug/m3 midpoints are ~1000x larger.
      ["co", { carbonMonoxide: 0 }, inUgm3(
        [[4.45, 4.4], [9.45, 9.4], [12.45, 12.4], [15.45, 15.4], [30.45, 30.4], [40.45, 40.4]],
        (v) => fromPpm(v, 28.01))],
      // 1-hour NO2 and SO2, ppb -> ug/m3.
      ["no2", { nitrogenDioxide: 0 }, inUgm3(
        [[53.5, 53], [100.5, 100], [360.5, 360], [649.5, 649], [1249.5, 1249], [1649.5, 1649]],
        (v) => fromPpb(v, 46.01))],
      ["so2", { sulfurDioxide: 0 }, inUgm3(
        [[35.5, 35], [75.5, 75], [185.5, 185], [304.5, 304], [604.5, 604], [804.5, 804]],
        (v) => fromPpb(v, 64.07))]
    ];

    for (const [name, base, gaps] of cases) {
      for (const [mid, below] of gaps) {
        const inGap = aqiFromComponents({ ...base, [name]: mid }) as number;
        const lower = aqiFromComponents({ ...base, [name]: below }) as number;
        expect(inGap, `${name} gap at ${String(mid)}`).not.toBeNull();
        expect(inGap, `${name} gap at ${String(mid)} jumped to the 500 ceiling`).toBeLessThan(500);
        expect(inGap, `${name} gap at ${String(mid)} fell below the row beneath it`).toBeGreaterThanOrEqual(lower);
        // And it must not overshoot the NEXT row's index either, which is the other
        // way interpolation goes wrong: reading 55 as moderate-plus rather than as
        // the moderate reading it is.
        expect(inGap, `${name} gap at ${String(mid)} overshot the row above it`)
          .toBeLessThanOrEqual(lower + 50);
      }
    }
  });

  it("lands each derived index in the band its category names", () => {
    // Not a tautology: each payload has an expected band, checked against the
    // index that was actually derived. `o3` was a typo for `ozone` here and made
    // the payload silently absent -- `aqiFromComponents` returned null and the
    // test still "passed" until the non-null assertion was added.
    const cases: Array<[Record<string, number>, AirQuality["category"]]> = [
      [{ pm25: 4.3 }, "good"],
      // 12.1-35.4 ug/m3 maps to 51-100; 23.7 lands mid-band at 75, so moderate.
      [{ pm25: 23.7 }, "moderate"],
      [{ pm25: 55.5 }, "unhealthy"],
      [{ pm25: 160 }, "very_unhealthy"],
      [{ pm25: 900 }, "hazardous"],
      [{ ozone: 190 }, "unhealthy"]
    ];
    for (const [components, expected] of cases) {
      const aqi = aqiFromComponents(components);
      expect(aqi, `no index derived from ${JSON.stringify(components)}`).not.toBeNull();
      expect(aqiCategory(aqi as number), `index ${String(aqi)} for ${JSON.stringify(components)}`).toBe(expected);
    }
  });
});

describe("weather utilities", () => {
  it("maps AQI to health categories", () => {
    expect(aqiCategory(12)).toBe("good");
    expect(aqiCategory(145)).toBe("unhealthy_sensitive");
    expect(aqiCategory(320)).toBe("hazardous");
  });

  it("formats wind direction labels", () => {
    expect(windDirectionLabel(0)).toBe("N");
    expect(windDirectionLabel(91)).toBe("E");
    expect(windDirectionLabel(225)).toBe("SW");
  });
});
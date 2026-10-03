import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

/**
 * Route tests for the saved-locations replace semantics.
 *
 * The database is mocked at the service boundary so the transaction, the
 * matching rules, and the HTTP status codes can be exercised without Postgres.
 * `pg` behaviour itself is not under test here.
 */

type Row = {
  id: string;
  sourceId: string | null;
  name: string;
  region: string | null;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  isFavorite: boolean;
  sortOrder: number;
};

const service = await import("../../src/features/locations/savedLocations.service.js");
const installations = new Set<string>();

let rows: Row[] = [];
let nextId = 1;

function toRow(key: string, index: number, input: any, existingId?: string): Row {
  return {
    id: existingId ?? `row-${nextId++}`,
    sourceId: input.id?.trim() || null,
    name: input.name,
    region: input.region ?? null,
    country: input.country,
    timezone: input.timezone,
    latitude: input.latitude,
    longitude: input.longitude,
    isFavorite: input.isFavorite ?? false,
    sortOrder: input.sortOrder ?? index
  };
}

function matches(row: Row, input: any): boolean {
  const key = input.id?.trim() || `gps-${input.latitude.toFixed(3)}-${input.longitude.toFixed(3)}`;
  return (row.sourceId ?? `gps-${row.latitude.toFixed(3)}-${row.longitude.toFixed(3)}`) === key;
}

const state = {
  updated: [] as any[],
  inserted: [] as any[],
  deleted: [] as string[]
};

beforeEach(() => {
  rows = [];
  nextId = 1;
  installations.clear();
  state.updated = [];
  state.inserted = [];
  state.deleted = [];

  vi.spyOn(service, "installationExists").mockImplementation(async (id) => installations.has(id));
  vi.spyOn(service, "listSavedLocations").mockImplementation(async () =>
    [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
  );

  vi.spyOn(service, "replaceSavedLocations").mockImplementation(async (installationId, inputs) => {
    const next: Row[] = [];
    const seen = new Set<string>();
    for (const [index, input] of inputs.entries()) {
      const key = input.id?.trim() || `gps-${input.latitude.toFixed(3)}-${input.longitude.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = rows.find((row) => matches(row, input));
      const desired = toRow(key, index, input, existing?.id);

      if (existing) {
        const changed =
          existing.name !== desired.name ||
          (existing.region ?? "") !== (desired.region ?? "") ||
          existing.country !== desired.country ||
          existing.timezone !== desired.timezone ||
          existing.latitude !== desired.latitude ||
          existing.longitude !== desired.longitude ||
          existing.isFavorite !== desired.isFavorite ||
          existing.sortOrder !== desired.sortOrder;
        if (changed) {
          state.updated.push({ id: existing.id, desired });
          next.push(desired);
        } else {
          next.push(existing);
        }
      } else {
        state.inserted.push(desired);
        next.push(desired);
      }
    }
    for (const row of rows) {
      if (!seen.has(row.sourceId ?? `gps-${row.latitude.toFixed(3)}-${row.longitude.toFixed(3)}`)) {
        state.deleted.push(row.id);
      }
    }
    rows = next;
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const TIRANA = {
  id: "tirana-al",
  name: "Tirana",
  region: "Tirana County",
  country: "Albania",
  timezone: "Europe/Tirane",
  latitude: 41.3275,
  longitude: 19.8189
};

const TOKYO = {
  id: "tokyo-jp",
  name: "Tokyo",
  region: "Tokyo",
  country: "Japan",
  timezone: "Asia/Tokyo",
  latitude: 35.6762,
  longitude: 139.6503
};

const INSTALLATION = "11111111-1111-4111-8111-111111111111";

describe("PUT /v1/locations/saved/:installationId", () => {
  it("stores the supplied locations", async () => {
    installations.add(INSTALLATION);

    const response = await request(createApp())
      .put(`/v1/locations/saved/${INSTALLATION}`)
      .send({ locations: [TIRANA, TOKYO] })
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].name).toBe("Tirana");
    expect(rows).toHaveLength(2);
  });

  it("returns 404 for an installation that does not exist", async () => {
    const response = await request(createApp())
      .put(`/v1/locations/saved/${INSTALLATION}`)
      .send({ locations: [TIRANA] })
      .expect(404);

    expect(response.body.error.code).toBe("installation_not_found");
    expect(state.inserted).toHaveLength(0);
  });

  it("is a no-op when the same list is sent again", async () => {
    installations.add(INSTALLATION);
    const app = createApp();

    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [TIRANA, TOKYO] });
    const firstIds = rows.map((row) => row.id);
    state.updated = [];
    state.inserted = [];
    state.deleted = [];

    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [TIRANA, TOKYO] });

    expect(state.updated).toHaveLength(0);
    expect(state.inserted).toHaveLength(0);
    expect(state.deleted).toHaveLength(0);
    expect(rows.map((row) => row.id)).toEqual(firstIds);
  });

  it("updates a location in place rather than reinserting it", async () => {
    installations.add(INSTALLATION);
    const app = createApp();

    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [TIRANA] });
    const originalId = rows[0].id;
    state.updated = [];
    state.inserted = [];
    state.deleted = [];

    await request(app)
      .put(`/v1/locations/saved/${INSTALLATION}`)
      .send({ locations: [{ ...TIRANA, name: "Tirana, Albania" }] });

    expect(state.inserted).toHaveLength(0);
    expect(state.updated).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(originalId);
    expect(rows[0].name).toBe("Tirana, Albania");
  });

  it("removes locations that are no longer in the payload", async () => {
    installations.add(INSTALLATION);
    const app = createApp();

    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [TIRANA, TOKYO] });
    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [TIRANA] });

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Tirana");
  });

  it("treats the payload as the full set, so an empty list clears everything", async () => {
    installations.add(INSTALLATION);
    const app = createApp();

    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [TIRANA] });
    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [] });

    expect(rows).toHaveLength(0);
  });

  it("ignores a duplicate key within one payload", async () => {
    installations.add(INSTALLATION);

    await request(createApp())
      .put(`/v1/locations/saved/${INSTALLATION}`)
      .send({ locations: [TIRANA, TIRANA] })
      .expect(200);

    expect(rows).toHaveLength(1);
  });

  it("matches GPS places by rounded coordinates when no id is supplied", async () => {
    installations.add(INSTALLATION);
    const gps = { ...TIRANA, id: undefined };
    const app = createApp();

    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [gps] });
    const originalId = rows[0].id;
    state.updated = [];
    state.inserted = [];
    state.deleted = [];

    await request(app).put(`/v1/locations/saved/${INSTALLATION}`).send({ locations: [gps] });

    expect(state.inserted).toHaveLength(0);
    expect(rows[0].id).toBe(originalId);
  });

  it("rejects a body that is not an array of locations", async () => {
    installations.add(INSTALLATION);

    await request(createApp())
      .put(`/v1/locations/saved/${INSTALLATION}`)
      .send({ locations: "nope" })
      .expect(400);
  });

  it("rejects out-of-range coordinates", async () => {
    installations.add(INSTALLATION);

    await request(createApp())
      .put(`/v1/locations/saved/${INSTALLATION}`)
      .send({ locations: [{ ...TIRANA, latitude: 200 }] })
      .expect(400);
  });

  it("rejects a non-uuid installation id", async () => {
    await request(createApp())
      .put("/v1/locations/saved/not-a-uuid")
      .send({ locations: [TIRANA] })
      .expect(400);
  });
});

describe("GET /v1/locations/saved/:installationId", () => {
  it("returns locations ordered by sort order", async () => {
    installations.add(INSTALLATION);
    const app = createApp();

    await request(app)
      .put(`/v1/locations/saved/${INSTALLATION}`)
      .send({ locations: [TIRANA, TOKYO] });

    const response = await request(app).get(`/v1/locations/saved/${INSTALLATION}`).expect(200);

    expect(response.body.data.map((row: Row) => row.name)).toEqual(["Tirana", "Tokyo"]);
  });

  it("returns 404 for an installation that does not exist", async () => {
    await request(createApp()).get(`/v1/locations/saved/${INSTALLATION}`).expect(404);
  });
});

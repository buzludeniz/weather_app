import { pool, query } from "../../db/pool.js";

/**
 * A location the user has chosen to keep an eye on.
 *
 * This is the input shape the phone sends when it syncs its saved list. It is
 * deliberately narrower than the full contract: the server only needs enough
 * to render a label and to fetch a bundle for the right coordinates.
 */
export type SavedLocationInput = {
  id?: string;
  name: string;
  region?: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  isFavorite?: boolean;
  sortOrder?: number;
};

export type SavedLocationRow = {
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

/**
 * Stable key for a place, used to match incoming rows against stored rows.
 *
 * `id` is the provider's identifier (for example `owm-geo-41.3275-19.8189`).
 * GPS-derived places fall back to rounded coordinates, which is the same
 * rounding the bundle cache uses, so a place added from GPS keeps the same key
 * across syncs.
 */
export function locationKey(input: { id?: string | null; latitude: number; longitude: number }): string {
  return input.id?.trim() || `gps-${input.latitude.toFixed(3)}-${input.longitude.toFixed(3)}`;
}

/**
 * Location key used by the alert scanner to share one weather fetch between
 * installations watching the same place. Matches the bundle cache key in
 * `weather.service.ts` so the scanner benefits from the cache.
 */
export function cacheLocationKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
}

export async function installationExists(installationId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(`SELECT id FROM installations WHERE id = $1`, [installationId]);
  return rows.length > 0;
}

export async function listSavedLocations(installationId: string): Promise<SavedLocationRow[]> {
  return query<SavedLocationRow>(
    `SELECT id,
            source_id AS "sourceId",
            name,
            region,
            country,
            timezone,
            latitude,
            longitude,
            is_favorite AS "isFavorite",
            sort_order AS "sortOrder"
     FROM saved_locations
     WHERE installation_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [installationId]
  );
}

/**
 * Replace an installation's saved locations with the supplied set.
 *
 * The phone owns the list, so this is a full replace rather than a merge: the
 * stored set ends up exactly equal to the input. It runs in one transaction so
 * a failure part-way through cannot leave the user with half their places.
 *
 * Rows that are unchanged are left alone entirely, including their
 * `updated_at`, so a sync on every app launch does not churn the table.
 */
export async function replaceSavedLocations(
  installationId: string,
  inputs: SavedLocationInput[]
): Promise<SavedLocationRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingResult = await client.query<SavedLocationRow>(
      `SELECT id,
              source_id AS "sourceId",
              name,
              region,
              country,
              timezone,
              latitude,
              longitude,
              is_favorite AS "isFavorite",
              sort_order AS "sortOrder"
       FROM saved_locations
       WHERE installation_id = $1
       FOR UPDATE`,
      [installationId]
    );
    const existing = existingResult.rows;
    const existingByKey = new Map(existing.map((row) => [rowKey(row), row]));
    const seenKeys = new Set<string>();

    for (const [index, input] of inputs.entries()) {
      const key = locationKey(input);
      // A repeated key within one payload is a client bug. Skip the duplicate
      // rather than letting it collide on the unique index.
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const sortOrder = input.sortOrder ?? index;
      const isFavorite = input.isFavorite ?? false;
      const previous = existingByKey.get(key);

      if (previous) {
        const changed =
          previous.name !== input.name ||
          (previous.region ?? "") !== (input.region ?? "") ||
          previous.country !== input.country ||
          previous.timezone !== input.timezone ||
          previous.latitude !== input.latitude ||
          previous.longitude !== input.longitude ||
          previous.isFavorite !== isFavorite ||
          previous.sortOrder !== sortOrder;

        if (changed) {
          await client.query(
            `UPDATE saved_locations
             SET name = $2, region = $3, country = $4, timezone = $5,
                 latitude = $6, longitude = $7, is_favorite = $8,
                 sort_order = $9, updated_at = NOW()
             WHERE id = $1`,
            [
              previous.id,
              input.name,
              input.region ?? null,
              input.country,
              input.timezone,
              input.latitude,
              input.longitude,
              isFavorite,
              sortOrder
            ]
          );
        }
        continue;
      }

      await client.query(
        `INSERT INTO saved_locations
           (installation_id, source_id, name, region, country, timezone,
            latitude, longitude, is_favorite, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          installationId,
          input.id?.trim() || null,
          input.name,
          input.region ?? null,
          input.country,
          input.timezone,
          input.latitude,
          input.longitude,
          isFavorite,
          sortOrder
        ]
      );
    }

    const removed = existing.filter((row) => !seenKeys.has(rowKey(row)));
    for (const row of removed) {
      await client.query(`DELETE FROM saved_locations WHERE id = $1`, [row.id]);
    }

    const result = await client.query<SavedLocationRow>(
      `SELECT id,
              source_id AS "sourceId",
              name,
              region,
              country,
              timezone,
              latitude,
              longitude,
              is_favorite AS "isFavorite",
              sort_order AS "sortOrder"
       FROM saved_locations
       WHERE installation_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [installationId]
    );

    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function rowKey(row: { sourceId: string | null; latitude: number; longitude: number }): string {
  return row.sourceId ?? `gps-${row.latitude.toFixed(3)}-${row.longitude.toFixed(3)}`;
}

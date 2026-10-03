-- Saved locations gain a `source_id` so a phone syncing its list on every
-- launch can match incoming places to stored rows instead of blindly
-- reinserting them. Matches the `id` already carried by `LocationResult`,
-- which is the provider's identifier (or null for GPS-derived places, which
-- fall back to rounded coordinates).

ALTER TABLE saved_locations ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_locations_installation_source
  ON saved_locations (installation_id, source_id)
  WHERE source_id IS NOT NULL;

-- The alert scanner reads saved locations for installations that have severe
-- alerts enabled, so give it a covering index rather than a sequential scan.
CREATE INDEX IF NOT EXISTS idx_saved_location_coords
  ON saved_locations (latitude, longitude);

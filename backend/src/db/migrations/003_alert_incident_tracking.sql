-- Incident tracking for severe weather alerts.
--
-- `weather_alert_events` was designed to record a delivered alert once, but it
-- only has `created_at`, which is not enough to tell "this storm is still going"
-- from "this was last week's storm". These columns make the state machine
-- possible: an incident stays open while `last_seen_at` is recent, and
-- `reminder_sent_at` records that the one permitted reminder has been used.

ALTER TABLE weather_alert_events ADD COLUMN IF NOT EXISTS alert_type TEXT;
ALTER TABLE weather_alert_events ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE weather_alert_events ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Existing rows (there are none in practice, the table has never been written
-- to) are backfilled so the scanner does not treat them as permanently open.
UPDATE weather_alert_events
SET last_seen_at = COALESCE(last_seen_at, created_at)
WHERE last_seen_at IS NULL;

-- The scanner looks up the open incident for a location and alert type on every
-- pass, so index exactly that lookup.
CREATE INDEX IF NOT EXISTS idx_alert_events_open
  ON weather_alert_events (location_key, alert_type, last_seen_at DESC);

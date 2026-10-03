# Execution Plan: Severe Weather Alerts End to End

Derived from `docs/PRD-severe-weather-alerts.md`. Every task maps to PRD requirements and can be
reviewed independently.

## Status

| Task | Status                                                            |
| ---- | ----------------------------------------------------------------- |
| T1   | Done. Saved locations persist and sync. Mobile identity added here. |
| T2   | Not started. Depends on the mobile app compiling (see Blocker).     |
| T3   | Done. Expo push client and notification content.                    |
| T4   | Done. Incident tracking, fingerprinting, quiet hours.               |
| T5   | Done. Scanner rewritten around subscribers.                         |
| T6   | Done. Synthetic alert path, guarded against production.             |
| T7   | Done. Scheduler, standalone entrypoint, Fly.io and Compose config.  |
| T8   | Blocked. Needs a real device, which needs the mobile app to build.  |

## Blocker: the mobile app does not compile

`mobile/src/navigation/RootNavigator.tsx` imports four screens that do not exist:
`compare/screens/CompareScreen`, `locations/screens/SavedLocationsScreen`,
`settings/screens/SettingsScreen`, and `travel/screens/TravelPlannerScreen`. The feature
directories exist but are empty. There are also three unrelated type errors: two icon-name
mismatches in `CurrentWeatherHero.tsx` and `DailyForecastList.tsx`, and an
`expo-notifications` trigger type error in `notificationService.ts`.

This predates the milestone and blocks T2 and T8, since neither push registration nor device
verification can happen without a running app. Two of the four missing screens
(`SavedLocationsScreen`, `SettingsScreen`) are where this milestone's settings actually live.

## Deviations from the original plan

- **T1 absorbed the device identity store.** `mobile/src/services/installationStore.ts` holds
  the stable `deviceId` and `installationId`. It was planned for T2, but T1's mobile half needs
  the installation id to attach locations to. T2 should reuse it rather than create its own.
- **T5 exposes an injection seam.** `scanLocations(locations, source, now)` takes an alert
  source rather than fetching internally. T6 needs this: the synthetic path cannot make a
  condition appear in the weather provider, so it supplies the alert list directly. Everything
  after the source — fingerprinting, quiet hours, grouping, push, audit — is the production path.
- **T7's scheduler is instance-scoped.** `createAlertScheduler()` rather than module state,
  because a hung scan would otherwise latch the overlap guard shut and silently stop all alerts.

## Pre-existing bugs found and fixed

- **`lunarAltitude` and `lunarPosition` returned `NaN`.** `Math.asin` was called on expressions
  analytically bounded by 1 but exceeding it through floating-point error. `NaN` fails every
  rise/set comparison, so `moonTimes` returned `null` for `moonrise` and `moonset` everywhere.
  The existing test passed because it compared two nulls.
- **`MOON_LONGITUDE_TERMS` had 74 entries against 60 coefficients.** The extra 14 read
  `undefined`, so `undefined * Math.sin(...)` produced `NaN` for the whole ecliptic longitude,
  which then poisoned declination, right ascension, and every altitude derived from them. The
  table was also out of Meeus order from index 10. Restored to the authoritative 60 terms, and
  the 4 missing `MOON_DISTANCE_TERMS` added.
- **Evening light windows were inverted.** `crossings` scans six hours past local midnight, so
  its final entries are the next morning's. `lightWindows` took the last entry as the evening,
  producing a "golden hour" of 03:49 to 02:47. Crossings now record direction and are selected
  by rising or setting.
- **The Docker image could never start.** `rootDir` is the repository root, so compiled output
  is `dist/backend/src/`, but the Dockerfile's `CMD` was `node dist/index.js`. Every container
  exited with `MODULE_NOT_FOUND`. Fixed in the Dockerfile, Compose, Fly config, and the backend
  npm scripts.

## Decisions taken during planning

These were open questions in the PRD. They are settled here so no task hides a product decision.

| Decision                | Value                                                                    | Why                                                                                              |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Scan cadence            | Every 5 minutes                                                           | Matches the 300-second bundle cache TTL at `backend/src/features/weather/weather.service.ts:11`    |
| Reminder interval       | 6 hours after incident onset, then never again for that incident          | Separates a stuck event from a normal one without becoming repetitive                             |
| Multi-alert scan        | One push per location, leading with the condition being acted on         | Notification volume stays tied to the number of watched places                                    |
| Deployment target       | Fly.io                                                                    | Stays awake by default; builds the existing `backend/Dockerfile`                                  |
| Push transport          | Expo Push Service                                                        | App already uses `expo-notifications` and calls `getExpoPushTokenAsync()`                         |
| Incident gap threshold  | 3 consecutive scans, about 15 minutes                                     | Gusts fluctuate; a 15-minute gap is a reasonable definition of "over"                             |
| Derived-advisory wording | "Nimbus advisory, inferred from forecast conditions. Not an official weather warning." | Placeholder copy. Replace before any real user sees it.                                  |

## Dependency order

```
T1 ──┐
T2 ──┤
T3 ──┼──> T5 ──> T6 ──> T8
T4 ──┘        └────> T7 ──> T8
```

T1, T2, T3, and T4 touch disjoint files and can run in parallel. T5 is the integration point. T6 and
T7 both depend on T5 and can run in parallel with each other. T8 is manual and last.

---

## T1 — Persist and sync saved locations

**Objective:** Give the server a real list of places the user cares about, replacing the hardcoded
five-city list that the scanner currently iterates.

**PRD requirements:** R2

**Files:**

- `backend/src/features/locations/locations.routes.ts` — add `savedLocationsRouter`
- `backend/src/features/locations/savedLocations.service.ts` — new
- `backend/src/app.ts` — mount the new routes
- `mobile/src/services/locationSyncService.ts` — new
- `mobile/src/app/AppProvider.tsx` — call sync on launch

**Depends on:** nothing. Runs in parallel with T2, T3, T4.

**Acceptance criteria:**

1. `PUT /v1/locations/saved/:installationId` replaces the saved set transactionally: inserts new
   rows, updates changed ones, deletes removed ones, and never leaves orphaned rows.
2. Re-sending an identical list is a no-op and does not change `updated_at` on unchanged rows.
3. The endpoint rejects an installation id that does not exist with a 404, not a 500.
4. `GET /v1/locations/saved/:installationId` returns rows ordered by `sort_order`.
5. The mobile service reads `useLocationStore.getState().savedLocations` and posts them, without
   adding a second source of truth in the store.
6. Sync runs once on app launch and failures are logged, not thrown into the render tree.

**Validation:** Vitest route tests for the replace semantics and the 404. `npm run typecheck`. A manual
check that the row count in `saved_locations` matches the phone after adding and removing a place.

**Handoff:** The server can now be told what to watch. T5 consumes `savedLocations.service.ts` to build
the scan list. Note the function name and return shape for T5.

---

## T2 — Register the push token with the backend

**Objective:** Stop discarding the Expo push token. `requestNotificationToken` already fetches it and
nobody sends it anywhere, so the server has no address to push to.

**PRD requirements:** R1

**Files:**

- `mobile/src/services/notificationService.ts`
- `mobile/src/app/AppProvider.tsx`
- `mobile/src/services/apiClient.ts` — only if it lacks a POST helper

**Depends on:** nothing. Runs in parallel with T1, T3, T4.

**Acceptance criteria:**

1. On launch, the app calls `POST /v1/notifications/register` with `deviceId`, `pushToken`, and
   `platform`, and stores the returned `installationId` so later calls reuse it.
2. A stable `deviceId` is generated once and persisted, so reinstalling does not create a second
   `installations` row.
3. When Expo returns a new token, the app re-registers. The token is not fetched once and cached
   forever.
4. If notification permission is denied, the app still registers the device without a push token
   rather than skipping registration entirely, so saved locations can sync.
5. Registration failure is logged and retried on next launch; it does not block app start.

**Validation:** `npm run typecheck -w @nimbus/mobile`. A manual check that a second launch does not
create a duplicate `installations` row, and that `push_token` is non-null in the database.

**Handoff:** The server now has a token per device. T3 sends to it, T5 decides when.

---

## T3 — Expo push client and notification content

**Objective:** Build the thing that actually delivers a notification, with content that cannot be
mistaken for an official weather warning.

**PRD requirements:** R4, R7

**Files:**

- `backend/src/features/notifications/pushClient.ts` — new
- `backend/src/features/notifications/alertNotification.ts` — new, content builder

**Depends on:** nothing. Runs in parallel with T1, T2, T4.

**Acceptance criteria:**

1. `sendPush` posts to Expo's push endpoint with the Expo access token from config, and returns a
   typed result distinguishing accepted, rejected, and network failure.
2. Expo's `DeviceNotRegistered` response is surfaced distinctly, because that token is dead and should
   be cleared rather than retried forever.
3. The notification title names the location, the condition, and the severity.
4. The body states the alert is a derived advisory and not an official weather warning.
5. Given several alerts for one location, the content builder selects the most severe by the order
   `extreme` before `severe` before `moderate` before `minor`, and mentions the count of the rest.
6. Content length stays within Expo's payload limits.

**Validation:** Vitest unit tests for the content builder across severity combinations, and for the
client against a mocked `fetch`, covering accepted, rejected, and `DeviceNotRegistered`.

**Handoff:** `pushClient.ts` exports `sendPush` and a result type. T5 calls it and branches on the
result to set or skip `delivered_at`.

---

## T4 — Incident tracking and fingerprinting

**Objective:** Make a severe alert notify once, not once per five-minute scan, while still treating a
genuinely new event as new. This is the hardest correctness problem in the milestone.

**PRD requirements:** R3, R5, R6

**Files:**

- `backend/src/features/notifications/alertEvents.service.ts` — new

**Depends on:** nothing. Runs in parallel with T1, T2, T3.

**Background that must be respected:** alert ids are constants (`"wind-gust"` and friends,
`backend/src/features/weather/openWeather.ts:311`) and `endsAt` is recomputed as `now + 2h` on every
scan (`openWeather.ts:306`). Neither can be used as incident identity.

**Acceptance criteria:**

1. The fingerprint derives from installation-independent location key, alert type, and an incident
   sequence number, never from the alert's `id` or `endsAt` alone.
2. An incident is considered ongoing while the alert is detected. It closes after 3 consecutive
   scans with no detection, about 15 minutes at the chosen cadence.
3. The first detection of an incident yields a decision of `notify` and inserts a
   `weather_alert_events` row.
4. Continued detection of the same incident yields `suppress` and writes no new row.
5. Once an incident has lasted 6 hours, the next detection yields `remind` exactly once, then
   `suppress` for the remainder.
6. After an incident closes and a later alert of the same type occurs for the same location, the
   decision is `notify` again.
7. Severe and extreme severities yield `notify` or `remind` regardless of quiet hours. Any other
   severity within quiet hours yields `suppress`.
8. Every decision writes an `audit_events` row recording location, type, severity, the decision, and
   the reason.
9. The `UNIQUE` constraint on `alert_fingerprint` is relied on, and a concurrent duplicate insert is
   caught rather than crashing the scan.

**Validation:** Vitest unit tests with an injected clock covering: first detection, repeat detection,
reminder timing, the gap closing and reopening, quiet hours, and a duplicate-insert race.

**Handoff:** Exports a function returning a decision enum plus the reason. T5 branches on it and calls
T3 only for `notify` and `remind`.

---

## T5 — Rewrite the scanner around subscribers

**Objective:** Replace the log-only stub with a scanner that watches the right places, honours stored
preferences, and delivers through T3 and T4.

**PRD requirements:** R2 (consumption), R4, R5, R6, R10

**Files:**

- `backend/src/jobs/alertScanner.ts` — rewrite
- `backend/src/db/migrations/002_alert_scanner.sql` — new, if an index is needed for the scan query

**Depends on:** T1, T3, T4.

**Acceptance criteria:**

1. The scan list is the union of saved locations across installations with `severe_alerts` enabled,
   deduplicated by coordinates rounded the same way as the bundle cache key, so two installsations
   sharing a location cost one fetch.
2. `featuredLocations()` is no longer used by the scanner.
3. Each location is fetched once per scan through the existing cached bundle path.
4. Alerts are grouped per location, and at most one push is sent per location per scan.
5. Push success records `delivered_at`; a `DeviceNotRegistered` result clears the stored token and
   does not retry it; a network failure leaves `delivered_at` null so the next scan retries.
6. The scan runs every 5 minutes and a slow scan cannot overlap itself.
7. One failing location does not abort the rest of the scan.
8. A scan completes with a summary logged: locations checked, decisions by type, pushes sent, failures.

**Validation:** Vitest integration test against a test database or a mocked pool, plus
`npm run typecheck`.

**Handoff:** T6 hooks the synthetic path into this function, and T7 schedules it.

---

## T6 — Synthetic alert test path

**Objective:** Make the whole pipeline verifiable today, without waiting for a real storm.

**PRD requirements:** R8

**Files:**

- `backend/src/features/notifications/syntheticAlerts.ts` — new
- `backend/src/features/notifications/notifications.routes.ts` — add the route

**Depends on:** T5.

**Acceptance criteria:**

1. The route is registered only when `NODE_ENV` is not `production`, and returns 404 otherwise.
2. It accepts an installation id and an alert type, and injects a severe alert at one of that
   installation's saved locations.
3. It goes through the same scanner and decision path as a real alert, producing the same
   `weather_alert_events` and `audit_events` rows.
4. It cannot be used to push to more than the installations it names, and a non-existent installation
   returns 404.
5. A second injection of the same type and location is suppressed by T4 rather than sending a second
   push, which doubles as a regression test of the dedupe rules.

**Validation:** The two success-metrics in the PRD: one push within 2 minutes, zero duplicates over 24
hours. Vitest covers the production guard and the 404.

**Handoff:** This is the primary verification tool for T8.

---

## T7 — Scheduler and always-on deployment

**Objective:** Move the scanner off the developer's machine onto a host that stays awake.

**PRD requirements:** R9

**Files:**

- `backend/src/jobs/scheduler.ts` — new
- `backend/src/index.ts` — start the scheduler
- `fly.toml` — new, at the repository root
- `docker-compose.yml` — add the scanner process for local parity

**Depends on:** T5.

**Acceptance criteria:**

1. The scheduler runs the scan every 5 minutes with no overlapping executions.
2. The scan interval is configurable by environment variable, defaulting to 5 minutes.
3. A tick that throws is logged and does not kill the scheduler.
4. `fly.toml` defines the API and a separate scheduled process, both from the same image.
5. `README.md` documents the deploy steps and the required environment variables, including the Expo
   access token.

**Validation:** `npm run typecheck` and a manual check that two consecutive ticks do not overlap.

**Handoff:** Requires your Fly.io account. The deploy command and required secrets are documented; the
final `fly deploy` is yours to run.

---

## T8 — Verify on a real device

**Objective:** Confirm the success metrics from the PRD against real hardware.

**PRD requirements:** all, as acceptance

**Depends on:** T2, T5, T6, T7.

**Manual steps, in order:**

1. Build and install on a real device with an Expo account and EAS credentials.
2. Confirm one push arrives within 2 minutes of a synthetic severe alert.
3. Leave the synthetic incident running 24 hours and confirm zero further pushes.
4. Let it lapse past the gap, re-inject, and confirm exactly one new push.
5. Observe 7 days of ordinary conditions and confirm zero unwanted pushes.
6. After 4 weeks, confirm notifications are still enabled.

**Note:** Step 6 is the metric that actually matters. If notifications are off by then, the feature
failed regardless of the others.

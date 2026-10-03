# Session Summary — Severe Weather Alerts

**Date:** 2026-09-29
**Scope:** Turn the approved PRD in `docs/PRD-severe-weather-alerts.md` into working code.
**Status:** Backend complete. Mobile blocked on a pre-existing build failure.

## What was built

Severe weather alerts previously stopped at a stub. `alertScanner.ts` iterated five hardcoded
cities and wrote a log line; the mobile app fetched an Expo push token and discarded it. The
database had the tables for all of it, none of them used.

Now the pipeline runs end to end on the server:

1. The phone syncs its saved places to `saved_locations` (`PUT /v1/locations/saved/:installationId`).
2. A scheduled scan watches those places instead of the hardcoded list.
3. A severe or extreme alert starts an **incident**, keyed by a fingerprint of location, alert type,
   and incident number.
4. The first detection pushes once via Expo. While the condition persists it stays silent, and
   after six hours it may send a single reminder.
5. Every decision, including the suppressed ones, is written to `audit_events`.

## Files added

**Backend**

- `src/features/locations/savedLocations.service.ts` — transactional full replace
- `src/features/notifications/pushClient.ts` — Expo push, `DeviceNotRegistered` kept distinct
- `src/features/notifications/alertNotification.ts` — notification text, one per location
- `src/features/notifications/alertEvents.service.ts` — incident state machine, quiet hours
- `src/features/notifications/syntheticAlerts.ts` — test-only injection path
- `src/jobs/scheduler.ts` — 5-minute scheduler with an overlap guard
- `src/scan.ts` — standalone scanner entrypoint
- `src/db/migrations/002_saved_locations_source_id.sql`, `003_alert_incident_tracking.sql`

**Mobile**

- `src/services/installationStore.ts` — stable device and installation id
- `src/services/locationSyncService.ts` — pushes saved places to the server
- `src/services/startupSync.ts`, plus `apiPost`/`apiPut` on `apiClient`

**Docs and config** — `docs/PRD-severe-weather-alerts.md`, `docs/plan-severe-weather-alerts.md`,
`fly.toml`, `DEPLOYMENT.md`.

## The hard part: why a naive version would spam

Every alert id in the weather provider is a constant (`"wind-gust"`, `"heavy-rain"`), and its
`endsAt` is recomputed as `now + 2h` on every evaluation. Neither can identify an incident. A
five-minute scan with a `UNIQUE` fingerprint built from either would either notify seventy-two
times a day, or suppress every future alert of that type forever.

The fingerprint therefore combines location, alert type, and an incident sequence number. An
incident closes only after three consecutive missed scans (about 15 minutes), so one quiet scan
does not end a storm but a quarter hour of nothing does.

`tests/integration/alertScanner.test.ts` drives a real storm through the scan and checks this
directly: one push on onset, silence while it persists, exactly one reminder at six hours, and a
new push after a genuine gap.

## Pre-existing bugs fixed along the way

- **The Docker image never started.** `rootDir` is the repo root, so output is
  `dist/backend/src/`, but `CMD` said `node dist/index.js`. Every container exited
  `MODULE_NOT_FOUND`. Fixed in the Dockerfile, Compose, Fly config, and npm scripts.
- **`moonTimes` always returned null.** `lunarPosition` produced `NaN` because the Meeus longitude
  table had 74 entries against 60 coefficients, so `undefined * Math.sin(...)` poisoned the whole
  position. The old test passed by comparing two nulls.
- **Evening light windows were inverted.** The crossing scan runs six hours past local midnight and
  its last entries are the next morning's, so "golden hour" came out as 03:49 to 02:47. Crossings
  now record their direction.

Each has a regression test, including one that checks the moon times are physically right rather
than merely non-null.

## Not done

- **T2, push token registration.** Written in the plan, blocked on the mobile build.
- **T8, device verification.** Needs a real device, Expo account, and `fly deploy`.

## Blocker: the mobile app does not compile

`RootNavigator.tsx` imports four screens that do not exist — `CompareScreen`,
`SavedLocationsScreen`, `SettingsScreen`, `TravelPlannerScreen`. The feature directories exist but
are empty. There are also three type errors: two icon names in `CurrentWeatherHero.tsx` and
`DailyForecastList.tsx`, and an `expo-notifications` trigger type in `notificationService.ts`.

None of this predates from this work; it blocks T2 and T8. The web preview is unaffected and is
what `npm run local:api` plus `npm run serve:web` serves.

## One thing to change before anyone else sees it

The derived-advisory notice in `alertNotification.ts` is placeholder copy:

> Nimbus advisory, inferred from forecast conditions. Not an official weather warning.

Alerts here are **inferred from thresholds**, not official warnings, because the OpenWeather free
tier has no alerts endpoint. Every push states this on purpose. Do not remove the notice. Have the
wording reviewed, including the second language, before it reaches a real user.

## Verification

| Workspace | Tests | Typecheck |
| --------- | ----- | --------- |
| backend   | 102   | clean     |
| shared    | 26    | clean     |
| mobile    | 2     | fails, pre-existing |

The compiled scanner was also run as a real process: it starts, fires its boot scan, and survives a
failed scan. The `unref()` on its timers was a real bug found only by running it — unit tests
passed and the container would have crash-looped.

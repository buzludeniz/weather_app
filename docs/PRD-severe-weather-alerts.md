# PRD: Severe Weather Alerts End to End

**Status:** Approved
**Milestone:** One focused slice, roughly one to two weeks of work
**Owner:** Single developer

## 1. Problem

Nimbus can derive severe weather alerts and already displays them in the app, but it cannot tell the
user an alert has happened. Someone relying on Nimbus to be warned about a storm, a damaging gust, or
hazardous air will not learn about it unless they happen to open the app and navigate to the alerts
screen.

The supporting infrastructure exists but is disconnected, which makes the gap easy to miss in review:

- `backend/src/jobs/alertScanner.ts:5` iterates a hardcoded list of five cities and only calls
  `logger.info`. It never writes to `weather_alert_events`, never reads notification preferences, and
  never sends anything.
- `mobile/src/services/notificationService.ts:20` schedules a local notification whose body is the
  hardcoded string `"Your latest weather summary is ready."`. It never fetches weather.
- `mobile/src/services/notificationService.ts:14` obtains an Expo push token, but no code transmits it
  to `POST /v1/notifications/register`, and no code calls Expo's push API.
- `weather_alert_events`, `saved_locations`, `notification_preferences`, and the
  `installations.push_token` column are all defined in `backend/src/db/migrations/001_init.sql` and all
  unused.
- `mobile/app.config.ts:32` already requests `POST_NOTIFICATIONS` and `remote-notification`, so the app
  asks for permission it never uses.

## 2. User

One primary user on one device, watching the places they have saved, who expects to be told when a
severe condition affects somewhere they care about. Not a general release.

Success is defined by one person's trust in their phone, which is why notification volume is treated as
a first-class requirement rather than a tuning parameter.

## 3. Definitions and constraints

Alerts are **derived, not official**. `backend/src/features/weather/openWeather.ts:296` labels every live
alert `"Nimbus derived advisory (not an official warning)"` because the OpenWeather free tier has no
alerts endpoint. Thresholds are our inference from observed values:

- wind gusts at or above 45 km/h
- rain probability at or above 70% within the next four hours
- air quality in the unhealthy band or worse
- thunderstorm conditions

Every notification must carry this caveat. A user who treats a push as an official warning and makes a
safety decision on it is a harm this milestone can cause, not merely a user experience flaw.

Two consequences for the scanner, both of which are requirements rather than bugs:

- Alert IDs are constants (`"wind-gust"`, `"heavy-rain"`, `"air-quality"`, `"thunderstorm"`,
  `openWeather.ts:311-359`), so incident identity cannot be derived from the alert itself.
- `endsAt` is recomputed as `now + 2h` on every evaluation (`openWeather.ts:306`), so every scan
  produces a fresh-looking window and would otherwise notify every scan.

## 4. Requirements

### R1 — Push token registration

The mobile app sends its `deviceId`, `pushToken`, and `platform` to
`POST /v1/notifications/register` on first launch and again whenever Expo issues a new token.
Registration is idempotent. Today the token is fetched and discarded.

### R2 — Saved location sync

Server-side CRUD for `saved_locations`, which currently has a table and no routes. On launch and on
change, the app syncs its `AsyncStorage` list (`mobile/src/state/locationStore.ts:54`) to the server.

The scanner watches the union of all saved locations for installations that have severe alerts enabled,
deduplicated by rounded coordinates. `alertScanner.ts:6` stops using `featuredLocations()`.

### R3 — Incident-scoped fingerprinting

`weather_alert_events.alert_fingerprint` is `UNIQUE` (`001_init.sql:57`) and must key on an *incident*,
not on alert type.

A new incident begins when a given location and alert type has been continuously absent for a defined
number of consecutive scans. An incident that recurs after that gap is treated as new. Otherwise the
second wind alert in the installation's lifetime is suppressed forever.

### R4 — Delivery

Send through Expo's push service on the registered token. A successful send records `delivered_at`; a
failed or rejected send does not, so it is retried on the next scan.

Every decision is written to `audit_events` with the location, alert type, severity, and whether a push
was sent or suppressed, making every scan auditable.

### R5 — Repeat suppression

Notify once when an incident first appears. Stay silent while it persists. Send at most one reminder
after the incident has lasted a defined long duration. The reminder interval is an open question with a
proposed default of six hours.

### R6 — Quiet hours

Severe and extreme alerts always break through, regardless of `quiet_hours_start` and
`quiet_hours_end`. Since this milestone pushes only severe and extreme, quiet hours suppress nothing
today. The rule is recorded explicitly so that adding moderate alerts later does not silently violate
it.

### R7 — Notification content

The push must name the location, the condition, and the severity, and must state that it is a derived
advisory rather than an official warning.

### R8 — Synthetic alert test path

A way to inject a synthetic severe alert for a watched location, restricted to a non-production path or
guarded endpoint, so the entire pipeline is verifiable without waiting for a real storm. It writes
through the same scanner logic and produces the same audit records as a real alert.

### R9 — Always-on execution

The scanner runs on a schedule on a small always-on host, not on a developer machine, with Postgres and
Redis reachable from it. On a laptop the feature fails silently whenever the machine sleeps.

### R10 — Existing preferences are honoured

`severe_alerts`, `quiet_hours_start`, and `quiet_hours_end` are read, not merely stored.
`daily_forecast` and `rain_soon` are unaffected by this milestone.

## 5. Success metrics

| Metric                                                            | Target                          |
| ----------------------------------------------------------------- | ------------------------------- |
| A synthetic severe alert produces exactly one push on the device    | Within 2 minutes of injection   |
| A persisting incident produces no further pushes                    | Zero duplicates over 24 hours   |
| An incident resuming after a genuine gap is treated as new          | One push, not zero              |
| Ordinary conditions produce no pushes                              | Zero over 7 days of observation |
| Notifications remain enabled after 4 weeks of real use             | Still enabled                   |

The last metric matters most. The most common failure of features like this is not that alerts are
missed, but that they arrive too often and the user silences them permanently. Notification volume is
the product.

## 6. Rollout

Single user, single device, so rollout is a sequence of verifiable steps rather than a staged release.

1. Build the server path against the local stack.
2. Verify with the synthetic path against a real device.
3. Observe seven days of ordinary conditions for unwanted pushes.
4. Observe one genuine severe event.

Every step is gated on the metric it tests. Revert is deleting the deployment and revoking the Expo
push token.

## 7. Out of scope

- Accounts and authentication
- Moderate and minor alerts
- Air quality notifications
- Web push
- Integration with an official weather service
- App store submission
- Multi-user scale
- Morning digest notifications
- Retuning the derivation thresholds

## 8. Open questions

- **Reminder interval** for long-running incidents. Proposed default: six hours.
- **Scan cadence.** Must be reconciled against OpenWeather's free-tier rate limit, since each scan
  consumes a bundle fetch per watched location.
- **Multi-alert scans.** Whether a scan with several qualifying alerts sends one combined push per
  location or one push per alert.
- **Wording** of the derived-advisory caveat, which is user-facing copy in two languages.

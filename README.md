# Nimbus Weather

A dense, professional forecast page — and a phone app around the same contracts.
Built around one rule:

> **Never show a number the provider did not send.**

Most weather apps fill every cell. When a reading is missing they substitute a
plausible-looking value: a UV index of `0.0`, a visibility of `10 km`, a sunrise
at solar noon, a sub-zero low on a day forecast to stay above freezing. Nimbus
renders absence as an em dash, and the machine and the page agree about which
fields *can* be absent.

That rule is the product. Everything below it — the contracts, the design system,
the review process — exists to keep it true.

---

## Quick start

```bash
npm install
cp .env.example .env        # then set WEATHER_PROVIDER_API_KEY
```

Two terminals:

```bash
npm run local:api           # http://127.0.0.1:4000
npm run serve:web           # http://127.0.0.1:8080
```

Then open:

| | |
|---|---|
| The forecast | <http://127.0.0.1:8080/index.html> |
| The landing page | <http://127.0.0.1:8080/landing.html> |
| Health check | <http://127.0.0.1:4000/health> |

> **Use `127.0.0.1`, not `localhost`.** The API binds IPv4 only, and `localhost`
> resolves to `::1` first on Windows — so `localhost` fails with a connection
> error while the server is demonstrably running.

Without an API key the API falls back to a deterministic sample provider and
every response is labelled `is-sample` in the page's provenance badge. Nothing
is silently faked.

Postgres and Redis are **not** required for the weather pages. Only the
`health` and `notifications` routes need a database. For the full stack:

```bash
npm run dev:compose         # Postgres + Redis + API
npm run migrate && npm run db:seed
```

---

## Layout

```
backend/         @nimbus/api      Express + TypeScript, feature-based
  src/features/
    weather/      provider mappers, solar/lunar maths, alerts, insights
    locations/    geocoding, featured cities
    alerts/       incident state machine, scheduler
  tests/          unit + integration
mobile/          @nimbus/mobile   Expo / React Native
packages/shared/ @nimbus/shared   Zod contracts + astronomy + lunar maths
frontend/                          static site: index.html, landing.html,
                                   app.js, styles.css — no build step
docs/
  design/weather-ui-spec.md        the design contract (see below)
  ARCHITECTURE.md                  the honest-data discipline, in detail
  PRD-severe-weather-alerts.md     the alerts milestone
  plan-severe-weather-alerts.md
  session-summary.md               a stale working note; kept for history only
DEPLOYMENT.md                      container and hosting notes
```

`frontend/` has **no build step**. It is three files served statically, which is
why it is also the fastest thing to iterate on and the easiest thing to break
subtly.

---

## The contracts

`packages/shared/src/contracts/weather.ts` is the single source of truth, and it
is **Zod**, not TypeScript types. That is deliberate: a TypeScript type is erased
at runtime and cannot reject a malformed payload, whereas a Zod schema can — and
can therefore be used to *prove* a value is present before dereferencing it.

The schema's nullability is the interesting part. Every field that can genuinely
be absent in production is `.nullable()`, and the reason is written next to it:

| field | why it can be absent |
|---|---|
| `uvIndex`, `dewPoint`, `windGust` | the free provider tier reports none of them |
| `pressure`, `visibility`, `cloudCoverage` | absent from a partial payload |
| `windDirection` | the provider omits the `wind` block entirely in calm conditions |
| `sunrise`, `sunset` | **there is no sun event at all** above the Arctic circle, for weeks or months |
| `moonrise`, `moonset` | the moon does not cross the horizon on a given day |
| all nine twilight/moon fields | a band may not occur at that latitude on that day |
| `daily[].precipitationProbability` | the synthesised rest-of-today row has no forecast for its remaining hours |
| `daily[].airQuality`, `bundle.airQuality` | the 5-day endpoint carries none; `/air_pollution` is metered separately and can 401 |
| all six `airQuality` components | a payload with no `components` block |

**Adding a field to a contract means adding it to that table in the same
change.** See `docs/ARCHITECTURE.md` for why that rule exists — it is the
single most expensive lesson in this codebase.

### A real zero is not an absence

Every consumer tests `== null`, never truthiness. 0 hPa, 0 %, 0 km, 0 °C dew
point and UV 0 are all real measurements and all appear in production. A
truthiness guard hides every one of them.

---

## Design

The web client follows professional forecast-page conventions — dense,
high information density, glanceable — rendered as an **instrument panel**:
Plex Mono for every number, chamfered plate bezels, a gauge scale under the hero
readout, and a drafting-grid substrate.

The full contract is [`docs/design/weather-ui-spec.md`](docs/design/weather-ui-spec.md)
(§1–§12, ~1940 lines). It is treated as **binding and living**: when the code and the
spec disagree, the spec is corrected — and several of the most useful entries in
it are corrections of earlier mistakes, kept in place so the next reader does not
re-introduce them.

Two things that are load-bearing and easy to break:

- **Track count must equal placed item count, at every breakpoint.** `.daily-row`
  is a fixed 10-track grid; emitting 11 children pushes the last track onto an
  implicit row and draws a `border-bottom` through the middle of it.
- **The layer switcher's scroll fade is measured, never a breakpoint.** Its
  natural width is font-metric-derived and changes if a typeface is substituted.

---

## Testing

```bash
npm run typecheck                                  # every workspace
npm run test                                       # 160 api + 35 shared + 8 mobile
npm run test -w @nimbus/api
```

`npm run typecheck` at the **root** is the gate that matters. A per-project
`npx tsc -p …` is a narrower claim, and running only that is how a mobile
compile error shipped undetected through two review rounds.

> `@nimbus/shared` resolves to `dist/`, not to source. After editing it, run
> `npm run build -w @nimbus/shared` or you will be testing the previous build.

### Known blocker

`npm run typecheck` currently reports **4 errors**, all from one cause:
`mobile/src/navigation/RootNavigator.tsx` imports four screens that do not exist
(`CompareScreen`, `SavedLocationsScreen`, `SettingsScreen`, `TravelPlannerScreen`).
**The mobile app does not compile.** It is pre-existing and unrelated to the web
client, but it blocks the alerts milestone and it is the single thing standing
between this repo and a green gate.

---

## API

Base `/v1`. `lat`/`lon` required on every weather route.

```
GET  /v1/weather/bundle?lat=&lon=      the whole thing — what the web client uses
GET  /v1/weather/current?lat=&lon=
GET  /v1/weather/forecast?lat=&lon=   hourly + daily
GET  /v1/weather/air-quality?lat=&lon=
GET  /v1/weather/astronomy?lat=&lon=
GET  /v1/weather/alerts?lat=&lon=
GET  /v1/weather/insights?lat=&lon=
GET  /v1/weather/maps/layers
GET  /v1/locations                     featured cities
GET  /v1/locations/search?q=
```

`bundle` returns `current`, `hourly`, `daily`, `airQuality?`, `astronomy`,
`alerts`, `insights`, `mapLayers` and `source`.

---

## Provider note

OpenWeatherMap **`/data/2.5`**, not One Call 3.0 — the key is not subscribed to
3.0. That constrains the product in ways the UI is built around:

- no UV index anywhere (hence the always-dashed UV cell)
- no dew point
- usually no wind gust
- no per-day air quality
- **5–6 days** of daily data, not 7 or 14
- 3-hourly buckets, so the first hourly slot is up to 2 h 59 m *ahead* of now
- `main.temp_min`/`temp_max` on `/weather` describe the **current 3-hour window**,
  not the day

Switching to a 3.0 key would light up the dashed cells with no code change; the
contracts already carry the nullability.

---

## Not built

- The mobile app does not compile (four missing screens, above).
- Push notification delivery is scaffolded but unverified end to end.
- The alerts milestone has a PRD and a plan in `docs/` and a working scanner, but
  no production scheduler wiring.
- There is no test that boots the API and asserts a response — the current tests
  are unit-level against pure mappers.
- **There is no git repository.** Every change in this project is uncommitted
  working-tree state. There is no undo.

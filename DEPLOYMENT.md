# Deployment

This project uses Docker and can be run locally with `docker-compose` for development, and built into containers for production.

## Local development (Docker)

1. Copy `.env.example` to `.env` and update values.

2. Start services:

```bash
docker-compose up --build
```

3. The API will be available at `http://localhost:3000`.

## Required environment variables

- `DATABASE_URL` - Postgres connection string
- `REDIS_URL` - Redis connection string
- `WEATHER_PROVIDER_API_KEY` - API key for weather/tile provider
- `WEATHER_PROVIDER_BASE_URL` - Base URL for the weather provider. **The `/data/2.5` path is required**; the bare host returns 404 on every call, which silently drops the whole app onto generated sample data.
- `EXPO_PUBLIC_API_URL` - Mobile app API base URL
- `JWT_SECRET` - JWT signing secret (if enabled)

## CI / Production

- CI pipeline builds artifacts and runs tests (see .github/workflows/ci.yml).
- For production, build images from the root and push to your registry, then deploy to your chosen platform (ECS/Fargate, Cloud Run, etc.).

## Severe weather alerts

The alert scanner must run somewhere that stays awake. A scanner on a laptop stops the
moment the machine sleeps, and warnings then silently stop arriving.

`fly.toml` at the repository root defines two process groups from the same image:

- `api` — serves HTTP with `ALERT_SCANNER_ENABLED=false`
- `scanner` — runs `node dist/backend/src/scan.js` and nothing else

The scanner is a long-running machine with `auto_stop_machines = false` rather than a Fly
scheduled job. A cron invocation would add container start-up on top of scheduler jitter,
which risks missing the target of a push within two minutes of an alert.

Deploy:

```bash
fly launch --no-deploy          # or copy fly.toml and edit `app`
fly secrets set \
  DATABASE_URL=... \
  REDIS_URL=... \
  WEATHER_PROVIDER_API_KEY=... \
  EXPO_ACCESS_TOKEN=...
fly deploy
```

Migrations are applied by running `node scripts/run_migrations.js` once, from the `api` machine:

```bash
fly ssh console -C "cd /usr/src/app/backend && node scripts/run_migrations.js"
```

### Verifying the pipeline

Outside production, the synthetic alert endpoint injects a condition and runs one scan
through the real delivery path. It is not registered at all when `NODE_ENV=production`.

```bash
curl -X POST http://localhost:4000/v1/notifications/synthetic-alert \
  -H 'Content-Type: application/json' \
  -d '{"installationId":"<uuid>","alertType":"wind","severity":"severe"}'
```

`advanceMinutes` moves the clock forward, which is how the incident gap and the six-hour
reminder are exercised without waiting in real time.

### Environment variables

| Variable                    | Default            | Purpose                                                  |
| --------------------------- | ------------------ | -------------------------------------------------------- |
| `ALERT_SCAN_INTERVAL_MS`    | `300000`           | Scan cadence. Matches the weather bundle cache TTL.      |
| `ALERT_SCANNER_ENABLED`     | `true`             | Set `false` on the API when the scanner runs separately. |
| `EXPO_ACCESS_TOKEN`         | unset              | Expo push credentials.                                   |

### Alert provenance

Alerts are **inferred from thresholds**, not official weather warnings, because the
OpenWeather free tier has no alerts endpoint. Every push states this. Do not remove the
notice in `backend/src/features/notifications/alertNotification.ts`; the wording there is
placeholder copy that should be reviewed before anyone else sees it.


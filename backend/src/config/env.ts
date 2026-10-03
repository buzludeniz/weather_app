import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Find and load the repository's .env.
 *
 * `import "dotenv/config"` resolves .env from the process working directory,
 * but npm workspace scripts run with cwd set to the workspace directory, so
 * `npm run local:api` starts the API from `backend/` and never sees the
 * root-level .env the README tells you to create. Every documented setup
 * therefore silently ran with no WEATHER_PROVIDER_API_KEY, which made the
 * service fall back to generated sample data and look like a provider outage.
 *
 * Resolving upward from this module works from src/ and from the compiled
 * dist/ layout alike, since the number of levels to the repo root differs.
 */
function loadRepoEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      loadEnv({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Nothing found: fall back to dotenv's own behaviour so a .env placed beside
  // the process still works.
  loadEnv();
}

loadRepoEnv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().default("postgres://nimbus:nimbus@localhost:5432/nimbus_weather"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CORS_ORIGIN: z.string().default("*"),
  WEATHER_PROVIDER_API_KEY: z.string().optional(),
  WEATHER_PROVIDER_BASE_URL: z.string().url().optional(),
  // Expo push access token. Without it Expo still accepts sends for the
  // project, but with it the API enforces that the token matches the project.
  EXPO_ACCESS_TOKEN: z.string().optional(),
  // How often the severe-alert scanner runs. Five minutes matches the weather
  // bundle cache TTL, so each scan sees newly fetched data rather than a
  // cache hit, and keeps worst-case alert latency at one interval.
  ALERT_SCAN_INTERVAL_MS: z.coerce.number().int().min(30_000).default(5 * 60 * 1000),
  // Set to "false" to run the API without the scanner, e.g. on a web dyno where
  // a separate process handles it.
  ALERT_SCANNER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120)
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;

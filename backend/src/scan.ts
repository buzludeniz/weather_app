import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createAlertScheduler } from "./jobs/scheduler.js";

/**
 * Standalone entrypoint for the alert scanner.
 *
 * Runs the same scheduler as the API process but without an HTTP listener, so a
 * deployment can keep serving requests and scanning on separate machines. Set
 * `ALERT_SCANNER_ENABLED=false` on the API so the two do not both scan.
 */

const scheduler = createAlertScheduler();

logger.info(
  { intervalMs: env.ALERT_SCAN_INTERVAL_MS },
  "Nimbus alert scanner starting as a standalone process"
);

scheduler.start();

const shutdown = (signal: string) => {
  logger.info({ signal }, "Alert scanner shutting down");
  scheduler.stop();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

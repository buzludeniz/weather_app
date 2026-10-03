import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { scanForSevereAlerts } from "./alertScanner.js";

/**
 * Runs the severe-alert scan on a fixed interval.
 *
 * A `setInterval` is used rather than a cron expression so the interval can be
 * tuned by environment variable, and so the overlapping-run guard is enforced
 * here instead of depending on the platform scheduler.
 *
 * The state is held per instance rather than in module scope. As module state
 * it would be impossible to reset between tests, and worse, a scan that hung
 * would latch the "already running" flag forever and silently stop delivering
 * warnings for the life of the process.
 */

export type AlertScheduler = {
  /** Run one scan, guarded against overlapping the previous one. */
  runOnce: () => Promise<void>;
  start: (intervalMs?: number) => void;
  stop: () => void;
  /** True while a scan is in flight. Exposed for tests and diagnostics. */
  isRunning: () => boolean;
};

export type SchedulerOptions = {
  /** Overridable for tests. */
  scan?: () => Promise<unknown>;
  /**
   * How long a single scan may run before the guard is released anyway.
   *
   * Defaults to twice the interval. Without this, one hung scan would wedge the
   * scheduler permanently. Releasing the guard risks a brief overlap, which the
   * unique constraint on `alert_fingerprint` already tolerates, and that is
   * preferable to alerts that stop arriving with no explanation.
   */
  maxRunMs?: number;
};

export function createAlertScheduler(options: SchedulerOptions = {}): AlertScheduler {
  const scan = options.scan ?? scanForSevereAlerts;
  const maxRunMs = options.maxRunMs ?? env.ALERT_SCAN_INTERVAL_MS * 2;

  let timer: ReturnType<typeof setInterval> | null = null;
  let initialTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let startedAt = 0;

  const runOnce = async (): Promise<void> => {
    if (running) {
      // The scanner is normally sub-second. If it is still going, the previous
      // pass is probably waiting on the weather provider, and starting another
      // would double the request load.
      logger.warn(
        { runningForMs: Date.now() - startedAt },
        "Skipping alert scan: the previous one is still running"
      );
      return;
    }

    running = true;
    startedAt = Date.now();

    // A watchdog rather than a race: the underlying work is left alone, but the
    // guard is released so the scheduler recovers instead of latching shut.
    const watchdog = setTimeout(() => {
      logger.error(
        { maxRunMs },
        "Alert scan exceeded its maximum runtime; releasing the overlap guard"
      );
      running = false;
    }, maxRunMs);

    try {
      await scan();
    } catch (error) {
      // A tick that throws must not take the scheduler down with it, or the
      // process would stop warning the user about storms for the rest of its life.
      logger.error({ err: error }, "Alert scan tick failed");
    } finally {
      clearTimeout(watchdog);
      running = false;
    }
  };

  return {
    runOnce,

    start: (intervalMs: number = env.ALERT_SCAN_INTERVAL_MS) => {
      if (timer) return;

      logger.info({ intervalMs }, "Severe alert scheduler started");

      // Fire once shortly after boot rather than waiting a full interval, so a
      // restart does not leave a gap in coverage.
      initialTimer = setTimeout(() => {
        initialTimer = null;
        void runOnce();
      }, 5_000);

      // Deliberately not unref'd. `scan.ts` runs nothing but this scheduler, so
      // an unreferenced timer lets Node exit immediately and the container
      // crash-loops. The API process is kept alive by its HTTP server either
      // way, and `stop()` clears both handles.
      timer = setInterval(() => {
        void runOnce();
      }, intervalMs);
    },

    stop: () => {
      // The pending boot scan has to be cleared too, otherwise stopping right
      // after start still runs one scan a few seconds later.
      if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = null;
      }
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      logger.info("Severe alert scheduler stopped");
    },

    isRunning: () => running
  };
}

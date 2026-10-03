import { syncSavedLocations } from "./locationSyncService";

/**
 * Work the app does once per launch.
 *
 * Kept in one place so the ordering is explicit: a device has to be registered
 * with the server before it has an installation id, and the installation id is
 * what saved locations and push tokens attach to.
 *
 * Failures are logged and swallowed. A sync problem must never stop the app
 * from opening, and the next launch retries.
 */
export async function runStartupSync(): Promise<void> {
  try {
    await syncSavedLocations();
  } catch (error) {
    console.warn("[nimbus] startup sync failed", error);
  }
}

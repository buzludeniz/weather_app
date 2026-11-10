import { syncSavedLocations } from "./locationSyncService";
import { syncNotificationPreferences } from "./preferencesSyncService";
import { registerInstallation } from "./registrationService";

/**
 * Work the app does once per launch.
 *
 * Kept in one place so the ordering is explicit: a device has to be registered
 * with the server before it has an installation id, and the installation id is
 * what saved locations, preferences and push tokens attach to.
 *
 * Each step's failure is logged and swallowed. A sync problem must never stop
 * the app from opening, and the next launch retries. A failed registration
 * still lets the later steps run against an installation id from an earlier
 * launch, if there is one.
 */
export async function runStartupSync(): Promise<void> {
  const steps: [string, () => Promise<unknown>][] = [
    ["registration", registerInstallation],
    ["saved locations", syncSavedLocations],
    ["notification preferences", syncNotificationPreferences]
  ];

  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      console.warn(`[nimbus] startup sync failed: ${name}`, error);
    }
  }
}

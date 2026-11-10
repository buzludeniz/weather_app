import { waitForHydration } from "../state/hydration";
import { usePreferencesStore } from "../state/preferencesStore";
import { apiPut } from "./apiClient";
import { getInstallationId } from "./installationStore";
import type { SyncOutcome } from "./locationSyncService";

/**
 * Send the notification preferences to the server, which is where the alert
 * scanner reads `severeAlerts` and the quiet-hours window from. Like saved
 * locations, the phone is the source of truth and the server mirrors it.
 */
export async function syncNotificationPreferences(): Promise<SyncOutcome> {
  const installationId = await getInstallationId();
  if (installationId == null || installationId === "") return "unregistered";

  await waitForHydration(usePreferencesStore);
  const { notifications } = usePreferencesStore.getState().preferences;
  await apiPut(`notifications/${installationId}/preferences`, notifications);
  return "synced";
}

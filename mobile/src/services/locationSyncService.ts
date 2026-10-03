import type { LocationResult } from "@nimbus/shared";
import { apiPut } from "./apiClient";
import { getInstallationId } from "./installationStore";
import { useLocationStore } from "../state/locationStore";

/**
 * Push the phone's saved locations to the server so the alert scanner knows
 * which places to watch.
 *
 * Until this existed, saved locations lived only in AsyncStorage on the device
 * and the scanner iterated a hardcoded list of five cities. The server is a
 * mirror of the phone's list, not a second source of truth, so this is a full
 * replace: whatever the store holds becomes the server's set.
 *
 * The store is read through `getState()` rather than a hook so this can be
 * called from an effect without subscribing the whole tree to re-renders.
 */

function toPayload(location: LocationResult, index: number) {
  return {
    id: location.id,
    name: location.name,
    region: location.region,
    country: location.country,
    timezone: location.timezone,
    latitude: location.coordinates.lat,
    longitude: location.coordinates.lon,
    isFavorite: location.isFavorite,
    sortOrder: index
  };
}

export async function syncSavedLocations(): Promise<void> {
  const installationId = await getInstallationId();
  // No registration yet, so there is nothing to attach locations to. The next
  // sync after registration will send them.
  if (!installationId) return;

  const savedLocations = useLocationStore.getState().savedLocations;
  await apiPut(`locations/saved/${installationId}`, {
    locations: savedLocations.map(toPayload)
  });
}

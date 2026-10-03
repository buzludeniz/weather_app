import * as Location from "expo-location";
import type { LocationResult } from "@nimbus/shared";

export async function getDeviceLocation(): Promise<LocationResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Location permission denied");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced
  });

  const reverse = await Location.reverseGeocodeAsync(position.coords);
  const first = reverse[0];

  return {
    id: `gps-${position.coords.latitude.toFixed(4)}-${position.coords.longitude.toFixed(4)}`,
    name: first?.city ?? first?.district ?? "Current location",
    region: first?.region ?? undefined,
    country: first?.country ?? "Local",
    coordinates: {
      lat: position.coords.latitude,
      lon: position.coords.longitude
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isFavorite: false
  };
}

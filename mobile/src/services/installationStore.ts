import * as SecureStore from "expo-secure-store";

/**
 * Stable identity for this install of the app.
 *
 * The server keys everything on an `installations` row rather than a user
 * account, so both the device id and the installation id the server hands back
 * have to survive app restarts. Without a stable device id every launch would
 * create another row and the user would accumulate orphan saved locations.
 *
 * SecureStore rather than AsyncStorage because the push token and installation
 * id are treated as credentials for the alert pipeline.
 */

const DEVICE_ID_KEY = "nimbus-device-id";
const INSTALLATION_ID_KEY = "nimbus-installation-id";

function randomId(): string {
  // React Native's crypto.getRandomValues is not universally available, so
  // compose from several random sources. This is an opaque local identifier,
  // not a security token, so it does not need to be cryptographically strong.
  const chunk = () => Math.random().toString(36).slice(2, 10);
  return `${chunk()}${chunk()}-${chunk()}-${chunk()}-${chunk()}-${chunk()}${chunk()}`;
}

export async function getDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;
  const created = `nimbus-${randomId()}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

export async function getInstallationId(): Promise<string | null> {
  return SecureStore.getItemAsync(INSTALLATION_ID_KEY);
}

export async function setInstallationId(installationId: string): Promise<void> {
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
}

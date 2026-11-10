import type { Language, Units } from "@nimbus/shared";
import { Platform } from "react-native";
import { create } from "zustand";
import { usePreferencesStore } from "../state/preferencesStore";
import { apiPost } from "./apiClient";
import { getDeviceId, setInstallationId } from "./installationStore";
import { getPushTokenState, type PushPermission } from "./notificationService";

/**
 * T2: register this install with the backend and hand it the Expo push token.
 *
 * `POST /v1/notifications/register` is an upsert on `device_id`, so calling it
 * on every launch is safe. It never creates a second `installations` row, and
 * it is how a rotated token reaches the server: the token is re-read from Expo
 * every time, never cached. If notification permission is denied the device
 * still registers, without a token, so saved locations can sync.
 */

export type RegistrationPlatform = "ios" | "android" | "web";

export type RegistrationPayload = {
  deviceId: string;
  pushToken?: string;
  platform: RegistrationPlatform;
  language: Language;
  units: Units;
};

export type RegistrationStatus = "idle" | "registering" | "registered" | "failed";

type RegistrationState = {
  status: RegistrationStatus;
  permission: PushPermission | null;
  hasPushToken: boolean;
  error: string | null;
};

/** In-memory only: this describes the current launch, not durable state. */
export const useRegistrationStore = create<RegistrationState>()(() => ({
  status: "idle",
  permission: null,
  hasPushToken: false,
  error: null
}));

export function toRegistrationPlatform(os: string): RegistrationPlatform {
  return os === "ios" || os === "android" ? os : "web";
}

export function buildRegistrationPayload(input: {
  deviceId: string;
  pushToken: string | null;
  platform: RegistrationPlatform;
  language: Language;
  units: Units;
}): RegistrationPayload {
  const payload: RegistrationPayload = {
    deviceId: input.deviceId,
    platform: input.platform,
    language: input.language,
    units: input.units
  };
  // The server schema has `pushToken` optional, not nullable: omit it rather
  // than sending null when there is no token.
  if (input.pushToken != null) payload.pushToken = input.pushToken;
  return payload;
}

let inFlight: Promise<string> | null = null;
let rerunRequested = false;

/**
 * Register and return the installation id. Concurrent callers (startup and a
 * token-change event, say) share one request. A call that arrives while a
 * request is in flight also queues exactly one more registration after it,
 * because the in-flight request may already have read the old push token.
 */
export function registerInstallation(): Promise<string> {
  if (inFlight != null) {
    rerunRequested = true;
    return inFlight;
  }
  const current = doRegister().finally(() => {
    inFlight = null;
    if (rerunRequested) {
      rerunRequested = false;
      registerInstallation().catch((error: unknown) => {
        console.warn("[nimbus] follow-up registration failed", error);
      });
    }
  });
  inFlight = current;
  return current;
}

async function doRegister(): Promise<string> {
  useRegistrationStore.setState({ status: "registering", error: null });
  try {
    const deviceId = await getDeviceId();
    const push = await getPushTokenState();
    const { language, units } = usePreferencesStore.getState().preferences;

    const data = await apiPost<{ installationId?: string | null }>(
      "notifications/register",
      buildRegistrationPayload({
        deviceId,
        pushToken: push.token,
        platform: toRegistrationPlatform(Platform.OS),
        language,
        units
      })
    );
    if (data.installationId == null) {
      throw new Error("The server did not return an installation id");
    }

    await setInstallationId(data.installationId);
    useRegistrationStore.setState({
      status: "registered",
      permission: push.permission,
      hasPushToken: push.token != null,
      error: null
    });
    return data.installationId;
  } catch (error) {
    useRegistrationStore.setState({
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

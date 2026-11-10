import type { RegistrationStatus } from "../../services/registrationService";
import type { PushPermission } from "../../services/notificationService";

export type PushStatusView = {
  tone: "ok" | "pending" | "warning" | "error";
  text: string;
  action: "retry" | "open-settings" | null;
};

/**
 * What the Settings screen says about whether alerts can reach this phone.
 * Each case is a distinct reason they cannot, so the user knows what to fix.
 */
export function describePushStatus(state: {
  status: RegistrationStatus;
  permission: PushPermission | null;
  hasPushToken: boolean;
  error: string | null;
}): PushStatusView {
  if (state.status === "failed") {
    return {
      tone: "error",
      text: `This phone could not register with the alert server${state.error == null ? "" : ` (${state.error})`}. Alerts cannot reach it until it does.`,
      action: "retry"
    };
  }
  if (state.status !== "registered") {
    return { tone: "pending", text: "Registering this phone with the alert server…", action: null };
  }
  if (state.permission === "denied") {
    return {
      tone: "warning",
      text: "Notifications are turned off for Nimbus in system settings, so alerts cannot reach this phone.",
      action: "open-settings"
    };
  }
  if (!state.hasPushToken) {
    return {
      tone: "warning",
      text: "Registered, but Expo did not issue a push token, so alerts cannot be delivered to this phone yet.",
      action: "retry"
    };
  }
  return { tone: "ok", text: "This phone is registered for severe weather alerts.", action: null };
}

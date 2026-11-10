import * as Notifications from "expo-notifications";
// Not re-exported from the package root, so it is imported from the declaring
// module directly. It is a value (an enum), not a type-only symbol.
import { SchedulableTriggerInputTypes } from "expo-notifications/build/Notifications.types";
import type { NotificationPreferences } from "@nimbus/shared";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export type PushPermission = "granted" | "denied";

export type PushTokenState = {
  permission: PushPermission;
  /** Null when permission is denied or Expo could not issue a token. */
  token: string | null;
};

/**
 * Ask for permission (a no-op prompt once answered) and read the current Expo
 * push token. Read fresh on every call: Expo can rotate the token, and a cached
 * one would silently stop alerts from arriving.
 *
 * A token failure (no EAS project id in a dev build, no network to Expo) is
 * reported as "no token" so registration can still go ahead without one.
 */
export async function getPushTokenState(): Promise<PushTokenState> {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { permission: "denied", token: null };
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return { permission: "granted", token: token.data };
  } catch (error) {
    console.warn("[nimbus] could not get an Expo push token", error);
    return { permission: "granted", token: null };
  }
}

/**
 * Call `onChange` when the OS issues a new push token, so the new one reaches
 * the server without waiting for the next launch. Returns an unsubscribe.
 */
export function onPushTokenChange(onChange: () => void): () => void {
  const subscription = Notifications.addPushTokenListener(() => onChange());
  return () => subscription.remove();
}

export async function scheduleDailyForecast(preferences: NotificationPreferences): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!preferences.dailyForecast) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Daily forecast",
      body: "Your latest weather summary is ready."
    },
    trigger: {
      // `type` is required by the current `NotificationTriggerInput` union, and
      // it is a real enum rather than a string literal — `type: "daily"` does
      // not assign to it. A bare { hour, minute, repeats } object matches no
      // member, so the daily forecast could not be scheduled at all.
      type: SchedulableTriggerInputTypes.DAILY,
      hour: 7,
      minute: 30
    }
  });
}

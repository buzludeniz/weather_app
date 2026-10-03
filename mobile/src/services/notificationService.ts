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

export async function requestNotificationToken(): Promise<string | null> {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
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

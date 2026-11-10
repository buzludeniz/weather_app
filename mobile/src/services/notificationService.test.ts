import * as Notifications from "expo-notifications";
import { DefaultUserPreferences } from "@nimbus/shared";
import { onPushTokenChange, scheduleDailyForecast } from "./notificationService";

describe("onPushTokenChange", () => {
  it("calls back on a new token and unsubscribes", () => {
    const remove = jest.fn();
    let listener: (() => void) | undefined;
    jest.mocked(Notifications.addPushTokenListener).mockImplementation((fn) => {
      listener = () => fn({ type: "ios", data: "x" });
      return { remove };
    });
    const onChange = jest.fn();

    const unsubscribe = onPushTokenChange(onChange);
    listener?.();
    unsubscribe();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleDailyForecast", () => {
  it("schedules nothing when the reminder is off", async () => {
    jest.mocked(Notifications.scheduleNotificationAsync).mockClear();
    await scheduleDailyForecast({ ...DefaultUserPreferences.notifications, dailyForecast: false });
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("schedules a daily reminder when it is on", async () => {
    await scheduleDailyForecast({ ...DefaultUserPreferences.notifications, dailyForecast: true });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ hour: 7, minute: 30 }) })
    );
  });
});

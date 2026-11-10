// Native modules the app touches at import time have no implementation under
// Jest. Each is replaced with an in-memory stand-in; tests override behaviour
// with jest.mocked(...) where they need to.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __reset: () => store.clear()
  };
});

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[test]" })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id")
}));

jest.mock("expo-notifications/build/Notifications.types", () => ({
  SchedulableTriggerInputTypes: { DAILY: "daily" }
}));

// The real icon component loads a font and sets state when it arrives, which
// lands outside act() in every screen test. Icons carry no text the tests read.
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

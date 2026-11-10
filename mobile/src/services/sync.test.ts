import { DefaultUserPreferences } from "@nimbus/shared";
import { defaultLocation, useLocationStore } from "../state/locationStore";
import { usePreferencesStore } from "../state/preferencesStore";
import { apiPut } from "./apiClient";
import { setInstallationId } from "./installationStore";
import { syncSavedLocations } from "./locationSyncService";
import { syncNotificationPreferences } from "./preferencesSyncService";

jest.mock("./apiClient", () => ({ apiPost: jest.fn(), apiPut: jest.fn(), apiGet: jest.fn() }));

const put = jest.mocked(apiPut);
const installation = "22222222-2222-4222-8222-222222222222";

beforeEach(async () => {
  put.mockReset().mockResolvedValue({});
  await setInstallationId(installation);
});

describe("syncSavedLocations", () => {
  it("does nothing and says so when the phone is not registered", async () => {
    await setInstallationId("");
    await expect(syncSavedLocations()).resolves.toBe("unregistered");
    expect(put).not.toHaveBeenCalled();
  });

  it("replaces the server's list with the store's, in order", async () => {
    const paris = { ...defaultLocation, id: "paris", name: "Paris", region: undefined, country: "France", isFavorite: false };
    useLocationStore.setState({ savedLocations: [paris, defaultLocation] });

    await expect(syncSavedLocations()).resolves.toBe("synced");

    expect(put).toHaveBeenCalledWith(`locations/saved/${installation}`, {
      locations: [
        expect.objectContaining({ id: "paris", name: "Paris", latitude: paris.coordinates.lat, sortOrder: 0 }),
        expect.objectContaining({ id: defaultLocation.id, sortOrder: 1 })
      ]
    });
  });

  // Regression: startup sync read the store before AsyncStorage had loaded it,
  // so the default one-city list could overwrite the user's real set on the server.
  it("waits for the saved list to load from disk before sending it", async () => {
    let finish: () => void = () => undefined;
    const hasHydrated = jest.spyOn(useLocationStore.persist, "hasHydrated").mockReturnValue(false);
    const onFinish = jest.spyOn(useLocationStore.persist, "onFinishHydration").mockImplementation((listener) => {
      finish = () => listener(useLocationStore.getState());
      return () => undefined;
    });

    const syncing = syncSavedLocations();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(put).not.toHaveBeenCalled();

    const restored = { ...defaultLocation, id: "restored", name: "Restored" };
    useLocationStore.setState({ savedLocations: [restored] });
    finish();
    await syncing;

    expect(put).toHaveBeenCalledWith(`locations/saved/${installation}`, {
      locations: [expect.objectContaining({ id: "restored" })]
    });
    hasHydrated.mockRestore();
    onFinish.mockRestore();
  });

  it("propagates a server failure", async () => {
    put.mockRejectedValue(new Error("Nimbus API error 404"));
    await expect(syncSavedLocations()).rejects.toThrow("404");
  });
});

describe("syncNotificationPreferences", () => {
  it("does nothing when the phone is not registered", async () => {
    await setInstallationId("");
    await expect(syncNotificationPreferences()).resolves.toBe("unregistered");
    expect(put).not.toHaveBeenCalled();
  });

  it("sends the notification settings the scanner reads", async () => {
    const notifications = { ...DefaultUserPreferences.notifications, severeAlerts: false, quietHoursStart: "21:00" };
    usePreferencesStore.setState({ preferences: { ...DefaultUserPreferences, notifications } });

    await expect(syncNotificationPreferences()).resolves.toBe("synced");
    expect(put).toHaveBeenCalledWith(`notifications/${installation}/preferences`, notifications);
  });
});

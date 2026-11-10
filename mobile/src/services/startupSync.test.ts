import { syncSavedLocations } from "./locationSyncService";
import { syncNotificationPreferences } from "./preferencesSyncService";
import { registerInstallation } from "./registrationService";
import { runStartupSync } from "./startupSync";

jest.mock("./registrationService", () => ({ registerInstallation: jest.fn() }));
jest.mock("./locationSyncService", () => ({ syncSavedLocations: jest.fn() }));
jest.mock("./preferencesSyncService", () => ({ syncNotificationPreferences: jest.fn() }));

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  jest.mocked(registerInstallation).mockImplementation(async () => {
    calls.push("register");
    return "id";
  });
  jest.mocked(syncSavedLocations).mockImplementation(async () => {
    calls.push("locations");
    return "synced";
  });
  jest.mocked(syncNotificationPreferences).mockImplementation(async () => {
    calls.push("preferences");
    return "synced";
  });
});

describe("runStartupSync", () => {
  it("registers before syncing what attaches to the installation", async () => {
    await runStartupSync();
    expect(calls).toEqual(["register", "locations", "preferences"]);
  });

  it("logs a failed step and carries on with the rest", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.mocked(registerInstallation).mockRejectedValue(new Error("offline"));

    await expect(runStartupSync()).resolves.toBeUndefined();

    expect(calls).toEqual(["locations", "preferences"]);
    expect(warn).toHaveBeenCalledWith("[nimbus] startup sync failed: registration", expect.any(Error));
    warn.mockRestore();
  });
});

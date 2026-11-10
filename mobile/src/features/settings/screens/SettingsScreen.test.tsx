import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { DefaultUserPreferences } from "@nimbus/shared";
import { Linking } from "react-native";
import { apiPost, apiPut } from "../../../services/apiClient";
import { setInstallationId } from "../../../services/installationStore";
import { registerInstallation, useRegistrationStore } from "../../../services/registrationService";
import { usePreferencesStore } from "../../../state/preferencesStore";
import { renderWithProviders } from "../../../test/render";
import { SettingsScreen } from "./SettingsScreen";

jest.mock("../../../services/apiClient", () => ({ apiGet: jest.fn(), apiPut: jest.fn(), apiPost: jest.fn() }));
jest.mock("../../../services/registrationService", () => {
  const { create } = jest.requireActual<typeof import("zustand")>("zustand");
  return {
    registerInstallation: jest.fn(async () => "id"),
    useRegistrationStore: create(() => ({ status: "registered", permission: "granted", hasPushToken: true, error: null }))
  };
});

const put = jest.mocked(apiPut);
const post = jest.mocked(apiPost);
const installation = "44444444-4444-4444-8444-444444444444";

function prefs() {
  return usePreferencesStore.getState().preferences;
}

beforeEach(async () => {
  put.mockReset().mockResolvedValue({});
  post.mockReset();
  jest.mocked(registerInstallation).mockClear();
  await setInstallationId(installation);
  usePreferencesStore.setState({ preferences: DefaultUserPreferences });
  useRegistrationStore.setState({ status: "registered", permission: "granted", hasPushToken: true, error: null });
});

afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("SettingsScreen", () => {
  it("changes units and theme", () => {
    renderWithProviders(<SettingsScreen />);

    fireEvent.press(screen.getByText("Imperial (°F, mph)"));
    expect(prefs().units).toBe("imperial");

    fireEvent.press(screen.getByText("Dark"));
    expect(prefs().theme).toBe("dark");
  });

  it("shows only settings something acts on", () => {
    renderWithProviders(<SettingsScreen />);
    expect(screen.queryByText(/rain/i)).toBeNull();
    expect(screen.queryByText(/air quality/i)).toBeNull();
    expect(screen.queryByText(/analytics/i)).toBeNull();
    expect(screen.queryByText(/language/i)).toBeNull();
  });

  it("toggles severe alerts and sends the change to the server", async () => {
    renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText("The alert server has these settings.")).toBeTruthy();

    put.mockClear();
    fireEvent(screen.getByLabelText("Severe weather alerts"), "valueChange", false);
    expect(prefs().notifications.severeAlerts).toBe(false);

    await waitFor(() => expect(put).toHaveBeenCalledWith(
      `notifications/${installation}/preferences`,
      expect.objectContaining({ severeAlerts: false })
    ));
  });

  it("edits quiet hours, wrapping past midnight", () => {
    renderWithProviders(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("Starts one hour later"));
    fireEvent.press(screen.getByLabelText("Starts one hour later"));
    expect(prefs().notifications.quietHoursStart).toBe("00:00");

    fireEvent.press(screen.getByLabelText("Ends one hour earlier"));
    expect(prefs().notifications.quietHoursEnd).toBe("06:00");
    expect(screen.getByLabelText("Ends 06:00")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Starts one hour earlier"));
    fireEvent.press(screen.getByLabelText("Ends one hour later"));
    expect(prefs().notifications).toMatchObject({ quietHoursStart: "23:00", quietHoursEnd: "07:00" });
  });

  it("toggles the daily reminder and reschedules it", async () => {
    renderWithProviders(<SettingsScreen />);
    jest.mocked(Notifications.scheduleNotificationAsync).mockClear();

    fireEvent(screen.getByLabelText("Daily forecast reminder"), "valueChange", false);
    expect(prefs().notifications.dailyForecast).toBe(false);
    await waitFor(() => expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("logs a scheduling failure instead of throwing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.mocked(Notifications.cancelAllScheduledNotificationsAsync).mockRejectedValueOnce(new Error("no permission"));
    renderWithProviders(<SettingsScreen />);

    fireEvent(screen.getByLabelText("Daily forecast reminder"), "valueChange", false);
    await waitFor(() => expect(warn).toHaveBeenCalledWith("[nimbus] could not schedule the daily forecast", expect.any(Error)));
    warn.mockRestore();
  });

  it("says when alerts can reach this phone", () => {
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText("This phone is registered for severe weather alerts.")).toBeTruthy();
    expect(screen.queryByLabelText("Register again")).toBeNull();
  });

  it("points to system settings when notifications are off", () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    useRegistrationStore.setState({ permission: "denied", hasPushToken: false });
    renderWithProviders(<SettingsScreen />);

    expect(screen.getByText(/turned off for Nimbus in system settings/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open system settings"));
    expect(openSettings).toHaveBeenCalled();
  });

  it("offers to register again after a failure, and logs a failed retry", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.mocked(registerInstallation).mockRejectedValueOnce(new Error("offline"));
    useRegistrationStore.setState({ status: "failed", error: "timeout" });
    renderWithProviders(<SettingsScreen />);

    expect(screen.getByText(/could not register with the alert server \(timeout\)/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Register again"));
    expect(registerInstallation).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(warn).toHaveBeenCalledWith("[nimbus] registration retry failed", expect.any(Error)));
    warn.mockRestore();
  });

  it("shows the pending state while registering", () => {
    useRegistrationStore.setState({ status: "registering" });
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText("Registering this phone with the alert server…")).toBeTruthy();
  });

  describe("developer test alert", () => {
    it("injects a severe alert for this installation and reports the scan", async () => {
      post.mockResolvedValue({ locationName: "Tirana", alertType: "wind", severity: "severe", pushesSent: 1, pushesSuppressed: 0 });
      renderWithProviders(<SettingsScreen />);

      fireEvent.press(screen.getByLabelText("Send a test severe alert"));
      expect(await screen.findByText("Injected a severe wind alert at Tirana: 1 push sent, 0 suppressed.")).toBeTruthy();
      expect(post).toHaveBeenCalledWith("notifications/synthetic-alert", {
        installationId: installation,
        alertType: "wind",
        severity: "severe"
      });
    });

    it("reports the server's refusal, e.g. the 404 from production", async () => {
      post.mockRejectedValue(new Error("Nimbus API error 404 (notifications/synthetic-alert): Not Found"));
      renderWithProviders(<SettingsScreen />);

      fireEvent.press(screen.getByLabelText("Send a test severe alert"));
      expect(await screen.findByText(/Nimbus API error 404/)).toBeTruthy();
    });

    it("refuses before registration, without calling the server", async () => {
      await setInstallationId("");
      renderWithProviders(<SettingsScreen />);

      fireEvent.press(screen.getByLabelText("Send a test severe alert"));
      expect(await screen.findByText("This phone is not registered with the alert server yet.")).toBeTruthy();
      expect(post).not.toHaveBeenCalled();
    });

    it("stringifies a non-Error failure", async () => {
      post.mockRejectedValue("boom");
      renderWithProviders(<SettingsScreen />);
      fireEvent.press(screen.getByLabelText("Send a test severe alert"));
      expect(await screen.findByText("boom")).toBeTruthy();
    });
  });
});

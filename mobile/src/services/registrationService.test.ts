import * as Notifications from "expo-notifications";
import { DefaultUserPreferences } from "@nimbus/shared";
import { usePreferencesStore } from "../state/preferencesStore";
import { apiPost } from "./apiClient";
import { getDeviceId, getInstallationId } from "./installationStore";
import {
  buildRegistrationPayload,
  registerInstallation,
  toRegistrationPlatform,
  useRegistrationStore
} from "./registrationService";

jest.mock("./apiClient", () => ({ apiPost: jest.fn(), apiPut: jest.fn(), apiGet: jest.fn() }));

const post = jest.mocked(apiPost);
const permissions = jest.mocked(Notifications.requestPermissionsAsync);
const token = jest.mocked(Notifications.getExpoPushTokenAsync);

async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 50 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(condition()).toBe(true);
}

function waitForCalls(count: number) {
  return waitFor(() => post.mock.calls.length >= count);
}

beforeEach(() => {
  post.mockReset();
  permissions.mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>);
  token.mockResolvedValue({ type: "expo", data: "ExponentPushToken[one]" });
  usePreferencesStore.setState({ preferences: { ...DefaultUserPreferences, units: "imperial", language: "sq" } });
  useRegistrationStore.setState({ status: "idle", permission: null, hasPushToken: false, error: null });
});

describe("buildRegistrationPayload", () => {
  it("includes the token when there is one", () => {
    expect(buildRegistrationPayload({ deviceId: "d", pushToken: "t", platform: "ios", language: "en", units: "metric" }))
      .toEqual({ deviceId: "d", pushToken: "t", platform: "ios", language: "en", units: "metric" });
  });

  it("omits the token rather than sending null", () => {
    const payload = buildRegistrationPayload({ deviceId: "d", pushToken: null, platform: "android", language: "en", units: "metric" });
    expect(payload).not.toHaveProperty("pushToken");
  });
});

describe("toRegistrationPlatform", () => {
  it("maps the platforms the API accepts and treats everything else as web", () => {
    expect(toRegistrationPlatform("ios")).toBe("ios");
    expect(toRegistrationPlatform("android")).toBe("android");
    expect(toRegistrationPlatform("windows")).toBe("web");
  });
});

describe("registerInstallation", () => {
  it("posts the device, token, platform and preferences, then stores the installation id", async () => {
    post.mockResolvedValue({ installationId: "11111111-1111-4111-8111-111111111111" });

    await expect(registerInstallation()).resolves.toBe("11111111-1111-4111-8111-111111111111");

    const deviceId = await getDeviceId();
    expect(post).toHaveBeenCalledWith("notifications/register", {
      deviceId,
      pushToken: "ExponentPushToken[one]",
      platform: "ios",
      language: "sq",
      units: "imperial"
    });
    expect(await getInstallationId()).toBe("11111111-1111-4111-8111-111111111111");
    expect(useRegistrationStore.getState()).toMatchObject({ status: "registered", permission: "granted", hasPushToken: true });
  });

  it("keeps the same device id across registrations", async () => {
    post.mockResolvedValue({ installationId: "id" });
    await registerInstallation();
    await registerInstallation();
    const [first, second] = post.mock.calls.map((call) => (call[1] as { deviceId: string }).deviceId);
    expect(first).toBe(second);
  });

  it("re-reads the push token on every registration, so a rotated token reaches the server", async () => {
    post.mockResolvedValue({ installationId: "id" });
    await registerInstallation();
    token.mockResolvedValue({ type: "expo", data: "ExponentPushToken[two]" });
    await registerInstallation();
    expect((post.mock.calls[1]?.[1] as { pushToken: string }).pushToken).toBe("ExponentPushToken[two]");
  });

  it("still registers, without a token, when permission is denied", async () => {
    permissions.mockResolvedValue({ granted: false } as Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>);
    post.mockResolvedValue({ installationId: "id" });

    await registerInstallation();

    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("pushToken");
    expect(useRegistrationStore.getState()).toMatchObject({ status: "registered", permission: "denied", hasPushToken: false });
  });

  it("still registers when Expo cannot issue a token", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    token.mockRejectedValue(new Error("no projectId"));
    post.mockResolvedValue({ installationId: "id" });

    await registerInstallation();

    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("pushToken");
    expect(useRegistrationStore.getState()).toMatchObject({ permission: "granted", hasPushToken: false });
    warn.mockRestore();
  });

  it("records the failure and rethrows it", async () => {
    post.mockRejectedValue(new Error("Nimbus API error 500"));
    await expect(registerInstallation()).rejects.toThrow("Nimbus API error 500");
    expect(useRegistrationStore.getState()).toMatchObject({ status: "failed", error: "Nimbus API error 500" });
  });

  it("treats a response without an installation id as a failure", async () => {
    post.mockResolvedValue({ installationId: null });
    await expect(registerInstallation()).rejects.toThrow("did not return an installation id");
    expect(useRegistrationStore.getState().status).toBe("failed");
  });

  it("shares the in-flight request, then registers once more so a token that changed meanwhile is sent", async () => {
    post.mockResolvedValue({ installationId: "id" });
    const first = registerInstallation();
    // The token rotates while the first request (which read the old one) is in flight.
    token.mockResolvedValue({ type: "expo", data: "ExponentPushToken[rotated]" });
    const second = registerInstallation();
    const third = registerInstallation();
    expect(second).toBe(first);
    expect(third).toBe(first);

    await first;
    await waitForCalls(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(post).toHaveBeenCalledTimes(2);
    expect((post.mock.calls[1]?.[1] as { pushToken: string }).pushToken).toBe("ExponentPushToken[rotated]");
  });

  it("does not register again when nothing arrived during the request", async () => {
    post.mockResolvedValue({ installationId: "id" });
    await registerInstallation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("logs a failed follow-up registration instead of leaving it unhandled", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    post.mockResolvedValueOnce({ installationId: "id" }).mockRejectedValueOnce(new Error("offline"));
    const first = registerInstallation();
    void registerInstallation();
    await first;
    await waitFor(() => warn.mock.calls.some((call) => call[0] === "[nimbus] follow-up registration failed"));
    warn.mockRestore();
  });
});

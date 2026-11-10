import { describePushStatus } from "./pushStatus";
import { describeTestAlert } from "./hooks";

const base = { status: "registered" as const, permission: "granted" as const, hasPushToken: true, error: null };

describe("describePushStatus", () => {
  it("says alerts can reach the phone only when registered with a token", () => {
    expect(describePushStatus(base)).toEqual({ tone: "ok", text: "This phone is registered for severe weather alerts.", action: null });
  });

  it("points to system settings when permission is denied", () => {
    expect(describePushStatus({ ...base, permission: "denied", hasPushToken: false })).toMatchObject({ tone: "warning", action: "open-settings" });
  });

  it("offers a retry when registered without a token", () => {
    expect(describePushStatus({ ...base, hasPushToken: false })).toMatchObject({ tone: "warning", action: "retry" });
  });

  it("shows a failed registration with its reason", () => {
    const view = describePushStatus({ ...base, status: "failed", error: "timeout" });
    expect(view).toMatchObject({ tone: "error", action: "retry" });
    expect(view.text).toContain("(timeout)");
    expect(describePushStatus({ ...base, status: "failed", error: null }).text).not.toContain("(");
  });

  it("is pending before registration finishes", () => {
    expect(describePushStatus({ ...base, status: "idle" }).tone).toBe("pending");
    expect(describePushStatus({ ...base, status: "registering" }).tone).toBe("pending");
  });
});

describe("describeTestAlert", () => {
  it("reports what the scan did, including zero pushes", () => {
    const result = { locationName: "Tirana", alertType: "wind", severity: "severe", pushesSent: 0, pushesSuppressed: 1 };
    expect(describeTestAlert(result)).toBe("Injected a severe wind alert at Tirana: 0 pushes sent, 1 suppressed.");
    expect(describeTestAlert({ ...result, pushesSent: 1, pushesSuppressed: 0 })).toContain("1 push sent, 0 suppressed");
  });
});

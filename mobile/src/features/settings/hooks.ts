import { useState } from "react";
import { apiPost } from "../../services/apiClient";
import { getInstallationId } from "../../services/installationStore";

/** The fields of the API's `InjectResult` this screen reads. */
export type SyntheticAlertResult = {
  locationName: string;
  alertType: string;
  severity: string;
  pushesSent: number;
  pushesSuppressed: number;
};

export function describeTestAlert(result: SyntheticAlertResult): string {
  const pushes = result.pushesSent === 1 ? "1 push sent" : `${result.pushesSent} pushes sent`;
  return `Injected a ${result.severity} ${result.alertType} alert at ${result.locationName}: ${pushes}, ${result.pushesSuppressed} suppressed.`;
}

type TestAlertState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "done"; message: string }
  | { phase: "failed"; message: string };

/**
 * T6/T8: drive `POST /v1/notifications/synthetic-alert` from the phone, for
 * checking end to end that a push arrives. The route only exists on
 * non-production servers; against production this reports the 404.
 */
export function useTestAlert() {
  const [state, setState] = useState<TestAlertState>({ phase: "idle" });

  async function send() {
    setState({ phase: "sending" });
    try {
      const installationId = await getInstallationId();
      if (installationId == null || installationId === "") {
        setState({ phase: "failed", message: "This phone is not registered with the alert server yet." });
        return;
      }
      const result = await apiPost<SyntheticAlertResult>("notifications/synthetic-alert", {
        installationId,
        alertType: "wind",
        severity: "severe"
      });
      setState({ phase: "done", message: describeTestAlert(result) });
    } catch (error) {
      setState({ phase: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return { state, send };
}

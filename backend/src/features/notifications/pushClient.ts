import { env } from "../../config/env.js";

/**
 * Client for Expo's push notification service.
 *
 * Chosen over talking to APNs and FCM directly because the app is already an
 * Expo app using `expo-notifications`, and the device registers an Expo push
 * token. Going direct would mean holding Apple and Google credentials and
 * reimplementing token translation for no benefit at this scale.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo rejects a single message larger than this. */
const MAX_PAYLOAD_BYTES = 4_096;

export type PushMessage = {
  title: string;
  body: string;
  /** Arbitrary key-values delivered to the app, e.g. to deep-link on tap. */
  data?: Record<string, string>;
  sound?: string;
};

/**
 * Outcome of a single send attempt.
 *
 * `device_not_registered` is deliberately distinct: that token is dead, usually
 * because the app was uninstalled. Retrying it forever would fill the audit log
 * with failures, so the caller clears the token instead.
 */
export type PushOutcome =
  | "sent"
  | "rejected"
  | "device_not_registered"
  | "failed";

export type PushResult = {
  outcome: PushOutcome;
  /** Expo's ticket id, present when the send was accepted. */
  ticketId?: string;
  error?: string;
};

function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  // Trim on a character boundary rather than mid-codepoint, which would
  // produce a replacement character in the notification body.
  let result = text;
  while (result.length > 0 && Buffer.byteLength(result, "utf8") > maxBytes) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function buildPayload(token: string, message: PushMessage) {
  const payload: Record<string, unknown> = {
    to: token,
    sound: message.sound ?? "default",
    title: truncateToBytes(message.title, 200),
    body: truncateToBytes(message.body, MAX_PAYLOAD_BYTES - 200),
  };
  if (message.data) payload.data = message.data;
  return payload;
}

/**
 * Send one push notification.
 *
 * Never throws: transport failures are reported as `failed` so the caller's
 * scan loop can record the attempt and retry on the next tick rather than
 * aborting the whole scan.
 */
export async function sendPush(token: string, message: PushMessage): Promise<PushResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json"
  };
  if (env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(buildPayload(token, message)),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      return { outcome: "failed", error: `Expo push returned ${response.status}` };
    }

    const body = (await response.json()) as {
      data?: { status?: string; id?: string };
      errors?: Array<{ code?: string; message?: string }>;
    };

    // Errors can arrive at the top level (the request was rejected outright) or
    // inside `data` when the ticket itself was refused.
    const topLevelError = body.errors?.[0];
    if (topLevelError) {
      const message = topLevelError.message ?? topLevelError.code ?? "rejected by Expo";
      if (topLevelError.code === "DeviceNotRegistered") {
        return { outcome: "device_not_registered", error: message };
      }
      return { outcome: "rejected", error: message };
    }

    if (body.data?.status === "ok") {
      return { outcome: "sent", ticketId: body.data.id };
    }

    return { outcome: "rejected", error: "Expo accepted the request but refused the ticket" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: "failed", error: message };
  }
}

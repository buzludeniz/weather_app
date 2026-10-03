import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPush } from "../../src/features/notifications/pushClient.js";

/**
 * The push client is the only place the server talks to Expo, so these tests
 * pin the parts the alert loop branches on: a dead device token must be
 * distinguishable from a transient failure, because one is cleared and the
 * other is retried.
 */

const originalFetch = global.fetch;

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (async () => ({}))
  })) as unknown as typeof fetch;
  global.fetch = fetchMock;
  return fetchMock;
}

const message = { title: "Severe wind in Tirana", body: "Gusts around 80 km/h." };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("sendPush", () => {
  it("reports an accepted ticket", async () => {
    mockFetch({ ok: true, json: async () => ({ data: { status: "ok", id: "ticket-1" } }) });

    const result = await sendPush("ExponentPushToken[abc]", message);

    expect(result.outcome).toBe("sent");
    expect(result.ticketId).toBe("ticket-1");
  });

  it("distinguishes a dead device token from a generic rejection", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ errors: [{ code: "DeviceNotRegistered", message: "gone" }] })
    });

    const result = await sendPush("ExponentPushToken[abc]", message);

    expect(result.outcome).toBe("device_not_registered");
  });

  it("reports other Expo errors as rejected", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ errors: [{ code: "MessageTooBig", message: "too big" }] })
    });

    const result = await sendPush("ExponentPushToken[abc]", message);

    expect(result.outcome).toBe("rejected");
    expect(result.error).toContain("too big");
  });

  it("treats a non-2xx response as a retryable failure", async () => {
    mockFetch({ ok: false, status: 503, json: async () => ({}) });

    const result = await sendPush("ExponentPushToken[abc]", message);

    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("503");
  });

  it("never throws on a network error", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const result = await sendPush("ExponentPushToken[abc]", message);

    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("treats an accepted request with a refused ticket as rejected", async () => {
    mockFetch({ ok: true, json: async () => ({ data: { status: "error" } }) });

    const result = await sendPush("ExponentPushToken[abc]", message);

    expect(result.outcome).toBe("rejected");
  });

  it("sends the token, title, and body in the request body", async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({ data: { status: "ok" } }) });

    await sendPush("ExponentPushToken[abc]", { ...message, data: { locationKey: "k" } });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const parsed = JSON.parse(String(init.body));
    expect(parsed.to).toBe("ExponentPushToken[abc]");
    expect(parsed.title).toBe(message.title);
    expect(parsed.body).toBe(message.body);
    expect(parsed.data).toEqual({ locationKey: "k" });
  });
});

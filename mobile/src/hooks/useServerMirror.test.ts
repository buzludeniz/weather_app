import { act, renderHook } from "@testing-library/react-native";
import type { SyncOutcome } from "../services/locationSyncService";
import { useServerMirror } from "./useServerMirror";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function flush(ms = 600) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe("useServerMirror", () => {
  it("syncs on mount and reports what the sync returned", async () => {
    const sync = jest.fn(async (): Promise<SyncOutcome> => "synced");
    const { result } = renderHook(() => useServerMirror(1, sync));
    expect(result.current.status).toBe("syncing");

    await flush();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("synced");
  });

  it("reports an unregistered phone as such, not as synced", async () => {
    const { result } = renderHook(() => useServerMirror(1, async () => "unregistered" as const));
    await flush();
    expect(result.current.status).toBe("unregistered");
  });

  it("debounces a burst of changes into one request", async () => {
    const sync = jest.fn(async (): Promise<SyncOutcome> => "synced");
    const { rerender } = renderHook(({ value }: { value: number }) => useServerMirror(value, sync), { initialProps: { value: 1 } });
    await flush();
    sync.mockClear();

    rerender({ value: 2 });
    await flush(200);
    rerender({ value: 3 });
    await flush(200);
    expect(sync).not.toHaveBeenCalled();

    await flush(600);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("reports a failure with its message, and retry runs the sync again", async () => {
    const sync = jest.fn<Promise<SyncOutcome>, []>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("synced");
    const { result } = renderHook(() => useServerMirror("x", sync));
    await flush();
    expect(result.current).toMatchObject({ status: "failed", error: "offline" });

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });
    expect(result.current).toMatchObject({ status: "synced", error: null });
  });

  it("stringifies a non-Error rejection", async () => {
    const { result } = renderHook(() => useServerMirror("x", () => Promise.reject("boom")));
    await flush();
    expect(result.current.error).toBe("boom");
  });

  it("ignores a slow earlier request that finishes after a newer one", async () => {
    let resolveFirst: (outcome: SyncOutcome) => void = () => undefined;
    const sync = jest
      .fn<Promise<SyncOutcome>, []>()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error("newer failed"));
    const { result } = renderHook(() => useServerMirror("x", sync));
    await flush();

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });
    await act(async () => {
      resolveFirst("synced");
      await Promise.resolve();
    });

    expect(result.current.status).toBe("failed");
  });

  it("does not update state after unmount", async () => {
    let resolve: (outcome: SyncOutcome) => void = () => undefined;
    const sync = jest.fn(() => new Promise<SyncOutcome>((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useServerMirror("x", sync));
    await flush();
    unmount();
    await act(async () => {
      resolve("synced");
      await Promise.resolve();
    });
    expect(result.current.status).toBe("syncing");
  });
});

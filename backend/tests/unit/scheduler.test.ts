import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlertScheduler } from "../../src/jobs/scheduler.js";

/**
 * The scheduler is tested through a fresh instance per test. That is the reason
 * its state lives inside `createAlertScheduler` rather than at module scope,
 * where a hung scan would latch the overlap guard shut for good.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAlertScheduler", () => {
  it("runs a scan", async () => {
    const scan = vi.fn(async () => undefined);
    const scheduler = createAlertScheduler({ scan });

    await scheduler.runOnce();

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("does not start a second scan while one is still running", async () => {
    let release: () => void = () => {};
    const scan = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const scheduler = createAlertScheduler({ scan });

    const first = scheduler.runOnce();
    expect(scheduler.isRunning()).toBe(true);

    await scheduler.runOnce();
    expect(scan).toHaveBeenCalledTimes(1);

    release();
    await first;

    // The guard is released once the first scan finishes. Not awaited: this
    // scan is deliberately unresolved, and awaiting it would hang the test.
    expect(scheduler.isRunning()).toBe(false);
    void scheduler.runOnce();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("survives a scan that throws", async () => {
    const scan = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValue(undefined);
    const scheduler = createAlertScheduler({ scan });

    await expect(scheduler.runOnce()).resolves.toBeUndefined();
    expect(scheduler.isRunning()).toBe(false);

    // A throw must not leave the scheduler permanently blocked.
    await scheduler.runOnce();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("releases the overlap guard when a scan exceeds its maximum runtime", async () => {
    // A hung scan must not stop the scheduler for the life of the process.
    const scan = vi.fn(() => new Promise<void>(() => {}));
    const scheduler = createAlertScheduler({ scan, maxRunMs: 1_000 });

    void scheduler.runOnce();
    expect(scheduler.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(scheduler.isRunning()).toBe(false);

    // And a later tick is able to run again. Not awaited: this scan also hangs
    // by construction, which is the point.
    void scheduler.runOnce();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("ticks on the configured interval", async () => {
    const scan = vi.fn(async () => undefined);
    const scheduler = createAlertScheduler({ scan });
    scheduler.start(1_000);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(scan).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(scan).toHaveBeenCalledTimes(3);
  });

  it("scans shortly after starting rather than waiting a whole interval", async () => {
    // A restart should not leave a full interval of uncovered weather.
    const scan = vi.fn(async () => undefined);
    const scheduler = createAlertScheduler({ scan });
    scheduler.start(1_000_000);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("does not schedule a second interval when started twice", async () => {
    const scan = vi.fn(async () => undefined);
    const scheduler = createAlertScheduler({ scan });
    scheduler.start(1_000);
    scheduler.start(1_000);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("stops ticking once stopped", async () => {
    const scan = vi.fn(async () => undefined);
    const scheduler = createAlertScheduler({ scan });
    scheduler.start(1_000);
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(scan).not.toHaveBeenCalled();
  });

  it("cancels the pending boot scan when stopped", async () => {
    // Stopping immediately after start must not still run a scan a few seconds
    // later, which is what an uncleared boot timer would do.
    const scan = vi.fn(async () => undefined);
    const scheduler = createAlertScheduler({ scan });
    scheduler.start(1_000_000);
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(scan).not.toHaveBeenCalled();
  });

  it("keeps separate instances independent", async () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    const a = createAlertScheduler({ scan: first });
    const b = createAlertScheduler({ scan: second });

    await a.runOnce();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

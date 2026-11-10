import { waitForHydration } from "./hydration";

function fakeStore(hydrated: boolean) {
  const listeners = new Set<() => void>();
  const unsubscribe = jest.fn();
  return {
    persist: {
      hasHydrated: () => hydrated,
      onFinishHydration: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          unsubscribe();
          listeners.delete(listener);
        };
      }
    },
    finish: () => listeners.forEach((listener) => listener()),
    unsubscribe
  };
}

describe("waitForHydration", () => {
  it("resolves immediately when the store has already hydrated", async () => {
    await expect(waitForHydration(fakeStore(true))).resolves.toBeUndefined();
  });

  it("waits for hydration to finish, then unsubscribes", async () => {
    const store = fakeStore(false);
    let done = false;
    const waiting = waitForHydration(store).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    store.finish();
    await waiting;
    expect(done).toBe(true);
    expect(store.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

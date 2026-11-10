/**
 * Wait until a zustand `persist` store has loaded what it saved on disk.
 *
 * Until then `getState()` returns the in-code defaults. Startup sync used to
 * read the store immediately, so a slow AsyncStorage read could send the
 * default single-city list to `PUT /locations/saved/:id` and replace the user's
 * real set on the server, which is the set the alert scanner watches.
 */
type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (listener: () => void) => () => void;
};

export function waitForHydration(store: { persist: PersistApi }): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

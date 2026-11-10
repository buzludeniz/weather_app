import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncOutcome } from "../services/locationSyncService";

export type MirrorStatus = "syncing" | SyncOutcome | "failed";

export type ServerMirror = {
  status: MirrorStatus;
  error: string | null;
  retry: () => void;
};

/**
 * Keep the server's copy of `value` in step with the phone: run `sync` on mount
 * and again `delayMs` after `value` last changed, so a burst of edits makes one
 * request. Only the newest request's result is reported; an older one finishing
 * late cannot overwrite it.
 *
 * The status is what actually happened. It never claims "synced" for a value
 * that has not been sent yet.
 */
export function useServerMirror<T>(
  value: T,
  sync: () => Promise<SyncOutcome>,
  delayMs = 600
): ServerMirror {
  const [status, setStatus] = useState<MirrorStatus>("syncing");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const mounted = useRef(true);
  // Held in a ref so an inline `sync` does not change `run` on every render,
  // which would re-arm the effect below and sync in a loop.
  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(() => {
    const id = ++latest.current;
    const current = () => mounted.current && id === latest.current;
    setStatus("syncing");
    syncRef.current().then(
      (outcome) => {
        if (!current()) return;
        setStatus(outcome);
        setError(null);
      },
      (reason: unknown) => {
        if (!current()) return;
        setStatus("failed");
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    );
  }, []);

  useEffect(() => {
    setStatus("syncing");
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  }, [value, run, delayMs]);

  return { status, error, retry: run };
}

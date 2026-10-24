// Polling for asynchronous changes: operations, and instance and database orders.

import { WaitTimeoutError } from "./errors.js";
import { sleep } from "./util.js";

export interface WaitOptions<T = unknown> {
  /** Give up after this many milliseconds. Default 20 minutes. */
  timeoutMs?: number;
  /** Milliseconds between polls. Default 2000. */
  pollIntervalMs?: number;
  /** Stops waiting (and the request in flight). */
  signal?: AbortSignal;
  /** Called with each state read while waiting. */
  onUpdate?: (value: T) => void;
}

export const DEFAULT_WAIT_TIMEOUT_MS = 20 * 60_000;
export const DEFAULT_POLL_INTERVAL_MS = 2_000;

/**
 * Calls `read` until `done` returns true (resolve) or throws (fail), or the
 * deadline passes.
 */
export async function poll<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  what: string,
  options: WaitOptions<T> = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const interval = Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    options.onUpdate?.(value);
    if (done(value)) return value;
    if (Date.now() + interval > deadline) {
      throw new WaitTimeoutError(
        `${what} did not finish within ${Math.round(timeoutMs / 1000)} seconds. It may still finish: check it again later.`,
      );
    }
    await sleep(interval, options.signal);
  }
}

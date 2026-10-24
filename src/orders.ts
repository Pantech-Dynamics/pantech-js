// Waiting for an instance or database order: paid, then provisioned, then
// (by default) its create operation finished.

import type { Pantech } from "./client.js";
import { OrderFailedError } from "./errors.js";
import { DEFAULT_WAIT_TIMEOUT_MS, poll, type WaitOptions } from "./wait.js";

export interface OrderWaitOptions<T> extends WaitOptions<T> {
  /**
   * Also wait for the order's create operation once it is provisioned, so
   * the instance or database is ready to use. Default true.
   */
  waitForOperation?: boolean;
}

interface OrderLike {
  status: string;
  operation_id?: string | null;
  failure_code?: string | null;
}

/** An order id, or the `202` body of a create that carries one. */
export type OrderRef = string | { order_id: string };

export const orderId = (ref: OrderRef): string => (typeof ref === "string" ? ref : ref.order_id);

export async function waitForOrder<T extends OrderLike>(
  client: Pantech,
  read: (signal?: AbortSignal) => Promise<T>,
  what: string,
  options: OrderWaitOptions<T> = {},
): Promise<T> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const order = await poll(
    () => read(options.signal),
    (o) => {
      if (o.status === "failed" || o.status === "payment_failed") {
        const code = o.failure_code ?? o.status;
        throw new OrderFailedError(
          `${what} ${o.status === "payment_failed" ? "could not be paid" : "failed"} (${code}). Any payment taken is returned to your credit.`,
          o,
          { code },
        );
      }
      return o.status === "provisioned";
    },
    what,
    options,
  );
  if (options.waitForOperation !== false && order.operation_id) {
    await client.operations.wait(order.operation_id, {
      timeoutMs: Math.max(0, timeoutMs - (Date.now() - started)),
      pollIntervalMs: options.pollIntervalMs,
      signal: options.signal,
    });
  }
  return order;
}

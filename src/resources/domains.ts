import type { RequestOptions } from "../client.js";
import { OrderFailedError, PaymentRequiredError } from "../errors.js";
import type { DomainOrder } from "../models.js";
import { APIResource } from "../resource.js";
import type {
  BodyOf as B,
  ItemOf as I,
  ListParams as L,
  ListAllParams as LA,
  QueryOf as Q,
  ResponseOf as R,
} from "../types.js";
import { path } from "../util.js";
import { poll, type WaitOptions } from "../wait.js";

const ORDER_WAIT_MS = 15 * 60_000;

/** A domain order's id, or the `202` body of a register, transfer or renew. */
export type DomainOrderRef = string | { order: { id: string } };

/** Options for `orders.wait`. */
export interface DomainOrderWaitOptions extends WaitOptions<DomainOrder> {
  /**
   * Keep waiting while the order is `awaiting_payment` (while the user
   * confirms the card payment at its `payment_url`, or adds credit). By
   * default such an order rejects at once with PaymentRequiredError.
   */
  waitForPayment?: boolean;
}

const domainOrderId = (ref: DomainOrderRef): string => (typeof ref === "string" ? ref : ref.order.id);

/**
 * Domains bought or transferred in through Pantech, paid from your credit
 * before the registry is asked. A registered domain's zone is hosted on
 * Pantech DNS. The registrant contact is personal data: read it only where
 * you need it.
 */
export class Domains extends APIResource {
  /** Registrations, renewals and transfers. */
  readonly orders: DomainOrders = new DomainOrders(this._client);

  /** Every TLD for sale to your organization, priced per year in minor units of its currency. */
  listTlds(options?: RequestOptions): Promise<R<"listDomainTLDs">> {
    return this._get("/domains/tlds", undefined, options);
  }

  /** Checks a name across the TLDs for sale, plus suggestions, each with its price. */
  search(params: Q<"searchDomains">, options?: RequestOptions): Promise<R<"searchDomains">> {
    return this._get("/domains/search", params, options);
  }

  /** Whether the registry lets the domain move to Pantech now, and what it costs. */
  checkTransfer(params: Q<"checkDomainTransfer">, options?: RequestOptions): Promise<R<"checkDomainTransfer">> {
    return this._get("/domains/transfer-check", params, options);
  }

  list(params: L<"listDomains"> = {}, options?: RequestOptions): Promise<R<"listDomains">> {
    return this._get("/domains", params, options);
  }

  listAll(params: LA<"listDomains"> = {}, options?: RequestOptions): AsyncGenerator<I<"listDomains">> {
    return this._listAll("/domains", params, options);
  }

  /**
   * Buys the domain for `years` (1 to 10), paid from your credit first; a
   * failed order is refunded. `accept_terms` must be true. Follow the order
   * with `orders.wait(result)`.
   */
  register(body: B<"registerDomain">, options?: RequestOptions): Promise<R<"registerDomain">> {
    return this._post("/domains", body, options);
  }

  /** Moves a domain to Pantech with its auth code, adding `years` to its term. Follow it with `orders.wait`. */
  transfer(body: B<"transferDomain">, options?: RequestOptions): Promise<R<"transferDomain">> {
    return this._post("/domains/transfers", body, options);
  }

  get(domainId: string, options?: RequestOptions): Promise<R<"getDomain">> {
    return this._get(path`/domains/${domainId}`, undefined, options);
  }

  /** Turns auto-renew, the transfer lock or privacy on or off. */
  update(domainId: string, body: B<"updateDomain">, options?: RequestOptions): Promise<R<"updateDomain">> {
    return this._patch(path`/domains/${domainId}`, body, options);
  }

  /** Points the domain at its Pantech DNS zone, or at up to 6 custom name servers. */
  setNameServers(
    domainId: string,
    body: B<"setDomainNameServers">,
    options?: RequestOptions,
  ): Promise<R<"setDomainNameServers">> {
    return this._put(path`/domains/${domainId}/name-servers`, body, options);
  }

  /** The registrant contact. Owners and admins only. */
  getContact(domainId: string, options?: RequestOptions): Promise<R<"getDomainContact">> {
    return this._get(path`/domains/${domainId}/contact`, undefined, options);
  }

  /** Replaces the registrant contact; applied at the registry in the background. */
  updateContact(
    domainId: string,
    body: B<"updateDomainContact">,
    options?: RequestOptions,
  ): Promise<R<"updateDomainContact">> {
    return this._put(path`/domains/${domainId}/contact`, body, options);
  }

  /** Adds `years` (default 1) to the domain's term, paid from your credit first. */
  renew(domainId: string, body: B<"renewDomain"> = {}, options?: RequestOptions): Promise<R<"renewDomain">> {
    return this._post(path`/domains/${domainId}/renew`, body, options);
  }

  /**
   * Asks for the code that moves the domain to another registrar. Needs the
   * `delete` scope, and the transfer lock off. Read it with `getAuthCode`.
   */
  requestAuthCode(domainId: string, options?: RequestOptions): Promise<R<"requestDomainAuthCode">> {
    return this._post(path`/domains/${domainId}/auth-code`, undefined, options);
  }

  /** The auth code once it has arrived, or `{ status: "pending" }` while it is on its way. */
  getAuthCode(domainId: string, options?: RequestOptions): Promise<R<"getDomainAuthCode">> {
    return this._get(path`/domains/${domainId}/auth-code`, undefined, options);
  }
}

export class DomainOrders extends APIResource {
  /** A domain's registrations, renewals and transfers, newest first. */
  list(domainId: string, options?: RequestOptions): Promise<R<"listDomainOrders">> {
    return this._get(path`/domains/${domainId}/orders`, undefined, options);
  }

  get(orderId: string, options?: RequestOptions): Promise<R<"getDomainOrder">> {
    return this._get(path`/domain-orders/${orderId}`, undefined, options);
  }

  /**
   * Makes an order waiting in `awaiting_payment` try its payment again now,
   * and wait another hour: in US dollars the saved card is charged the
   * difference once more (after a decline, or once a new card is saved); in
   * naira the credit just added is taken. The call charges nothing itself
   * and an order is never charged twice, so repeating it is safe. Resolves
   * with the order (`202`); follow it with `wait(order, { waitForPayment: true })`.
   * Rejects with ConflictError `DOMAIN_ORDER_NOT_AWAITING_PAYMENT` when the
   * order is not waiting for a payment or its window has ended.
   */
  retryPayment(orderId: string, options?: RequestOptions): Promise<R<"retryDomainOrderPayment">> {
    return this._post(path`/domain-orders/${orderId}/retry-payment`, undefined, options);
  }

  /**
   * Polls the order until it `succeeded` (resolves with it) or `failed`
   * (rejects with OrderFailedError; any amount taken is returned to your
   * credit). An order your credit does not cover waits in `awaiting_payment`
   * for an hour (in US dollars the saved card is charged the difference; in
   * naira the user adds credit): it rejects with PaymentRequiredError carrying
   * `paymentExpiresAt`, and `paymentUrl` only when the bank asks the user to
   * confirm the payment; wait again with `{ waitForPayment: true }`, or call
   * `retryPayment` to try again at once. An order not paid in time fails
   * `insufficient_credit` and nothing is charged. Default timeout 15 minutes,
   * polling every 5 seconds. A transfer can take days: pass a longer
   * `timeoutMs`, or check the order later.
   */
  wait(ref: DomainOrderRef, options: DomainOrderWaitOptions = {}): Promise<DomainOrder> {
    const id = domainOrderId(ref);
    const { waitForPayment, ...waitOptions } = options;
    return poll(
      () => this.get(id, { signal: options.signal }),
      (o) => {
        if (o.status === "awaiting_payment" && !waitForPayment) {
          // The payment link stays out of the message, so it is not logged.
          throw new PaymentRequiredError(
            `Domain order ${o.id} is waiting for a payment: your credit does not cover it.${o.payment_url ? " The bank asks the user to confirm the card payment at paymentUrl." : ""} It must be paid${o.payment_expires_at ? ` before ${o.payment_expires_at}` : " within the hour"}; the order goes on by itself once it is, and retryPayment tries again at once.`,
            {
              status: 402,
              code: "AWAITING_PAYMENT",
              paymentUrl: o.payment_url ?? undefined,
              paymentExpiresAt: o.payment_expires_at ?? undefined,
              order: o,
            },
          );
        }
        if (o.status === "failed") {
          const code = o.failure_code ?? "failed";
          throw new OrderFailedError(
            `Domain order ${o.id} failed (${code}).${o.refunded ? " The amount was returned to your credit." : ""}`,
            o,
            { code },
          );
        }
        return o.status === "succeeded";
      },
      `Domain order ${id}`,
      { timeoutMs: ORDER_WAIT_MS, pollIntervalMs: 5_000, ...waitOptions },
    );
  }
}

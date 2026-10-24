import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/**
 * Events sent to your own URL. Delete, test and secret rotation are sent
 * once: the API does not replay them by Idempotency-Key.
 */
export class Webhooks extends APIResource {
  /** A webhook's delivery log. */
  readonly deliveries: WebhookDeliveries = new WebhookDeliveries(this._client);

  list(params: L<"listWebhooks"> = {}, options?: RequestOptions): Promise<R<"listWebhooks">> {
    return this._get("/webhooks", params, options);
  }

  listAll(params: LA<"listWebhooks"> = {}, options?: RequestOptions): AsyncGenerator<I<"listWebhooks">> {
    return this._listAll("/webhooks", params, options);
  }

  /** Every event type a webhook can subscribe to. */
  listEventTypes(
    params: L<"listWebhookEventTypes"> = {},
    options?: RequestOptions,
  ): Promise<R<"listWebhookEventTypes">> {
    return this._get("/webhook-event-types", params, options);
  }

  /** Creates a webhook. Its signing `secret` is in this response only. */
  create(body: B<"createWebhook">, options?: RequestOptions): Promise<R<"createWebhook">> {
    return this._post("/webhooks", body, options);
  }

  get(webhookId: string, options?: RequestOptions): Promise<R<"getWebhook">> {
    return this._get(path`/webhooks/${webhookId}`, undefined, options);
  }

  update(webhookId: string, body: B<"updateWebhook">, options?: RequestOptions): Promise<R<"updateWebhook">> {
    return this._patch(path`/webhooks/${webhookId}`, body, options);
  }

  /** Deletes the webhook. A repeat after it is gone is a `404`: treat that as done. */
  delete(webhookId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/webhooks/${webhookId}`, options, { noRetry: true });
  }

  /** Sends a test event. Each call sends another. */
  test(webhookId: string, options?: RequestOptions): Promise<R<"testWebhook">> {
    return this._post(path`/webhooks/${webhookId}/test`, undefined, options, { noRetry: true });
  }

  /** Issues a new signing secret, in this response only. The previous one keeps signing for 24 hours. */
  rotateSecret(webhookId: string, options?: RequestOptions): Promise<R<"rotateWebhookSecret">> {
    return this._post(path`/webhooks/${webhookId}/rotate-secret`, undefined, options, { noRetry: true });
  }
}

export class WebhookDeliveries extends APIResource {
  list(
    webhookId: string,
    params: L<"listWebhookDeliveries"> = {},
    options?: RequestOptions,
  ): Promise<R<"listWebhookDeliveries">> {
    return this._get(path`/webhooks/${webhookId}/deliveries`, params, options);
  }

  listAll(
    webhookId: string,
    params: LA<"listWebhookDeliveries"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listWebhookDeliveries">> {
    return this._listAll(path`/webhooks/${webhookId}/deliveries`, params, options);
  }

  get(webhookId: string, deliveryId: string, options?: RequestOptions): Promise<R<"getWebhookDelivery">> {
    return this._get(path`/webhooks/${webhookId}/deliveries/${deliveryId}`, undefined, options);
  }

  /** Sends the delivery again. Each call sends another. */
  redeliver(webhookId: string, deliveryId: string, options?: RequestOptions): Promise<R<"redeliverWebhook">> {
    return this._post(path`/webhooks/${webhookId}/deliveries/${deliveryId}/redeliver`, undefined, options, {
      noRetry: true,
    });
  }
}

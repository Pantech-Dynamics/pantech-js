import type { RequestOptions } from "../client.js";
import { APIResource } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** Your credit, and whether it covers your next invoice. */
export class Billing extends APIResource {
  readonly credit: Credit = new Credit(this._client);
  readonly receipts: Receipts = new Receipts(this._client);
}

export class Credit extends APIResource {
  readonly purchases: CreditPurchases = new CreditPurchases(this._client);

  /** Your credit balance and whether it covers the next invoice. */
  get(options?: RequestOptions): Promise<R<"getCredit">> {
    return this._get("/billing/credit", undefined, options);
  }
}

export class CreditPurchases extends APIResource {
  /** Creates a payment link that adds credit: send its `checkout_url` to whoever pays. */
  create(body: B<"createCreditPurchase">, options?: RequestOptions): Promise<R<"createCreditPurchase">> {
    return this._post("/billing/credit/purchases", body, options);
  }

  get(purchaseId: string, options?: RequestOptions): Promise<R<"getCreditPurchase">> {
    return this._get(path`/billing/credit/purchases/${purchaseId}`, undefined, options);
  }
}

export class Receipts extends APIResource {
  list(params: L<"listReceipts"> = {}, options?: RequestOptions): Promise<R<"listReceipts">> {
    return this._get("/billing/receipts", params, options);
  }

  listAll(params: LA<"listReceipts"> = {}, options?: RequestOptions): AsyncGenerator<I<"listReceipts">> {
    return this._listAll("/billing/receipts", params, options);
  }

  get(receiptId: string, options?: RequestOptions): Promise<R<"getReceipt">> {
    return this._get(path`/billing/receipts/${receiptId}`, undefined, options);
  }

  /** The receipt as a PDF document. */
  getPdf(receiptId: string, options?: RequestOptions): Promise<ArrayBuffer> {
    return this._request("GET", path`/billing/receipts/${receiptId}/pdf`, { responseType: "arrayBuffer" }, options);
  }
}

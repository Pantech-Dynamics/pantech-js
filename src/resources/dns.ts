import type { RequestOptions } from "../client.js";
import { DNSFailedError } from "../errors.js";
import type { DNSRecord, DNSZone } from "../models.js";
import { APIResource, type IfMatchOptions, withIfMatch } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";
import { poll, type WaitOptions } from "../wait.js";

const RECORD_WAIT_MS = 5 * 60_000;
const ZONE_WAIT_MS = 5 * 60_000;

/** Options for a record change: the request options, plus the version you read. */
export type RecordWriteOptions = IfMatchOptions;

/**
 * Pantech DNS: zones hosted on Pantech's own name servers (two per zone),
 * and their records. Changes go live in the background: a write answers at
 * once with the record set `pending`, and it is `active` within about a
 * minute. Records added before the zone is `active` stay `pending` until it is.
 */
export class DNS extends APIResource {
  /** Hosted zones, with the name servers to delegate your domain to. */
  readonly zones: DNSZones = new DNSZones(this._client);
  /** Record sets of a zone: one name and type each, with a TTL and values. */
  readonly records: DNSRecords = new DNSRecords(this._client);
}

export class DNSZones extends APIResource {
  /** One page of your zones, newest first. Filter with `q` (name contains) or `status`. */
  list(params: L<"listDNSZones"> = {}, options?: RequestOptions): Promise<R<"listDNSZones">> {
    return this._get("/dns/zones", params, options);
  }

  listAll(params: LA<"listDNSZones"> = {}, options?: RequestOptions): AsyncGenerator<I<"listDNSZones">> {
    return this._listAll("/dns/zones", params, options);
  }

  /**
   * Hosts a zone. It is `pending`, then `awaiting_delegation` with its own
   * two `name_servers` to set at your registrar, then `active` once the
   * registry delegates to exactly those. Undelegated for 14 days, it is
   * removed. The first 5 zones are free: see `quote`.
   */
  create(body: B<"createDNSZone">, options?: RequestOptions): Promise<R<"createDNSZone">> {
    return this._post("/dns/zones", body, options);
  }

  /** The free zone allowance, and the monthly price of each further zone in your currency (before VAT). */
  quote(options?: RequestOptions): Promise<R<"quoteDNSZones">> {
    return this._get("/dns/zones/quote", undefined, options);
  }

  get(zoneId: string, options?: RequestOptions): Promise<R<"getDNSZone">> {
    return this._get(path`/dns/zones/${zoneId}`, undefined, options);
  }

  /** Changes the zone's description. */
  update(zoneId: string, body: B<"updateDNSZone">, options?: RequestOptions): Promise<R<"updateDNSZone">> {
    return this._patch(path`/dns/zones/${zoneId}`, body, options);
  }

  /**
   * Stops answering for the zone at once and removes its records. Refused
   * with `DNS_ZONE_IN_USE_BY_DOMAIN` while a Pantech domain delegates to it.
   */
  delete(zoneId: string, options?: RequestOptions): Promise<R<"deleteDNSZone">> {
    return this._delete(path`/dns/zones/${zoneId}`, options);
  }

  /** Checks the zone's delegation within seconds instead of at the next scheduled check. */
  verify(zoneId: string, options?: RequestOptions): Promise<R<"verifyDNSZone">> {
    return this._post(path`/dns/zones/${zoneId}/verify`, undefined, options);
  }

  /**
   * Polls a new zone until it has its name servers: `awaiting_delegation`
   * (set them at your registrar) or `active`. Rejects with DNSFailedError if
   * it fails or is being deleted. Default timeout 5 minutes, polling every 3
   * seconds. It does not wait for delegation, which is up to your registrar.
   */
  wait(zoneId: string, options: WaitOptions<DNSZone> = {}): Promise<DNSZone> {
    return poll(
      () => this.get(zoneId, { signal: options.signal }),
      (z) => {
        if (z.status === "failed" || z.status === "deleting" || z.status === "deleted") {
          const code = z.failure_code ?? z.status;
          throw new DNSFailedError(`DNS zone ${z.id} (${z.name}) is ${z.status} (${code}).`, "zone", z, { code });
        }
        return z.status === "awaiting_delegation" || z.status === "active";
      },
      `DNS zone ${zoneId}`,
      { timeoutMs: ZONE_WAIT_MS, pollIntervalMs: 3_000, ...options },
    );
  }

  /** The zone's record sets as a BIND zone file. */
  exportZoneFile(zoneId: string, options?: RequestOptions): Promise<string> {
    return this._request("GET", path`/dns/zones/${zoneId}/export`, { responseType: "text" }, options);
  }

  /**
   * Creates and updates record sets from a BIND zone file (at most 1000
   * changes). With `replace: true`, record sets the file lacks are deleted too.
   */
  importZoneFile(zoneId: string, body: B<"importDNSZone">, options?: RequestOptions): Promise<R<"importDNSZone">> {
    return this._post(path`/dns/zones/${zoneId}/import`, body, options);
  }
}

export class DNSRecords extends APIResource {
  /** One page of a zone's record sets, by name then type. Filter with `name`, `q` or `type`. */
  list(zoneId: string, params: L<"listDNSRecords"> = {}, options?: RequestOptions): Promise<R<"listDNSRecords">> {
    return this._get(path`/dns/zones/${zoneId}/records`, params, options);
  }

  listAll(
    zoneId: string,
    params: LA<"listDNSRecords"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listDNSRecords">> {
    return this._listAll(path`/dns/zones/${zoneId}/records`, params, options);
  }

  /** Adds a record set, `pending` until it answers. Follow it with `wait`. */
  create(zoneId: string, body: B<"createDNSRecord">, options?: RequestOptions): Promise<R<"createDNSRecord">> {
    return this._post(path`/dns/zones/${zoneId}/records`, body, options);
  }

  get(zoneId: string, recordId: string, options?: RequestOptions): Promise<R<"getDNSRecord">> {
    return this._get(path`/dns/zones/${zoneId}/records/${recordId}`, undefined, options);
  }

  /** Changes the TTL, values or comment. Pass `{ ifMatch: record.version }` to refuse a lost update. */
  update(
    zoneId: string,
    recordId: string,
    body: B<"updateDNSRecord">,
    options?: RecordWriteOptions,
  ): Promise<R<"updateDNSRecord">> {
    return this._patch(path`/dns/zones/${zoneId}/records/${recordId}`, body, withIfMatch(options));
  }

  /** Removes the record set. Pass `{ ifMatch: record.version }` to refuse it if the record changed. */
  delete(zoneId: string, recordId: string, options?: RecordWriteOptions): Promise<R<"deleteDNSRecord">> {
    return this._delete(path`/dns/zones/${zoneId}/records/${recordId}`, withIfMatch(options));
  }

  /**
   * Up to 1000 creates, updates and deletes, all or nothing. A change's
   * `version` refuses it with `412 VERSION_CONFLICT` if the record moved on.
   */
  batch(zoneId: string, body: B<"batchDNSRecords">, options?: RequestOptions): Promise<R<"batchDNSRecords">> {
    return this._post(path`/dns/zones/${zoneId}/records/batch`, body, options);
  }

  /**
   * Polls the record set until it is `active` (resolves with it) or its
   * change failed (rejects with DNSFailedError). Default timeout 5
   * minutes, polling every 3 seconds.
   */
  wait(zoneId: string, recordId: string, options: WaitOptions<DNSRecord> = {}): Promise<DNSRecord> {
    return poll(
      () => this.get(zoneId, recordId, { signal: options.signal }),
      (r) => {
        if (r.status === "failed") {
          const code = r.failure_code ?? undefined;
          throw new DNSFailedError(
            `DNS record ${r.id} (${r.fqdn} ${r.type}) failed${code ? ` (${code})` : ""}. The previous values still answer.`,
            "record",
            r,
            { code },
          );
        }
        return r.status === "active";
      },
      `DNS record ${recordId}`,
      { timeoutMs: RECORD_WAIT_MS, pollIntervalMs: 3_000, ...options },
    );
  }
}

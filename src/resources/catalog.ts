// What you can buy, and what it costs.

import type { RequestOptions } from "../client.js";
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

export class Regions extends APIResource {
  list(params: L<"listRegions"> = {}, options?: RequestOptions): Promise<R<"listRegions">> {
    return this._get("/regions", params, options);
  }

  listAll(params: LA<"listRegions"> = {}, options?: RequestOptions): AsyncGenerator<I<"listRegions">> {
    return this._listAll("/regions", params, options);
  }
}

export class Plans extends APIResource {
  list(params: L<"listPlans"> = {}, options?: RequestOptions): Promise<R<"listPlans">> {
    return this._get("/plans", params, options);
  }

  listAll(params: LA<"listPlans"> = {}, options?: RequestOptions): AsyncGenerator<I<"listPlans">> {
    return this._listAll("/plans", params, options);
  }
}

export class Images extends APIResource {
  list(params: L<"listImages"> = {}, options?: RequestOptions): Promise<R<"listImages">> {
    return this._get("/images", params, options);
  }

  listAll(params: LA<"listImages"> = {}, options?: RequestOptions): AsyncGenerator<I<"listImages">> {
    return this._listAll("/images", params, options);
  }
}

export class DiskOfferings extends APIResource {
  list(params: L<"listDiskOfferings"> = {}, options?: RequestOptions): Promise<R<"listDiskOfferings">> {
    return this._get("/disk-offerings", params, options);
  }

  listAll(params: LA<"listDiskOfferings"> = {}, options?: RequestOptions): AsyncGenerator<I<"listDiskOfferings">> {
    return this._listAll("/disk-offerings", params, options);
  }

  /** What a volume of this offering costs. */
  quote(slug: string, params: Q<"quoteDiskOffering"> = {}, options?: RequestOptions): Promise<R<"quoteDiskOffering">> {
    return this._get(path`/disk-offerings/${slug}/quote`, params, options);
  }
}

export class DatabaseEngines extends APIResource {
  list(params: L<"listDatabaseEngines"> = {}, options?: RequestOptions): Promise<R<"listDatabaseEngines">> {
    return this._get("/database-engines", params, options);
  }

  listAll(params: LA<"listDatabaseEngines"> = {}, options?: RequestOptions): AsyncGenerator<I<"listDatabaseEngines">> {
    return this._listAll("/database-engines", params, options);
  }
}

export class KubernetesVersions extends APIResource {
  /** The Kubernetes versions a new cluster can run, and the zones that offer high availability. */
  list(params: Q<"listKubernetesVersions"> = {}, options?: RequestOptions): Promise<R<"listKubernetesVersions">> {
    return this._get("/kubernetes-versions", params, options);
  }
}

export class Pricing extends APIResource {
  /** Prices a set of instances, volumes and other resources. Changes nothing. */
  estimate(body: B<"estimatePricing">, options?: RequestOptions): Promise<R<"estimatePricing">> {
    return this._post("/pricing/estimate", body, options);
  }
}

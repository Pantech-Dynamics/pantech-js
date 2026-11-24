import type { BinaryBody, RequestOptions } from "../client.js";
import { APIResource, hideSecrets } from "../resource.js";
import type { BodyOf as B, QueryOf as Q, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/** S3-compatible object storage: region availability, usage, and access keys. */
export class ObjectStorage extends APIResource {
  /** S3 access keys for your organization. */
  readonly keys: ObjectStorageKeys = new ObjectStorageKeys(this._client);

  /** Whether object storage is available, with endpoints and regional pricing. */
  getStatus(options?: RequestOptions): Promise<R<"getObjectStorage">> {
    return this._get("/object-storage", undefined, options);
  }

  /** Hourly object storage traffic and operations for your organization. */
  getUsage(params: Q<"getObjectStorageUsage"> = {}, options?: RequestOptions): Promise<R<"getObjectStorageUsage">> {
    return this._get("/object-storage/usage", params, options);
  }
}

export class ObjectStorageKeys extends APIResource {
  /** Lists your S3 access keys without their secrets. */
  list(params: Q<"listObjectStorageKeys"> = {}, options?: RequestOptions): Promise<R<"listObjectStorageKeys">> {
    return this._get("/object-storage/keys", params, options);
  }

  /**
   * Creates an S3 access key. Its `secret_access_key` is returned once and
   * never replayed; it is non-enumerable so `console.log` and `JSON.stringify`
   * leave it out while `key.secret_access_key` reads it.
   */
  async create(body: B<"createObjectStorageKey">, options?: RequestOptions): Promise<R<"createObjectStorageKey">> {
    return hideSecrets(
      await this._post<R<"createObjectStorageKey">>("/object-storage/keys", body, options, { noRetry: true }),
    );
  }

  /** Revokes an S3 access key at once. */
  revoke(storageKeyId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/object-storage/keys/${storageKeyId}`, options);
  }
}

/** S3-compatible buckets, their objects, multipart uploads, and bucket rules. */
export class Buckets extends APIResource {
  /** Objects and folders inside a bucket. */
  readonly objects: BucketObjects = new BucketObjects(this._client);
  /** Multipart uploads for large objects. */
  readonly multipart: BucketMultipart = new BucketMultipart(this._client);

  /** Lists every bucket in your organization. */
  list(options?: RequestOptions): Promise<R<"listBuckets">> {
    return this._get("/buckets", undefined, options);
  }

  /** Creates a new bucket. */
  create(body: B<"createBucket">, options?: RequestOptions): Promise<R<"createBucket">> {
    return this._post("/buckets", body, options);
  }

  /** Gets one bucket's settings and endpoints. */
  get(bucketId: string, options?: RequestOptions): Promise<R<"getBucket">> {
    return this._get(path`/buckets/${bucketId}`, undefined, options);
  }

  /** Updates a bucket's versioning, access policy, or public prefixes. */
  update(bucketId: string, body: B<"updateBucket">, options?: RequestOptions): Promise<R<"updateBucket">> {
    return this._patch(path`/buckets/${bucketId}`, body, options);
  }

  /** Deletes a bucket. Pass `{ force: true }` to empty it before removal. */
  delete(bucketId: string, params: Q<"deleteBucket"> = {}, options?: RequestOptions): Promise<R<"deleteBucket">> {
    return this._request("DELETE", path`/buckets/${bucketId}`, { query: params }, options);
  }

  /** Live total size and object count of a bucket. */
  stats(bucketId: string, options?: RequestOptions): Promise<R<"getBucketStats">> {
    return this._get(path`/buckets/${bucketId}/stats`, undefined, options);
  }

  /** Deletes all objects, versions, and active multipart uploads in a bucket. Sent once: not retried on error. */
  empty(bucketId: string, options?: RequestOptions): Promise<R<"emptyBucket">> {
    return this._post(path`/buckets/${bucketId}/empty`, undefined, options, { noRetry: true });
  }

  /** Reads the bucket's CORS rules. */
  getCors(bucketId: string, options?: RequestOptions): Promise<R<"getBucketCORS">> {
    return this._get(path`/buckets/${bucketId}/cors`, undefined, options);
  }

  /** Replaces the bucket's CORS rules (an empty list clears them). */
  setCors(bucketId: string, body: B<"putBucketCORS">, options?: RequestOptions): Promise<R<"putBucketCORS">> {
    return this._put(path`/buckets/${bucketId}/cors`, body, options);
  }

  /** Reads the bucket's lifecycle rules. */
  getLifecycle(bucketId: string, options?: RequestOptions): Promise<R<"getBucketLifecycle">> {
    return this._get(path`/buckets/${bucketId}/lifecycle`, undefined, options);
  }

  /** Replaces the bucket's lifecycle rules (an empty list clears them). */
  setLifecycle(
    bucketId: string,
    body: B<"putBucketLifecycle">,
    options?: RequestOptions,
  ): Promise<R<"putBucketLifecycle">> {
    return this._put(path`/buckets/${bucketId}/lifecycle`, body, options);
  }

  /** Reads the bucket's tags. */
  getTags(bucketId: string, options?: RequestOptions): Promise<R<"getBucketTags">> {
    return this._get(path`/buckets/${bucketId}/tags`, undefined, options);
  }

  /** Replaces the bucket's tags (an empty list clears them). */
  setTags(bucketId: string, body: B<"putBucketTags">, options?: RequestOptions): Promise<R<"putBucketTags">> {
    return this._put(path`/buckets/${bucketId}/tags`, body, options);
  }

  /** Reads the bucket's default object lock configuration. */
  getObjectLock(bucketId: string, options?: RequestOptions): Promise<R<"getBucketObjectLock">> {
    return this._get(path`/buckets/${bucketId}/object-lock`, undefined, options);
  }

  /** Updates the bucket's default object lock configuration. */
  setObjectLock(
    bucketId: string,
    body: B<"putBucketObjectLock">,
    options?: RequestOptions,
  ): Promise<R<"putBucketObjectLock">> {
    return this._put(path`/buckets/${bucketId}/object-lock`, body, options);
  }
}

export class BucketObjects extends APIResource {
  /** Lists folders and objects under a prefix, searches across the bucket, or lists object versions. */
  list(
    bucketId: string,
    params: Q<"listBucketObjects"> = {},
    options?: RequestOptions,
  ): Promise<R<"listBucketObjects">> {
    return this._get(path`/buckets/${bucketId}/objects`, params, options);
  }

  /** Reads metadata, headers, tags, lock status, and public visibility of one object. */
  getMeta(
    bucketId: string,
    params: Q<"getBucketObjectMeta">,
    options?: RequestOptions,
  ): Promise<R<"getBucketObjectMeta">> {
    return this._get(path`/buckets/${bucketId}/objects/meta`, params, options);
  }

  /** Downloads an object's raw bytes as an `ArrayBuffer`. */
  download(bucketId: string, params: Q<"downloadBucketObject">, options?: RequestOptions): Promise<ArrayBuffer> {
    return this._request(
      "GET",
      path`/buckets/${bucketId}/objects/download`,
      { query: params, responseType: "arrayBuffer" },
      options,
    );
  }

  /** Mints a short-lived signed download URL when direct transfers are enabled. */
  presignDownload(
    bucketId: string,
    body: B<"presignBucketObjectDownload">,
    options?: RequestOptions,
  ): Promise<R<"presignBucketObjectDownload">> {
    return this._post(path`/buckets/${bucketId}/objects/download-url`, body, options);
  }

  /**
   * Streams an object upload into the bucket as raw bytes. Sets
   * `Content-Type: application/octet-stream` unless `options.headers` sets a
   * custom `Content-Type`.
   */
  upload(
    bucketId: string,
    params: Q<"uploadBucketObject">,
    body: BinaryBody,
    options?: RequestOptions,
  ): Promise<R<"uploadBucketObject">> {
    return this._request("PUT", path`/buckets/${bucketId}/objects/upload`, { query: params, rawBody: body }, options);
  }

  /** Mints a short-lived signed upload URL when direct transfers are enabled. */
  presignUpload(
    bucketId: string,
    body: B<"presignBucketObjectUpload">,
    options?: RequestOptions,
  ): Promise<R<"presignBucketObjectUpload">> {
    return this._post(path`/buckets/${bucketId}/objects/upload-url`, body, options);
  }

  /** Creates a folder marker object ending with `/`. */
  createFolder(
    bucketId: string,
    body: B<"createBucketFolder">,
    options?: RequestOptions,
  ): Promise<R<"createBucketFolder">> {
    return this._post(path`/buckets/${bucketId}/objects/folder`, body, options);
  }

  /** Copies, renames, or updates metadata of an object inside the bucket. */
  copy(bucketId: string, body: B<"copyBucketObject">, options?: RequestOptions): Promise<R<"copyBucketObject">> {
    return this._post(path`/buckets/${bucketId}/objects/copy`, body, options);
  }

  /** Deletes one or more objects or versions, or deletes a folder prefix recursively. */
  delete(
    bucketId: string,
    body: B<"deleteBucketObjects">,
    options?: RequestOptions,
  ): Promise<R<"deleteBucketObjects">> {
    return this._post(path`/buckets/${bucketId}/objects/delete`, body, options);
  }

  /** Replaces tags on an object or object version. */
  setTags(
    bucketId: string,
    body: B<"putBucketObjectTags">,
    options?: RequestOptions,
  ): Promise<R<"putBucketObjectTags">> {
    return this._put(path`/buckets/${bucketId}/objects/tags`, body, options);
  }

  /** Sets retention or legal hold on an object or object version. */
  setLock(
    bucketId: string,
    body: B<"setBucketObjectLock">,
    options?: RequestOptions,
  ): Promise<R<"setBucketObjectLock">> {
    return this._put(path`/buckets/${bucketId}/objects/lock`, body, options);
  }

  /** Sets whether a specific object is publicly readable and returns its `public_url`. */
  setVisibility(
    bucketId: string,
    body: B<"putBucketObjectVisibility">,
    options?: RequestOptions,
  ): Promise<R<"putBucketObjectVisibility">> {
    return this._put(path`/buckets/${bucketId}/objects/visibility`, body, options);
  }
}

export class BucketMultipart extends APIResource {
  /** Starts a multipart upload session for a large object. Sent once: not retried on error. */
  start(
    bucketId: string,
    body: B<"startBucketMultipartUpload">,
    options?: RequestOptions,
  ): Promise<R<"startBucketMultipartUpload">> {
    return this._post(path`/buckets/${bucketId}/objects/multipart/start`, body, options, { noRetry: true });
  }

  /** Mints a short-lived signed upload URL for one part of an active multipart upload. */
  signPart(
    bucketId: string,
    body: B<"signBucketMultipartPart">,
    options?: RequestOptions,
  ): Promise<R<"signBucketMultipartPart">> {
    return this._post(path`/buckets/${bucketId}/objects/multipart/sign-part`, body, options);
  }

  /** Uploads one part of an active multipart upload as raw bytes. */
  uploadPart(
    bucketId: string,
    params: Q<"uploadBucketMultipartPart">,
    body: BinaryBody,
    options?: RequestOptions,
  ): Promise<R<"uploadBucketMultipartPart">> {
    return this._request(
      "PUT",
      path`/buckets/${bucketId}/objects/multipart/part`,
      { query: params, rawBody: body },
      options,
    );
  }

  /** Completes a multipart upload from its uploaded part ETags. Sent once: not retried on error. */
  complete(
    bucketId: string,
    body: B<"completeBucketMultipartUpload">,
    options?: RequestOptions,
  ): Promise<R<"completeBucketMultipartUpload">> {
    return this._post(path`/buckets/${bucketId}/objects/multipart/complete`, body, options, { noRetry: true });
  }

  /** Aborts an active multipart upload and discards uploaded parts. */
  abort(bucketId: string, body: B<"abortBucketMultipartUpload">, options?: RequestOptions): Promise<void> {
    return this._post(path`/buckets/${bucketId}/objects/multipart/abort`, body, options);
  }
}

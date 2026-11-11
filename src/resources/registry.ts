import type { RequestOptions } from "../client.js";
import { APIResource, hideSecrets } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/**
 * Pantech Container Registry: a private OCI registry at
 * `registry.pantechdynamics.com`. Images are
 * `registry.pantechdynamics.com/<namespace>/<repository>:<tag>`; log in with
 * `docker login registry.pantechdynamics.com -u pantech` and an API key or a
 * registry token as the password.
 */
export class Registry extends APIResource {
  /** Your organization's namespace, which every image name starts with. */
  readonly namespace: RegistryNamespaces = new RegistryNamespaces(this._client);
  /** Repositories in your namespace. */
  readonly repositories: RegistryRepositories = new RegistryRepositories(this._client);
  /** Tags of a repository, and the images they point at. */
  readonly tags: RegistryTags = new RegistryTags(this._client);
  /** Registry-only credentials for CI and clusters. */
  readonly tokens: RegistryTokens = new RegistryTokens(this._client);
}

export class RegistryNamespaces extends APIResource {
  /** The namespace with its usage and limits. Rejects with `404 REGISTRY_NAMESPACE_NOT_SET` until one is claimed. */
  get(options?: RequestOptions): Promise<R<"getRegistryNamespace">> {
    return this._get("/registry", undefined, options);
  }

  /** Claims the namespace, or changes it or `create_on_push`. The name is fixed once a repository exists. */
  set(body: B<"setRegistryNamespace">, options?: RequestOptions): Promise<R<"setRegistryNamespace">> {
    return this._put("/registry", body, options);
  }
}

export class RegistryRepositories extends APIResource {
  list(params: L<"listRegistryRepositories"> = {}, options?: RequestOptions): Promise<R<"listRegistryRepositories">> {
    return this._get("/registry/repositories", params, options);
  }

  listAll(
    params: LA<"listRegistryRepositories"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listRegistryRepositories">> {
    return this._listAll("/registry/repositories", params, options);
  }

  /** Creates a repository, private unless `visibility` is `public`. */
  create(body: B<"createRegistryRepository">, options?: RequestOptions): Promise<R<"createRegistryRepository">> {
    return this._post("/registry/repositories", body, options);
  }

  get(repositoryId: string, options?: RequestOptions): Promise<R<"getRegistryRepository">> {
    return this._get(path`/registry/repositories/${repositoryId}`, undefined, options);
  }

  /** Changes the description, visibility, tag immutability or retention policy. */
  update(
    repositoryId: string,
    body: B<"updateRegistryRepository">,
    options?: RequestOptions,
  ): Promise<R<"updateRegistryRepository">> {
    return this._patch(path`/registry/repositories/${repositoryId}`, body, options);
  }

  /** Deletes the repository and every image in it. */
  delete(repositoryId: string, options?: RequestOptions): Promise<R<"deleteRegistryRepository">> {
    return this._delete(path`/registry/repositories/${repositoryId}`, options);
  }
}

export class RegistryTags extends APIResource {
  /** A repository's tags, newest push first. */
  list(
    repositoryId: string,
    params: L<"listRegistryTags"> = {},
    options?: RequestOptions,
  ): Promise<R<"listRegistryTags">> {
    return this._get(path`/registry/repositories/${repositoryId}/tags`, params, options);
  }

  listAll(
    repositoryId: string,
    params: LA<"listRegistryTags"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listRegistryTags">> {
    return this._listAll(path`/registry/repositories/${repositoryId}/tags`, params, options);
  }

  get(repositoryId: string, tag: string, options?: RequestOptions): Promise<R<"getRegistryTag">> {
    return this._get(path`/registry/repositories/${repositoryId}/tags/${tag}`, undefined, options);
  }

  /** Removes the tag. Rejected with `409 TAG_IMMUTABLE` in a repository with immutable tags. */
  delete(repositoryId: string, tag: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/registry/repositories/${repositoryId}/tags/${tag}`, options);
  }
}

export class RegistryTokens extends APIResource {
  /** Your registry tokens, without their secrets. */
  list(params: L<"listRegistryTokens"> = {}, options?: RequestOptions): Promise<R<"listRegistryTokens">> {
    return this._get("/registry/tokens", params, options);
  }

  listAll(params: LA<"listRegistryTokens"> = {}, options?: RequestOptions): AsyncGenerator<I<"listRegistryTokens">> {
    return this._listAll("/registry/tokens", params, options);
  }

  /**
   * Creates a token for `docker login`: `pull`, or `push` (which includes
   * pull), for every repository or only `repositories`. Its `secret` is in
   * this response alone. It is non-enumerable: `token.secret` reads it, but
   * console.log and JSON.stringify leave it out.
   */
  async create(body: B<"createRegistryToken">, options?: RequestOptions): Promise<R<"createRegistryToken">> {
    return hideSecrets(await this._post<R<"createRegistryToken">>("/registry/tokens", body, options));
  }

  /** Revokes the token: logins stop at once, and access already granted ends within 5 minutes. */
  delete(tokenId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/registry/tokens/${tokenId}`, options);
  }
}

// Helpers that read request and response types out of the generated spec
// types, so every method's signature follows the API spec.
import type { components, operations, paths } from "./types.gen.js";

export type { components, operations, paths };

/** Every schema in the public API spec, by name. */
export type Schemas = components["schemas"];

/** The `operationId` of every endpoint in the spec. */
export type OperationId = keyof operations;

type JSONContent<R> = R extends { content: { "application/json": infer T } } ? T : never;
type Responses<K extends OperationId> = operations[K]["responses"];

/** The JSON body of an operation's success response (200, 201 or 202). */
export type ResponseOf<K extends OperationId> = {
  [C in keyof Responses<K>]: C extends 200 | 201 | 202 ? JSONContent<Responses<K>[C]> : never;
}[keyof Responses<K>];

/** The JSON request body an operation takes. */
export type BodyOf<K extends OperationId> = JSONContent<NonNullable<operations[K]["requestBody"]>>;

/** The query parameters an operation takes. */
export type QueryOf<K extends OperationId> = NonNullable<operations[K]["parameters"]["query"]>;

/**
 * The parameters of a list method. Every list returns `next_cursor`, so a
 * `cursor` is accepted even where the spec documents no other filter.
 */
export type ListParams<K extends OperationId> = [QueryOf<K>] extends [never] ? { cursor?: string | null } : QueryOf<K>;

/** The parameters of a `listAll` method: a list's filters, without the cursor. */
export type ListAllParams<K extends OperationId> = Omit<ListParams<K>, "cursor">;

/** One item of a list response's `data`. */
export type ItemOf<K extends OperationId> = ResponseOf<K> extends { data: Array<infer T> } ? T : never;

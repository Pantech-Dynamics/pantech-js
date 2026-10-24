// Named model types. Most are generated (models.gen.ts); the ones below
// widen a schema with fields the API sends that the vendored spec may not
// describe yet.
import type { components } from "./types.gen.js";

export type * from "./models.gen.js";

type SpecMe = components["schemas"]["Me"];

/** The kind of API key: a standard key, or one handed to an AI app when it was connected. */
export type APIKeyKind = "standard" | "ai_app";

/** A scope an API key can hold. `delete` is only ever held by AI app keys, together with `write`. */
export type APIKeyScope = "read" | "write" | "delete";

/** `GET /me`: the API key making the call. */
export type Me = Omit<SpecMe, "api_key"> & {
  api_key: Omit<SpecMe["api_key"], "scopes"> & {
    scopes: APIKeyScope[];
    /** `standard`, or `ai_app` for a key handed to an AI app. */
    kind?: APIKeyKind;
    /** The AI app's name, e.g. "Research assistant"; null for a standard key. */
    client_name?: string | null;
  };
};

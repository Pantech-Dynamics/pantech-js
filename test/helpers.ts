import { Pantech } from "../src/index.ts";

export interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export type Handler = (call: Call, index: number) => Response | Promise<Response>;

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export const problem = (status: number, code: string, detail: string, extra: Record<string, unknown> = {}): Response =>
  new Response(
    JSON.stringify({ type: "about:blank", title: "Problem", status, code, detail, request_id: "req_1", ...extra }),
    { status, headers: { "content-type": "application/problem+json" } },
  );

/** A client whose fetch is `handler`, recording every call. */
export function mockClient(handler: Handler, options: ConstructorParameters<typeof Pantech>[0] = {}) {
  const calls: Call[] = [];
  const fetch = async (input: string, init: RequestInit = {}) => {
    if (init.signal?.aborted) throw init.signal.reason;
    const call: Call = {
      method: init.method ?? "GET",
      url: new URL(input),
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  const client = new Pantech({ apiKey: "PAN_test_secret", baseURL: "https://api.test/public/v1", fetch, ...options });
  return { client, calls };
}

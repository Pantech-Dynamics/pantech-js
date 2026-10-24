import type { RequestOptions } from "../client.js";
import { OperationFailedError, PantechError } from "../errors.js";
import type { Operation } from "../models.js";
import { APIResource } from "../resource.js";
import { path } from "../util.js";
import { poll, type WaitOptions } from "../wait.js";

/** An operation id, or a `202 Accepted` body that carries one. */
export type OperationRef = string | { operation_id?: string | null };

function operationId(ref: OperationRef): string {
  const id = typeof ref === "string" ? ref : ref.operation_id;
  if (!id) throw new PantechError("There is no operation to wait for: the response carried no operation_id.");
  return id;
}

/** The error for an operation that ended `failed`. */
export function operationFailed(op: Operation): OperationFailedError {
  const reason = op.failure?.reason ?? "The operation failed.";
  const code = op.failure?.code;
  return new OperationFailedError(code ? `${reason} (${code})` : reason, op, { code, detail: reason });
}

export class Operations extends APIResource {
  /** An operation's current state. */
  get(operationId: string, options?: RequestOptions): Promise<Operation> {
    return this._get(path`/operations/${operationId}`, undefined, options);
  }

  /**
   * Polls the operation until it succeeds (resolves with it) or fails
   * (rejects with OperationFailedError). Accepts an id or the `202` body of
   * any write: `await client.operations.wait(await client.instances.stop(id))`.
   */
  wait(ref: OperationRef, options: WaitOptions<Operation> = {}): Promise<Operation> {
    const id = operationId(ref);
    return poll(
      () => this.get(id, { signal: options.signal }),
      (op) => {
        if (op.status === "failed") throw operationFailed(op);
        return op.status === "succeeded";
      },
      `Operation ${id}`,
      options,
    );
  }

  /**
   * Streams the operation's changes (Server-Sent Events) until it succeeds
   * or fails, yielding the Operation each time it changes. A stream the API
   * ends early (after 15 minutes, say) rejects with its code; poll with
   * `wait` instead.
   */
  async *stream(operationId: string, options: RequestOptions = {}): AsyncGenerator<Operation, void, undefined> {
    const res = await this._request<Response>(
      "GET",
      path`/operations/${operationId}/events`,
      { responseType: "response" },
      { ...options, headers: { ...options.headers, Accept: "text/event-stream" } },
    );
    if (!res.body) return;
    for await (const event of readEvents(res.body)) {
      if (event.event === "error") {
        let body: { code?: string; detail?: string; request_id?: string } = {};
        try {
          body = JSON.parse(event.data);
        } catch {
          body = {};
        }
        const detail = body.detail ?? "The operation stream ended before the operation finished.";
        throw new PantechError(body.code ? `${detail} (${body.code})` : detail, {
          code: body.code,
          detail,
          requestId: body.request_id,
        });
      }
      if (event.event !== "operation" || !event.data) continue;
      const op = JSON.parse(event.data) as Operation;
      yield op;
      if (op.status === "succeeded" || op.status === "failed") return;
    }
  }
}

interface ServerSentEvent {
  event: string;
  data: string;
}

/** Parses a text/event-stream body into events; comments (keepalives) are skipped. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (line === "") {
          if (data.length > 0) yield { event, data: data.join("\n") };
          event = "message";
          data = [];
        } else if (!line.startsWith(":")) {
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        }
      }
      if (done) {
        if (data.length > 0) yield { event, data: data.join("\n") };
        return;
      }
    }
  } finally {
    reader.releaseLock();
    await body.cancel().catch(() => undefined);
  }
}

import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  ConflictError,
  InternalServerError,
  isPantechError,
  NotFoundError,
  PantechError,
  PaymentRequiredError,
  PermissionDeniedError,
  ValidationError,
} from "../src/index.ts";
import { json, mockClient, problem } from "./helpers.ts";

describe("problem documents become typed errors", () => {
  const cases = [
    [401, "UNAUTHENTICATED", AuthenticationError],
    [402, "INSUFFICIENT_CREDIT", PaymentRequiredError],
    [403, "AI_APPS_DISABLED", PermissionDeniedError],
    [404, "RESOURCE_NOT_FOUND", NotFoundError],
    [409, "INSTANCE_NAME_TAKEN", ConflictError],
  ] as const;
  for (const [status, code, Class] of cases) {
    it(`${status} ${code}`, async () => {
      const { client } = mockClient(() => problem(status, code, "Plain words."));
      const err = await client.instances.get("vm_1").catch((e) => e);
      expect(err).toBeInstanceOf(Class);
      expect(err).toBeInstanceOf(PantechError);
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
      expect(err.title).toBe("Problem");
      expect(err.detail).toBe("Plain words.");
      expect(err.requestId).toBe("req_1");
      expect(err.type).toBe("about:blank");
      expect(err.message).toBe(`Plain words. (${code}, request req_1)`);
      expect(isPantechError(err, code)).toBe(true);
      expect(isPantechError(err, "OTHER")).toBe(false);
    });
  }

  it("carries the field errors of a 422", async () => {
    const { client } = mockClient(() =>
      problem(422, "VALIDATION_FAILED", "plan_slug: Unknown plan.", {
        errors: [{ field: "plan_slug", code: "PLAN_NOT_FOUND", message: "Unknown plan." }],
      }),
    );
    const err = await client.instances.resize("vm_1", { plan_slug: "nope" } as never).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.errors).toEqual([{ field: "plan_slug", code: "PLAN_NOT_FOUND", message: "Unknown plan." }]);
  });

  it("takes the request id from X-Request-Id when the body has none", async () => {
    const { client } = mockClient(() =>
      json(404, { code: "RESOURCE_NOT_FOUND", detail: "Subnet not found." }, { "x-request-id": "req_hdr" }),
    );
    const err = await client.networks.subnets.get("sub_1").catch((e) => e);
    expect(err.requestId).toBe("req_hdr");
    expect(err.headers.get("x-request-id")).toBe("req_hdr");
  });

  it("never shows a proxy's error page", async () => {
    const { client } = mockClient(
      () => new Response("<html><body>origin is overloaded, Some Vendor</body></html>", { status: 502 }),
      { maxRetries: 0 },
    );
    const err = await client.regions.list().catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err.message).toBe("The Pantech API is temporarily unavailable (502 Bad gateway). Try again in a moment.");
    expect(err.message).not.toMatch(/html|Vendor/i);
  });

  it("explains a non-JSON success body", async () => {
    const { client } = mockClient(() => new Response("not json", { status: 200 }));
    await expect(client.regions.list()).rejects.toThrow(/not valid JSON/);
  });
});

import { describe, expect, it } from "vitest";
import { paginate } from "../src/index.ts";
import { json, mockClient } from "./helpers.ts";

describe("pagination", () => {
  it("follows next_cursor across pages", async () => {
    const pages: Record<string, unknown> = {
      "": { data: [{ id: "vm_1" }, { id: "vm_2" }], next_cursor: "c2" },
      c2: { data: [{ id: "vm_3" }], next_cursor: "c3" },
      c3: { data: [{ id: "vm_4" }], next_cursor: null },
    };
    const { client, calls } = mockClient((call) => json(200, pages[call.url.searchParams.get("cursor") ?? ""]));
    const ids: string[] = [];
    for await (const vm of client.instances.listAll({ limit: 2, q: "web" })) ids.push(vm.id);
    expect(ids).toEqual(["vm_1", "vm_2", "vm_3", "vm_4"]);
    expect(calls.map((c) => c.url.search)).toEqual([
      "?limit=2&q=web",
      "?limit=2&q=web&cursor=c2",
      "?limit=2&q=web&cursor=c3",
    ]);
  });

  it("fetches a page only when the caller gets that far", async () => {
    const { client, calls } = mockClient(() => json(200, { data: [{ id: "a" }, { id: "b" }], next_cursor: "more" }));
    for await (const key of client.sshKeys.listAll()) {
      expect(key.id).toBe("a");
      break;
    }
    expect(calls).toHaveLength(1);
  });

  it("follows the cursor on nested lists", async () => {
    const { client, calls } = mockClient((call) =>
      call.url.searchParams.get("cursor")
        ? json(200, { data: [{ id: "sub_2" }], next_cursor: null })
        : json(200, { data: [{ id: "sub_1" }], next_cursor: "n" }),
    );
    const ids: string[] = [];
    for await (const subnet of client.networks.subnets.listAll("net_1")) ids.push(subnet.id);
    expect(ids).toEqual(["sub_1", "sub_2"]);
    expect(calls[1]?.url.pathname).toBe("/public/v1/networks/net_1/subnets");
  });

  it("stops on a cursor it has already seen", async () => {
    let n = 0;
    const items: number[] = [];
    for await (const i of paginate(async () => ({ data: [n++], next_cursor: "same" }))) items.push(i);
    expect(items).toEqual([0, 1]);
  });

  it("returns one page from list", async () => {
    const { client } = mockClient(() => json(200, { data: [{ id: "net_1" }], next_cursor: "x" }));
    const page = await client.networks.list({ limit: 1 });
    expect(page.next_cursor).toBe("x");
    expect(page.data[0]?.id).toBe("net_1");
  });
});

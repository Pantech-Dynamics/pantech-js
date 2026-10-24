// Lists every instance, and every network with its subnets, following the
// cursor page by page.
//
//   PANTECH_API_KEY=PAN_… node examples/list.ts
import { Pantech } from "@pantechdynamic/sdk";

const client = new Pantech();

const me = await client.me.get();
console.log(`Organization ${me.organization_id}, key "${me.api_key.name}" (${me.api_key.scopes.join(", ")})\n`);

console.log("Instances");
for await (const vm of client.instances.listAll()) {
  console.log(`  ${vm.id}  ${vm.name.padEnd(24)} ${(vm.plan_slug ?? "").padEnd(12)} ${vm.observed_state}`);
}

console.log("\nNetworks");
for await (const network of client.networks.listAll()) {
  console.log(`  ${network.id}  ${network.name}  ${network.cidr}`);
  for await (const subnet of client.networks.subnets.listAll(network.id)) {
    console.log(`    ${subnet.id}  ${subnet.name}  ${subnet.cidr}`);
  }
}

// Orders an instance, waits until it is running, and prints its address.
//
//   PANTECH_API_KEY=PAN_… node examples/create-instance.ts
//
// This spends money: the initial payment is taken from your credit (or your
// default card) before the instance is provisioned.
import { isPantechError, Pantech } from "@pantechdynamic/sdk";

const client = new Pantech();

const [plans, images, keys] = await Promise.all([client.plans.list(), client.images.list(), client.sshKeys.list()]);
const plan = plans.data[0];
const image = images.data.find((i) => i.slug.startsWith("ubuntu")) ?? images.data[0];
const key = keys.data[0];
if (!plan || !image || !key) {
  throw new Error("You need at least one plan, one image and one SSH key (client.sshKeys.create) first.");
}

try {
  const order = await client.instances.create({
    name: "sdk-example",
    plan_slug: plan.slug,
    image_slug: image.slug,
    ssh_key_id: key.id,
  });
  console.log(`Ordered ${order.instance_id} (order ${order.order_id}), waiting for it to be ready…`);

  await client.instanceOrders.wait(order, {
    timeoutMs: 15 * 60_000,
    onUpdate: (o) => console.log(`  order ${o.status}`),
  });

  const vm = await client.instances.get(order.instance_id);
  console.log(`${vm.name} is ${vm.observed_state} at ${vm.public_ipv4 ?? vm.private_ipv4}`);
} catch (err) {
  if (isPantechError(err, "INSUFFICIENT_CREDIT")) {
    console.error("Not enough credit: buy some with client.billing.credit.purchases.create().");
  } else if (isPantechError(err)) {
    console.error(`${err.message}`);
  }
  throw err;
}

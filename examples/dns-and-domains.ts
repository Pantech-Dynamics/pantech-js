// Hosts a zone on Pantech DNS, points www at an address, prints the name
// servers to set at your registrar and the zone file, and looks for a domain.
//
//   PANTECH_API_KEY=PAN_… node examples/dns-and-domains.ts example.com 203.0.113.10 [search]
//
// The zone is created if your organization has none with this name. Hosting a
// zone is free; nothing is bought.
import { DNSFailedError, isPantechError, Pantech } from "@pantechdynamic/sdk";

const [zoneName, address, search] = process.argv.slice(2);
if (!zoneName || !address) {
  console.error("Usage: node examples/dns-and-domains.ts <zone> <ipv4> [search]");
  process.exit(2);
}

const client = new Pantech();

try {
  let zone = null;
  for await (const z of client.dns.zones.listAll({ q: zoneName })) {
    if (z.name === zoneName && !["deleting", "deleted", "failed"].includes(z.status)) zone = z;
  }
  zone ??= await client.dns.zones.create({ name: zoneName });
  zone = await client.dns.zones.wait(zone.id);
  console.log(`Zone ${zone.id} ${zone.name}: ${zone.status}`);

  // Create www, or change it if it is there already. ifMatch refuses the
  // change if someone else changed the record set since it was read.
  const [existing] = (await client.dns.records.list(zone.id, { name: "www", type: "A" })).data;
  const written = existing
    ? await client.dns.records.update(zone.id, existing.id, { values: [address] }, { ifMatch: existing.version })
    : await client.dns.records.create(zone.id, { name: "www", type: "A", values: [address], ttl: 300 });
  const record = await client.dns.records.wait(zone.id, written.id);
  console.log(`${record.fqdn} ${record.type} ${record.values.join(", ")}: ${record.status}`);

  if (zone.status === "awaiting_delegation") {
    console.log("\nSet these name servers at your domain's registrar:");
    for (const ns of zone.name_servers) console.log(`  ${ns}`);
  }

  console.log("\nZone file:");
  console.log(await client.dns.zones.exportZoneFile(zone.id));

  if (search) {
    console.log(`Domains for "${search}":`);
    for (const result of (await client.domains.search({ query: search })).data) {
      const price = result.price
        ? `${result.price.currency} ${(result.price.register_minor / 100).toFixed(2)}/year`
        : "";
      console.log(`  ${result.name.padEnd(40)} ${result.status.padEnd(12)} ${price}`);
    }
    // To buy one: client.domains.register({ name, contact, accept_terms: true }),
    // then client.domains.orders.wait(result). It is paid from your credit.
  }
} catch (err) {
  if (err instanceof DNSFailedError) {
    console.error(`${err.message}`);
  } else if (isPantechError(err)) {
    console.error(`${err.status ?? ""} ${err.code ?? ""}: ${err.detail ?? err.message}`);
  } else {
    throw err;
  }
  process.exitCode = 1;
}

// Requests a TLS certificate and waits until it is issued.
//
//   PANTECH_API_KEY=PAN_… node examples/certificates.ts example.com '*.example.com'
//
// Names in an active Pantech DNS zone of your organization are validated
// automatically, usually within two minutes. For any other name it prints the
// CNAME to add at your DNS host once; it keeps renewals automatic as long as it
// stays. Pantech renews the certificate by itself.
import { CertificateFailedError, isPantechError, Pantech, WaitTimeoutError } from "@pantechdynamic/sdk";

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("Usage: node examples/certificates.ts <name> [name…]");
  process.exit(2);
}

const client = new Pantech();

try {
  const requested = await client.certificates.request({ names, description: "Requested by examples/certificates.ts" });
  console.log(`Certificate ${requested.id} for ${requested.names.join(", ")}: ${requested.status}`);

  const cnames = new Map<string, string>();
  for (const v of requested.validations) {
    if (v.method === "cname" && v.cname_name && v.cname_target) cnames.set(v.cname_name, v.cname_target);
  }
  if (cnames.size > 0) {
    console.log("\nAdd these CNAME records at your DNS host:");
    for (const [name, target] of cnames) console.log(`  ${name}  CNAME  ${target}`);
    await client.certificates.verify(requested.id); // checks them within seconds once they exist
  }

  const cert = await client.certificates.wait(requested.id, { timeoutMs: 15 * 60_000 });
  console.log(`\nIssued by ${cert.issuer}, valid until ${cert.not_after}, renewed from ${cert.renew_after}`);
} catch (err) {
  if (err instanceof CertificateFailedError || err instanceof WaitTimeoutError) {
    console.error(err.message);
  } else if (isPantechError(err)) {
    console.error(`${err.status ?? ""} ${err.code ?? ""}: ${err.detail ?? err.message}`);
  } else {
    throw err;
  }
  process.exitCode = 1;
}

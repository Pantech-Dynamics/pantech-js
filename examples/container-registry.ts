// Sets up the private container registry for CI: a namespace, a repository
// with retention, and a push token.
//
//   PANTECH_API_KEY=PAN_… node examples/container-registry.ts acme api/server [token-file]
//
// The namespace is claimed if your organization has none yet. The token's
// secret is shown only once: it is written to token-file (default
// registry-token.txt, readable by you alone), never printed.
import { writeFileSync } from "node:fs";
import { isPantechError, NotFoundError, Pantech } from "@pantechdynamic/sdk";

const [namespaceName, repositoryName, tokenFile = "registry-token.txt"] = process.argv.slice(2);
if (!namespaceName || !repositoryName) {
  console.error("Usage: node examples/container-registry.ts <namespace> <repository> [token-file]");
  process.exit(2);
}

const client = new Pantech();

try {
  const ns = await client.registry.namespace.get().catch((err) => {
    if (err instanceof NotFoundError && err.code === "REGISTRY_NAMESPACE_NOT_SET") {
      return client.registry.namespace.set({ name: namespaceName });
    }
    throw err;
  });
  console.log(`Namespace ${ns.name} on ${ns.registry_host}`);

  let repo = null;
  for await (const r of client.registry.repositories.listAll({ q: repositoryName })) {
    if (r.name === repositoryName) repo = r;
  }
  repo ??= await client.registry.repositories.create({
    name: repositoryName,
    immutable_tags: true,
    retention: { keep_last: 50, untagged_after_days: 7, keep_pattern: "v*" },
  });
  console.log(`Repository ${repo.full_name} (${repo.visibility})`);

  const token = await client.registry.tokens.create({ name: "ci", permission: "push", repositories: [repo.name] });
  if (token.secret === null) {
    // A replayed create: the secret is never stored, so it cannot be shown again.
    throw new Error("The token's secret was already shown once; revoke the token and create another.");
  }
  writeFileSync(tokenFile, token.secret, { mode: 0o600 });
  console.log(`Token ${token.id} (${token.permission}): secret written to ${tokenFile}`);

  console.log("\nIn CI:");
  console.log(`  docker login ${ns.registry_host} -u pantech --password-stdin < ${tokenFile}`);
  console.log(`  docker build -t ${repo.full_name}:v1 . && docker push ${repo.full_name}:v1`);
} catch (err) {
  if (!isPantechError(err)) throw err;
  console.error(`${err.status ?? ""} ${err.code ?? ""}: ${err.detail ?? err.message}`);
  process.exitCode = 1;
}

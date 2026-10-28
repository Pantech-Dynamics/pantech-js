// Connects an AWS account, scans it, plans the move to Pantech, prints the
// price comparison and writes the plan as Terraform.
//
//   PANTECH_API_KEY=PAN_… node examples/migrate-from-aws.ts [name] [out-dir]
//
// It prints a link that creates a read-only role in your AWS account. Create
// the stack, then paste its RoleArn output when asked, or set
// PANTECH_ROLE_ARN up front. No AWS access keys are ever sent. Planning
// creates nothing on Pantech; set PANTECH_REGION to plan for a region other
// than the first.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { CloudFailedError, isPantechError, Pantech } from "@pantechdynamic/sdk";

const name = process.argv[2] ?? "AWS account";
const out = process.argv[3] ?? "pantech-migration";
const region = process.env.PANTECH_REGION;
mkdirSync(out, { recursive: true });

const client = new Pantech();

const money = (minor: number | null | undefined, currency: string | null | undefined) =>
  minor == null ? "unknown" : `${currency ?? ""} ${(minor / 100).toFixed(2)}`.trim();

try {
  // 1. Start a connection. Nothing is shared yet.
  let conn = await client.migrate.connections.create({ name });
  console.log(`Connection ${conn.id}`);

  // 2. Create the read-only role in AWS, from the one-click link or the template.
  if (conn.setup.quick_create_url) {
    console.log("\nOpen this link, signed in to AWS, and create the stack:");
    console.log(`  ${conn.setup.quick_create_url}`);
  } else {
    const template = join(out, "pantech-role.template.json");
    writeFileSync(template, conn.setup.template);
    console.log(`\nCreate a CloudFormation stack in AWS from ${template}`);
  }

  // 3. Send the stack's RoleArn output.
  let roleArn = process.env.PANTECH_ROLE_ARN?.trim();
  if (!roleArn) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    roleArn = (await rl.question("\nPaste the stack's RoleArn output: ")).trim();
    rl.close();
  }
  if (!roleArn) throw new Error("No role ARN given.");
  await client.migrate.connections.update(conn.id, { role_arn: roleArn });

  // 4. Wait for Pantech to assume the role.
  conn = await client.migrate.connections.wait(conn.id);
  console.log(`Connected to AWS account ${conn.aws_account_id}`);

  // 5. Scan the account.
  let scan = await client.migrate.scans.start(conn.id);
  console.log(`Scanning (${scan.id}); most accounts take under five minutes…`);
  scan = await client.migrate.scans.wait(scan.id, { onUpdate: (s) => console.log(`  ${s.status}`) });
  const counts = scan.counts;
  if (counts) {
    console.log(
      `Found ${counts.instances} servers, ${counts.volumes} disks, ${counts.networks} networks, ` +
        `${counts.databases} databases in ${scan.regions.join(", ")}`,
    );
  }
  for (const warning of scan.warnings) console.log(`  not read: ${warning}`);

  // 6. Plan the move. Nothing is created on Pantech.
  const plan = await client.migrate.migrations.create({ scan_id: scan.id, name, ...(region ? { region } : {}) });
  const { summary } = plan;
  console.log(
    `\nPlan ${plan.id} for ${plan.region}: ${summary.planned} planned, ${summary.excluded} excluded, ` +
      `${summary.unsupported} not supported yet`,
  );
  for (const item of plan.items ?? []) {
    for (const flag of item.flags) if (flag.blocking) console.log(`  ${item.key}: ${flag.message}`);
  }

  // 7. The price comparison.
  const estimate = plan.estimate;
  if (estimate) {
    console.log(
      estimate.pantech_priced
        ? `Pantech: ${money(estimate.pantech_monthly_minor, estimate.currency)} a month (covers ${estimate.covers.join(", ")})`
        : "Pantech: part of the plan could not be priced",
    );
    if (estimate.not_covered.length > 0) console.log(`  not in the price: ${estimate.not_covered.join(", ")}`);
    if (estimate.source_known) {
      console.log(
        `AWS: ${money(estimate.source_monthly_minor, estimate.source_currency)} a month, ` +
          `the whole bill averaged over ${estimate.source_months} months`,
      );
    }
  }

  // 8. Export Terraform.
  const terraform = await client.migrate.migrations.exportTerraform(plan.id);
  for (const file of terraform.files) {
    const target = join(out, basename(file.name));
    writeFileSync(target, file.content);
    console.log(`Wrote ${target}`);
  }
  console.log(`\nReview the files, fill in the variables, then run terraform init and terraform plan in ${out}`);
} catch (err) {
  if (err instanceof CloudFailedError) {
    // err.detail says what to do; branch on err.code.
    console.error(`The ${err.kind} failed: ${err.detail} (${err.code})`);
  } else if (isPantechError(err)) {
    console.error(`${err.detail ?? err.message} (request ${err.requestId})`);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
}

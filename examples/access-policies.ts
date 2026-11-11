// Gives a team restart-and-resize access to staging machines, and checks it.
//
//   PANTECH_API_KEY=PAN_… node examples/access-policies.ts usr_… [team]
//
// Creates (or reuses) the team and a "staging-operators" policy, attaches the
// policy to the team, adds the member, and asks the simulator whether they may
// stop and delete a staging machine. Owners and admins only.
import { iam, isPantechError, Pantech, ValidationError } from "@pantechdynamic/sdk";

const [userId, teamName = "Platform"] = process.argv.slice(2);
if (!userId) {
  console.error("Usage: node examples/access-policies.ts <usr_…> [team]");
  process.exit(2);
}

const POLICY = "staging-operators";
const statements = [
  iam.allow(
    ["instances:Read", "instances:Start", "instances:Stop", "instances:Reboot", "instances:Resize"],
    ["name:staging-*"],
    { sid: "OperateStaging" },
  ),
  iam.deny(["instances:Delete"], ["*"], { sid: "NoDeletes" }),
];

const client = new Pantech();

try {
  let team = null;
  for await (const t of client.iam.teams.listAll()) if (t.name === teamName) team = t;
  team ??= await client.iam.teams.create({ name: teamName });

  let policy = null;
  for await (const p of client.iam.policies.listAll({ managed: false })) if (p.name === POLICY) policy = p;
  policy = policy
    ? // ifMatch refuses the change if someone else edited the policy since it was read.
      await client.iam.policies.update(policy.id, { name: POLICY, statements }, { ifMatch: policy.version })
    : await client.iam.policies.create({ name: POLICY, statements });

  if (!team.policy_ids.includes(policy.id)) {
    await client.iam.policies.attachments.attach(policy.id, { principal_type: "team", principal_id: team.id });
  }
  await client.iam.teams.members.add(team.id, userId);
  console.log(`Team ${team.name} (${team.id}) has ${policy.name} (${policy.id}) and ${userId}`);

  for (const action of ["instances:Stop", "instances:Delete"]) {
    const sim = await client.iam.simulate({ user_id: userId, action, resource_name: "staging-web-1" });
    console.log(`  ${action} on staging-web-1: ${sim.allowed ? "allowed" : "denied"} (${sim.decision})`);
  }
} catch (err) {
  if (err instanceof ValidationError) {
    for (const fe of err.errors) console.error(`${fe.field}: ${fe.message}`);
  } else if (isPantechError(err)) {
    console.error(`${err.status ?? ""} ${err.code ?? ""}: ${err.detail ?? err.message}`);
  } else {
    throw err;
  }
  process.exitCode = 1;
}

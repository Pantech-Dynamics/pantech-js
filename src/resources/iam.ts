import type { RequestOptions } from "../client.js";
import { APIResource, type IfMatchOptions, withIfMatch } from "../resource.js";
import type { BodyOf as B, ItemOf as I, ListParams as L, ListAllParams as LA, ResponseOf as R } from "../types.js";
import { path } from "../util.js";

/**
 * Teams and access policies: who in your organization may do what, on which
 * resources. Build statements with `iam.allow(...)` and `iam.deny(...)`.
 */
export class IAM extends APIResource {
  /** The actions a policy statement can name. */
  readonly actions: IAMActions = new IAMActions(this._client);
  /** Whether members may read everything, or only what their policies allow. */
  readonly settings: IAMSettings = new IAMSettings(this._client);
  /** The organization's members, with their teams and how many policies apply to each. */
  readonly members: IAMMembers = new IAMMembers(this._client);
  /** Teams of members that policies are attached to. */
  readonly teams: IAMTeams = new IAMTeams(this._client);
  /** Statements that allow or deny actions, attached to members or teams. */
  readonly policies: IAMPolicies = new IAMPolicies(this._client);

  /** A member's role, teams and every policy that applies to them, with the team that brought it. */
  effectiveAccess(userId: string, options?: RequestOptions): Promise<R<"getIamEffectiveAccess">> {
    return this._get(path`/iam/members/${userId}/effective-access`, undefined, options);
  }

  /** Whether a member may do an action (on a resource, from an address, with MFA), and which policy decided. */
  simulate(body: B<"simulateIamAccess">, options?: RequestOptions): Promise<R<"simulateIamAccess">> {
    return this._post("/iam/simulate", body, options);
  }
}

export class IAMActions extends APIResource {
  /** Every action, e.g. `instances:Stop`, with its description and whether it is a read. */
  list(options?: RequestOptions): Promise<R<"listIamActions">> {
    return this._get("/iam/actions", undefined, options);
  }
}

export class IAMMembers extends APIResource {
  /** One page of members, by when they joined. Filter with `q` (email or name). */
  list(params: L<"listIamMembers"> = {}, options?: RequestOptions): Promise<R<"listIamMembers">> {
    return this._get("/iam/members", params, options);
  }

  listAll(params: LA<"listIamMembers"> = {}, options?: RequestOptions): AsyncGenerator<I<"listIamMembers">> {
    return this._listAll("/iam/members", params, options);
  }
}

export class IAMSettings extends APIResource {
  get(options?: RequestOptions): Promise<R<"getIamSettings">> {
    return this._get("/iam/settings", undefined, options);
  }

  /** Changes `member_baseline` (`read` or `none`). Owners only. Pass `{ ifMatch: settings.version }` to refuse a lost update. */
  update(body: B<"updateIamSettings">, options?: IfMatchOptions): Promise<R<"updateIamSettings">> {
    return this._put("/iam/settings", body, withIfMatch(options));
  }
}

export class IAMTeams extends APIResource {
  /** Members of a team. */
  readonly members: IAMTeamMembers = new IAMTeamMembers(this._client);

  list(params: L<"listIamTeams"> = {}, options?: RequestOptions): Promise<R<"listIamTeams">> {
    return this._get("/iam/teams", params, options);
  }

  listAll(params: LA<"listIamTeams"> = {}, options?: RequestOptions): AsyncGenerator<I<"listIamTeams">> {
    return this._listAll("/iam/teams", params, options);
  }

  create(body: B<"createIamTeam">, options?: RequestOptions): Promise<R<"createIamTeam">> {
    return this._post("/iam/teams", body, options);
  }

  get(teamId: string, options?: RequestOptions): Promise<R<"getIamTeam">> {
    return this._get(path`/iam/teams/${teamId}`, undefined, options);
  }

  update(teamId: string, body: B<"updateIamTeam">, options?: RequestOptions): Promise<R<"updateIamTeam">> {
    return this._patch(path`/iam/teams/${teamId}`, body, options);
  }

  /** Deletes the team; its members lose what its policies gave them. */
  delete(teamId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/iam/teams/${teamId}`, options);
  }
}

export class IAMTeamMembers extends APIResource {
  list(
    teamId: string,
    params: L<"listIamTeamMembers"> = {},
    options?: RequestOptions,
  ): Promise<R<"listIamTeamMembers">> {
    return this._get(path`/iam/teams/${teamId}/members`, params, options);
  }

  listAll(
    teamId: string,
    params: LA<"listIamTeamMembers"> = {},
    options?: RequestOptions,
  ): AsyncGenerator<I<"listIamTeamMembers">> {
    return this._listAll(path`/iam/teams/${teamId}/members`, params, options);
  }

  /** Adds an organization member to the team. Only owners may add an admin. */
  add(teamId: string, userId: string, options?: RequestOptions): Promise<R<"addIamTeamMember">> {
    return this._request("PUT", path`/iam/teams/${teamId}/members/${userId}`, {}, options);
  }

  remove(teamId: string, userId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/iam/teams/${teamId}/members/${userId}`, options);
  }
}

export class IAMPolicies extends APIResource {
  /** The members and teams a policy is attached to. */
  readonly attachments: IAMPolicyAttachments = new IAMPolicyAttachments(this._client);

  /** Your policies and Pantech's managed ones; `{ managed: false }` for yours only. */
  list(params: L<"listIamPolicies"> = {}, options?: RequestOptions): Promise<R<"listIamPolicies">> {
    return this._get("/iam/policies", params, options);
  }

  listAll(params: LA<"listIamPolicies"> = {}, options?: RequestOptions): AsyncGenerator<I<"listIamPolicies">> {
    return this._listAll("/iam/policies", params, options);
  }

  /** Creates a policy of 1 to 20 statements. It does nothing until it is attached. */
  create(body: B<"createIamPolicy">, options?: RequestOptions): Promise<R<"createIamPolicy">> {
    return this._post("/iam/policies", body, options);
  }

  get(policyId: string, options?: RequestOptions): Promise<R<"getIamPolicy">> {
    return this._get(path`/iam/policies/${policyId}`, undefined, options);
  }

  /** Replaces the name, description and statements. Pass `{ ifMatch: policy.version }` to refuse a lost update. */
  update(policyId: string, body: B<"updateIamPolicy">, options?: IfMatchOptions): Promise<R<"updateIamPolicy">> {
    return this._put(path`/iam/policies/${policyId}`, body, withIfMatch(options));
  }

  /** Deletes the policy and detaches it everywhere. Pantech's managed policies cannot be deleted. */
  delete(policyId: string, options?: RequestOptions): Promise<void> {
    return this._delete(path`/iam/policies/${policyId}`, options);
  }
}

export class IAMPolicyAttachments extends APIResource {
  list(policyId: string, options?: RequestOptions): Promise<R<"listIamPolicyAttachments">> {
    return this._get(path`/iam/policies/${policyId}/attachments`, undefined, options);
  }

  /** Attaches the policy to a member (`usr_…`) or a team (`team_…`). */
  attach(policyId: string, body: B<"attachIamPolicy">, options?: RequestOptions): Promise<R<"attachIamPolicy">> {
    return this._post(path`/iam/policies/${policyId}/attachments`, body, options);
  }

  detach(
    policyId: string,
    principalType: "member" | "team",
    principalId: string,
    options?: RequestOptions,
  ): Promise<void> {
    return this._delete(path`/iam/policies/${policyId}/attachments/${principalType}/${principalId}`, options);
  }
}

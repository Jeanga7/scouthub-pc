export type AuthorizationDecision = "allow" | "deny";

export interface AuthorizationContext {
  readonly actorId: string;
  readonly organizationScopeId?: string;
}

export function denyByDefault(): AuthorizationDecision {
  return "deny";
}

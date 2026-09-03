import type { IdentityProvider, IdentitySession } from "@scouthub/application";

export const LOCAL_PERSONA_COOKIE = "scouthub_local_persona";

export interface LocalIdentityPersona {
  readonly selectorId: string;
  readonly subjectId: string;
}

export function createLocalIdentityProviderAdapter(input: {
  readonly appEnv: string;
  readonly personas: readonly LocalIdentityPersona[];
}): IdentityProvider {
  const subjects = new Map(input.personas.map((persona) => [persona.selectorId, persona.subjectId]));

  return {
    getSession(request): Promise<IdentitySession | null> {
      if (input.appEnv !== "local") {
        return Promise.resolve(null);
      }
      const selector = readCookie(request.headers.get("cookie"), LOCAL_PERSONA_COOKIE);
      const subjectId = selector === null ? undefined : subjects.get(selector);
      if (subjectId === undefined) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        sessionId: `local:${selector}`,
        subjectId,
        assuranceLevel: "standard",
        issuedAt: new Date(0),
        expiresAt: new Date("2999-01-01T00:00:00.000Z")
      });
    },
    getIdentityProfile: () => Promise.resolve(null),
    createInvitation: () => Promise.reject(localOnlyMutationError()),
    revokeInvitation: () => Promise.reject(localOnlyMutationError()),
    revokeSession: () => Promise.reject(localOnlyMutationError()),
    suspendIdentity: () => Promise.reject(localOnlyMutationError()),
    restoreIdentity: () => Promise.reject(localOnlyMutationError())
  };
}

function readCookie(header: string | null, name: string): string | null {
  for (const entry of header?.split(";") ?? []) {
    const [key, ...parts] = entry.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(parts.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function localOnlyMutationError(): Error {
  return new Error("Local identity provider does not perform identity mutations.");
}

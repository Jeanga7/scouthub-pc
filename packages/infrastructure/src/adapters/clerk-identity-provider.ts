import type {
  IdentityProvider,
  IdentitySession
} from "@scouthub/application";

export interface ClerkSessionReader {
  getSession(request: Request): Promise<IdentitySession | null>;
  revokeSession(sessionId: string): Promise<void>;
}

export function createClerkIdentityProviderAdapter(
  reader: ClerkSessionReader
): IdentityProvider {
  return {
    getSession(request) {
      return reader.getSession(request);
    },
    revokeSession(sessionId) {
      return reader.revokeSession(sessionId);
    }
  };
}

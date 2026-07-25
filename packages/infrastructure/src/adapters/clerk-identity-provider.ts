import type {
  CreateIdentityInvitationInput,
  IdentityInvitationResult,
  IdentityProvider,
  IdentityProfile,
  IdentitySession
} from "@scouthub/application";

export interface ClerkSessionReader {
  getSession(request: Request): Promise<IdentitySession | null>;
  getIdentityProfile(subjectId: string): Promise<IdentityProfile | null>;
  createInvitation(input: CreateIdentityInvitationInput): Promise<IdentityInvitationResult>;
  revokeInvitation(externalInvitationId: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  suspendIdentity(subjectId: string): Promise<void>;
  restoreIdentity(subjectId: string): Promise<void>;
}

export function createClerkIdentityProviderAdapter(
  reader: ClerkSessionReader
): IdentityProvider {
  return {
    getSession(request) {
      return reader.getSession(request);
    },
    getIdentityProfile(subjectId) {
      return reader.getIdentityProfile(subjectId);
    },
    createInvitation(input) {
      return reader.createInvitation(input);
    },
    revokeInvitation(externalInvitationId) {
      return reader.revokeInvitation(externalInvitationId);
    },
    revokeSession(sessionId) {
      return reader.revokeSession(sessionId);
    },
    suspendIdentity(subjectId) {
      return reader.suspendIdentity(subjectId);
    },
    restoreIdentity(subjectId) {
      return reader.restoreIdentity(subjectId);
    }
  };
}

import type {
  CreateIdentityInvitationInput,
  IdentityInvitationResult,
  IdentityProfile,
  IdentityProvider,
  IdentitySession
} from "./identity-provider";

export class FakeIdentityProvider implements IdentityProvider {
  private session: IdentitySession | null = null;
  private readonly profiles = new Map<string, IdentityProfile>();
  private readonly failedInvitationEmails = new Set<string>();
  readonly createdInvitations: CreateIdentityInvitationInput[] = [];
  readonly revokedInvitations: string[] = [];
  readonly revokedSessions: string[] = [];
  readonly suspendedSubjects: string[] = [];

  setSession(session: IdentitySession | null): void {
    this.session = session;
  }

  setProfile(profile: IdentityProfile): void {
    this.profiles.set(profile.subjectId, profile);
  }

  failInvitationFor(email: string): void {
    this.failedInvitationEmails.add(email.toLowerCase());
  }

  getSession(): Promise<IdentitySession | null> {
    return Promise.resolve(this.session);
  }

  getIdentityProfile(subjectId: string): Promise<IdentityProfile | null> {
    return Promise.resolve(this.profiles.get(subjectId) ?? null);
  }

  createInvitation(
    input: CreateIdentityInvitationInput
  ): Promise<IdentityInvitationResult> {
    if (this.failedInvitationEmails.has(input.email.toLowerCase())) {
      return Promise.reject(new Error("Identity invitation failed."));
    }
    this.createdInvitations.push(input);
    return Promise.resolve({ externalInvitationId: `inv_${input.invitationId}` });
  }

  revokeInvitation(externalInvitationId: string): Promise<void> {
    this.revokedInvitations.push(externalInvitationId);
    return Promise.resolve();
  }

  revokeSession(sessionId: string): Promise<void> {
    this.revokedSessions.push(sessionId);
    return Promise.resolve();
  }

  suspendIdentity(subjectId: string): Promise<void> {
    this.suspendedSubjects.push(subjectId);
    return Promise.resolve();
  }

  restoreIdentity(): Promise<void> {
    return Promise.resolve();
  }
}

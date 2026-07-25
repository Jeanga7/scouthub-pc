export interface IdentitySession {
  readonly sessionId: string;
  readonly subjectId: string;
  readonly assuranceLevel: "standard" | "mfa";
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly firstFactorAgeMinutes?: number;
  readonly secondFactorAgeMinutes?: number;
  readonly impersonated?: boolean;
}

export interface IdentityProfile {
  readonly subjectId: string;
  readonly primaryEmail: string;
  readonly emailVerified: boolean;
  readonly invitationId: string | null;
}

export interface CreateIdentityInvitationInput {
  readonly email: string;
  readonly redirectUrl: string;
  readonly invitationId: string;
  readonly expiresInDays: number;
}

export interface IdentityInvitationResult {
  readonly externalInvitationId: string;
}

export interface IdentityProvider {
  getSession(request: Request): Promise<IdentitySession | null>;
  getIdentityProfile(subjectId: string): Promise<IdentityProfile | null>;
  createInvitation(input: CreateIdentityInvitationInput): Promise<IdentityInvitationResult>;
  revokeInvitation(externalInvitationId: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  suspendIdentity(subjectId: string): Promise<void>;
  restoreIdentity(subjectId: string): Promise<void>;
}

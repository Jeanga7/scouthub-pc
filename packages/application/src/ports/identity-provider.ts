export interface IdentitySession {
  readonly sessionId: string;
  readonly subjectId: string;
  readonly emailVerified: boolean;
  readonly assuranceLevel: "standard" | "mfa";
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface IdentityProvider {
  getSession(request: Request): Promise<IdentitySession | null>;
  revokeSession(sessionId: string): Promise<void>;
}

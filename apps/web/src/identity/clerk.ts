import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { createClerkIdentityProviderAdapter } from "@scouthub/infrastructure";
import type { IdentityProfile, IdentitySession } from "@scouthub/application";

export function createClerkIdentityProvider() {
  return createClerkIdentityProviderAdapter({
    async getSession(): Promise<IdentitySession | null> {
      const state = await auth({ acceptsToken: "session_token" });
      return mapClerkSession({
        userId: state.userId,
        sessionId: state.sessionId,
        claims: state.sessionClaims as ClerkSessionClaims
      });
    },
    async getIdentityProfile(subjectId): Promise<IdentityProfile | null> {
      const user = await currentUser();
      if (user === null || user.id !== subjectId) {
        return null;
      }
      const primary = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId
      );
      if (primary === undefined) {
        return null;
      }

      return {
        subjectId: user.id,
        primaryEmail: primary.emailAddress,
        emailVerified: primary.verification?.status === "verified",
        invitationId: metadataString(user.publicMetadata, "scouthub_invitation_id")
      };
    },
    async createInvitation(input) {
      const client = await clerkClient();
      const invitation = await client.invitations.createInvitation({
        emailAddress: input.email,
        expiresInDays: input.expiresInDays,
        redirectUrl: input.redirectUrl,
        publicMetadata: {
          scouthub_invitation_id: input.invitationId
        }
      });
      return { externalInvitationId: invitation.id };
    },
    async revokeInvitation(externalInvitationId) {
      const client = await clerkClient();
      await client.invitations.revokeInvitation(externalInvitationId);
    },
    async revokeSession(sessionId) {
      const client = await clerkClient();
      await client.sessions.revokeSession(sessionId);
    },
    async suspendIdentity(subjectId) {
      const client = await clerkClient();
      await client.users.banUser(subjectId);
    },
    async restoreIdentity(subjectId) {
      const client = await clerkClient();
      await client.users.unbanUser(subjectId);
    }
  });
}

function metadataString(metadata: UserPublicMetadata, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

type UserPublicMetadata = Record<string, unknown>;

type ClerkSessionClaims = {
  readonly iat?: number;
  readonly exp?: number;
  readonly fva?: readonly unknown[];
  readonly act?: unknown;
  readonly actor?: unknown;
};

export function mapClerkSession(input: {
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly claims: ClerkSessionClaims;
}): IdentitySession | null {
  if (input.userId === null || input.sessionId === null) {
    return null;
  }
  const firstFactorAgeMinutes = factorAge(input.claims.fva, 0);
  const secondFactorAgeMinutes = factorAge(input.claims.fva, 1);
  return {
    sessionId: input.sessionId,
    subjectId: input.userId,
    assuranceLevel:
      secondFactorAgeMinutes !== undefined && secondFactorAgeMinutes >= 0
        ? "mfa"
        : "standard",
    issuedAt: unixSecondsToDate(input.claims.iat),
    expiresAt: unixSecondsToDate(input.claims.exp),
    firstFactorAgeMinutes,
    secondFactorAgeMinutes,
    // Clerk impersonation/support actor mode is intentionally not mapped to
    // ScoutHub business rights; Slice 2 has no support impersonation policy.
    impersonated: input.claims.act !== undefined || input.claims.actor !== undefined
  };
}

function unixSecondsToDate(value: number | undefined): Date {
  return new Date((value ?? 0) * 1000);
}

function factorAge(values: readonly unknown[] | undefined, index: number): number | undefined {
  const value = values?.[index];
  return typeof value === "number" ? value : undefined;
}

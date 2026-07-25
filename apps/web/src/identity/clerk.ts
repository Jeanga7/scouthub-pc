import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { createClerkIdentityProviderAdapter } from "@scouthub/infrastructure";
import type { IdentityProfile, IdentitySession } from "@scouthub/application";

export function createClerkIdentityProvider() {
  return createClerkIdentityProviderAdapter({
    async getSession(): Promise<IdentitySession | null> {
      const state = await auth();
      if (state.userId === null || state.sessionId === null) {
        return null;
      }

      return {
        sessionId: state.sessionId,
        subjectId: state.userId,
        assuranceLevel: "standard",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      };
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


export type AccountInvitationStatus =
  | "CREATING"
  | "PENDING"
  | "ACCEPTED"
  | "REVOKED"
  | "EXPIRED"
  | "FAILED";

export interface AccountInvitation {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  readonly personId: string;
  readonly email: string;
  readonly intendedRoleId: string;
  readonly intendedRoleCode: string;
  readonly intendedScopeOrgId: string;
  readonly status: AccountInvitationStatus;
  readonly externalInvitationId: string | null;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly invitedByAccountId: string;
  readonly adultEligibilityAttestedAt: Date;
  readonly adultEligibilityAttestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function canProvisionInvitation(
  invitation: AccountInvitation,
  now: Date
): boolean {
  return invitation.status === "PENDING" && invitation.expiresAt > now;
}


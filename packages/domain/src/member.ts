import type { OrganizationType } from "./organization/organization-type";

export type ScoutProfileSex = "FEMALE" | "MALE" | "UNSPECIFIED";
export type MembershipStatus = "ACTIVE" | "ENDED";

export interface ScoutProfile {
  readonly id: string;
  readonly tenantId: string;
  readonly personId: string;
  readonly scoutId: string;
  readonly sex: ScoutProfileSex;
  readonly birthPlace: string | null;
  readonly primaryPhone: string | null;
  readonly secondaryPhone: string | null;
  readonly email: string | null;
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly guardianRelationship: string | null;
  readonly insuranceNumber: string | null;
  readonly insuranceYear: number | null;
  readonly joinedScoutingAt: Date | null;
  readonly administrativeNotes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Membership {
  readonly id: string;
  readonly tenantId: string;
  readonly personId: string;
  readonly organizationId: string;
  readonly organizationName?: string;
  readonly organizationType?: OrganizationType;
  readonly organizationPath?: string;
  readonly status: MembershipStatus;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly branch: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const territorialMembershipOrganizationTypes = [
  "REGION",
  "DISTRICT",
  "GROUP",
  "ANNEX",
  "UNIT",
] as const satisfies readonly OrganizationType[];

export function normalizeScoutId(sequenceValue: number): string {
  if (!Number.isInteger(sequenceValue) || sequenceValue < 1) {
    throw new Error("Scout ID sequence value must be a positive integer.");
  }
  return `PC-${sequenceValue.toString().padStart(6, "0")}`;
}

export function isValidScoutId(value: string): boolean {
  return /^PC-[0-9]{6,}$/.test(value);
}

export function isTerritorialMembershipOrganizationType(
  type: OrganizationType,
): boolean {
  return territorialMembershipOrganizationTypes.includes(
    type as (typeof territorialMembershipOrganizationTypes)[number],
  );
}

import type {
  Membership,
  OrganizationType,
  Person,
  ScoutProfile,
  ScoutProfileSex,
} from "@scouthub/domain";
import type { AuditEventInput } from "../organization/audit";

export interface MemberOrganizationRef {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly type: OrganizationType;
  readonly path: string;
}

export interface MemberSummaryView {
  readonly personId: string;
  readonly tenantId: string;
  readonly scoutId: string;
  readonly displayName: string;
  readonly status: Person["status"];
  readonly currentOrganization: MemberOrganizationRef | null;
  readonly branch: string | null;
  readonly primaryAppointment: {
    readonly title: string;
    readonly scopeName: string;
  } | null;
}

export interface MemberDetailView extends MemberSummaryView {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date | null;
  readonly birthPlace: string | null;
  readonly sex: ScoutProfileSex;
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
  readonly accountLinked: boolean;
  readonly memberships: readonly Membership[];
  readonly activeAppointments: readonly {
    readonly id: string;
    readonly title: string;
    readonly scopeName: string;
    readonly startsAt: Date;
    readonly endsAt: Date | null;
  }[];
  readonly ancestors: readonly MemberOrganizationRef[];
}

export interface MemberAggregateView {
  readonly totalActive: number;
  readonly bySex: readonly {
    readonly sex: ScoutProfileSex;
    readonly count: number;
  }[];
  readonly byBranch: readonly {
    readonly branch: string;
    readonly count: number;
  }[];
  readonly byOrganizationType: readonly {
    readonly type: OrganizationType;
    readonly count: number;
  }[];
}

export interface MemberListInput {
  readonly tenantId: string;
  readonly scopePaths: readonly string[];
  readonly query: string | null;
  readonly filterOrganizationIds: readonly string[];
  readonly branch: string | null;
  readonly status: "ACTIVE" | "INACTIVE" | null;
  readonly limit: number;
  readonly offset: number;
}

export interface MemberListPage {
  readonly items: readonly MemberSummaryView[];
  readonly total: number;
}

export interface CreateMemberRecord {
  readonly person: {
    readonly id: string;
    readonly tenantId: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly displayName: string;
    readonly birthDate: Date | null;
  };
  readonly profile: Omit<ScoutProfile, "createdAt" | "updatedAt" | "scoutId">;
  readonly membership: Omit<Membership, "createdAt" | "updatedAt">;
}

export interface UpdateMemberRecord {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly birthDate?: Date | null;
  readonly status?: "ACTIVE" | "INACTIVE";
  readonly profile?: Partial<
    Pick<
      ScoutProfile,
      | "sex"
      | "birthPlace"
      | "primaryPhone"
      | "secondaryPhone"
      | "email"
      | "guardianName"
      | "guardianPhone"
      | "guardianRelationship"
      | "insuranceNumber"
      | "insuranceYear"
      | "joinedScoutingAt"
      | "administrativeNotes"
    >
  >;
}

export interface MemberRepository {
  transaction<TResult>(
    handler: (transaction: MemberTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface MemberTransaction {
  findOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<MemberOrganizationRef | null>;
  listOrganizations(
    tenantId: string,
    organizationIds: readonly string[],
  ): Promise<MemberOrganizationRef[]>;
  listMembers(input: MemberListInput): Promise<MemberListPage>;
  findMemberDetail(
    tenantId: string,
    personId: string,
  ): Promise<MemberDetailView | null>;
  createMember(input: CreateMemberRecord): Promise<MemberDetailView>;
  updateMember(
    tenantId: string,
    personId: string,
    patch: UpdateMemberRecord,
  ): Promise<MemberDetailView | null>;
  findActiveMembershipForUpdate(
    tenantId: string,
    personId: string,
  ): Promise<Membership | null>;
  endMembership(
    tenantId: string,
    membershipId: string,
    endsAt: Date,
  ): Promise<Membership | null>;
  createMembership(
    input: Omit<Membership, "createdAt" | "updatedAt">,
  ): Promise<Membership>;
  aggregateMembers(
    tenantId: string,
    scopePaths: readonly string[],
  ): Promise<MemberAggregateView>;
  appendAuditEvent(input: AuditEventInput): Promise<void>;
}

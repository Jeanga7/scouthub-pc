import {
  displayNameFor,
  isRoleAssignmentActive,
  isTerritorialMembershipOrganizationType,
  type Membership,
  type PermissionCode,
  type ScoutProfileSex,
} from "@scouthub/domain";
import { NotFoundError, ValidationError } from "../organization/errors";
import {
  createAuditEvent,
  type MemberAuditAction,
  type RequestContext,
} from "../organization/audit";
import type { IdGenerator } from "../organization/use-cases";
import type { ActorContext } from "../ports/identity-repository";
import type {
  CreateMemberRecord,
  MemberAggregateView,
  MemberDetailView,
  MemberListInput,
  MemberListPage,
  MemberOrganizationRef,
  MemberRepository,
  UpdateMemberRecord,
} from "../ports/member-repository";

export interface CreateMemberInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
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
  readonly organizationId: string;
  readonly startsAt: Date;
  readonly branch: string | null;
  readonly insuranceNumber: string | null;
  readonly insuranceYear: number | null;
  readonly joinedScoutingAt: Date | null;
  readonly administrativeNotes: string | null;
}

export interface ListMembersInput {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly query: string | null;
  readonly filterOrganizationIds: readonly string[];
  readonly branch: string | null;
  readonly status: "ACTIVE" | "INACTIVE" | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface ReadMemberInput {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly personId: string;
}

export interface UpdateMemberInput extends ReadMemberInput, RequestContext {
  readonly patch: UpdateMemberRecord;
}

export interface TransferMemberInput extends ReadMemberInput, RequestContext {
  readonly organizationId: string;
  readonly startsAt: Date;
  readonly branch: string | null;
}

export class MemberUseCases {
  constructor(
    private readonly repository: MemberRepository,
    private readonly ids: IdGenerator,
  ) {}

  async listMembers(input: ListMembersInput): Promise<MemberListPage> {
    const scopes = readableScopePaths(
      input.actor,
      input.tenantId,
      "member.read",
    );
    if (scopes.length === 0) return { items: [], total: 0 };
    return this.repository.transaction((tx) =>
      tx.listMembers({
        tenantId: input.tenantId,
        scopePaths: scopes,
        query: input.query,
        filterOrganizationIds: input.filterOrganizationIds,
        branch: input.branch,
        status: input.status,
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      } satisfies MemberListInput),
    );
  }

  async getMember(input: ReadMemberInput): Promise<MemberDetailView> {
    const detail = await this.repository.transaction((tx) =>
      tx.findMemberDetail(input.tenantId, input.personId),
    );
    if (detail === null) throw new NotFoundError("Membre introuvable.");
    assertCanReadMember(input.actor, detail, "member.read");
    return visibleMemberDetail(input.actor, input.tenantId, detail);
  }

  async createMember(input: CreateMemberInput): Promise<MemberDetailView> {
    validateDates(input.birthDate, input.startsAt, input.joinedScoutingAt);
    return this.repository.transaction(async (tx) => {
      const target = await tx.findOrganization(
        input.tenantId,
        input.organizationId,
      );
      assertTerritorialTarget(target);
      assertScopePermission(input.actor, "member.create", target);
      const personId = this.ids.generate();
      const membershipId = this.ids.generate();
      const profileId = this.ids.generate();
      const created = await tx.createMember({
        person: {
          id: personId,
          tenantId: input.tenantId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          displayName: displayNameFor(input.firstName, input.lastName),
          birthDate: input.birthDate,
        },
        profile: {
          id: profileId,
          tenantId: input.tenantId,
          personId,
          sex: input.sex,
          birthPlace: clean(input.birthPlace),
          primaryPhone: clean(input.primaryPhone),
          secondaryPhone: clean(input.secondaryPhone),
          email: clean(input.email)?.toLowerCase() ?? null,
          guardianName: clean(input.guardianName),
          guardianPhone: clean(input.guardianPhone),
          guardianRelationship: clean(input.guardianRelationship),
          insuranceNumber: clean(input.insuranceNumber),
          insuranceYear: input.insuranceYear,
          joinedScoutingAt: input.joinedScoutingAt,
          administrativeNotes: clean(input.administrativeNotes),
        },
        membership: {
          id: membershipId,
          tenantId: input.tenantId,
          personId,
          organizationId: target.id,
          status: "ACTIVE",
          startsAt: input.startsAt,
          endsAt: null,
          branch: clean(input.branch),
        },
      } satisfies CreateMemberRecord);
      await tx.appendAuditEvent(
        memberAudit(input, this.ids.generate(), personId, "member.created", {
          organization_id: target.id,
        }),
      );
      await tx.appendAuditEvent(
        memberAudit(
          input,
          this.ids.generate(),
          membershipId,
          "membership.started",
          {
            person_id: personId,
            organization_id: target.id,
          },
        ),
      );
      return visibleMemberDetail(input.actor, input.tenantId, created);
    });
  }

  async updateMember(input: UpdateMemberInput): Promise<MemberDetailView> {
    validateDates(
      input.patch.birthDate,
      undefined,
      input.patch.profile?.joinedScoutingAt,
    );
    return this.repository.transaction(async (tx) => {
      const current = await tx.findMemberDetail(input.tenantId, input.personId);
      if (current === null) throw new NotFoundError("Membre introuvable.");
      assertCanReadMember(input.actor, current, "member.update");
      const updated = await tx.updateMember(
        input.tenantId,
        input.personId,
        sanitizePatch(input.patch, current.firstName, current.lastName),
      );
      if (updated === null) throw new NotFoundError("Membre introuvable.");
      await tx.appendAuditEvent(
        memberAudit(
          input,
          this.ids.generate(),
          input.personId,
          "member.updated",
          {
            changed: true,
          },
        ),
      );
      return visibleMemberDetail(input.actor, input.tenantId, updated);
    });
  }

  async transferMember(input: TransferMemberInput): Promise<MemberDetailView> {
    if (input.startsAt > new Date(Date.now() + 1000 * 60 * 5)) {
      throw new ValidationError(
        "La date d'effet ne peut pas être future.",
        "MEMBERSHIP_START_FUTURE",
      );
    }
    return this.repository.transaction(async (tx) => {
      const current = await tx.findMemberDetail(input.tenantId, input.personId);
      if (current === null) throw new NotFoundError("Membre introuvable.");
      assertCanReadMember(input.actor, current, "member.transfer");
      const target = await tx.findOrganization(
        input.tenantId,
        input.organizationId,
      );
      assertTerritorialTarget(target);
      assertScopePermission(input.actor, "member.transfer", target);
      const active = await tx.findActiveMembershipForUpdate(
        input.tenantId,
        input.personId,
      );
      if (active !== null) {
        if (input.startsAt <= active.startsAt) {
          throw new ValidationError(
            "La date de transfert doit être postérieure au rattachement actuel.",
            "MEMBERSHIP_TRANSFER_DATE_INVALID",
          );
        }
        await tx.endMembership(input.tenantId, active.id, input.startsAt);
        await tx.appendAuditEvent(
          memberAudit(
            input,
            this.ids.generate(),
            active.id,
            "membership.ended",
            {
              person_id: input.personId,
              organization_id: active.organizationId,
            },
          ),
        );
      }
      await tx.createMembership({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        personId: input.personId,
        organizationId: target.id,
        status: "ACTIVE",
        startsAt: input.startsAt,
        endsAt: null,
        branch: clean(input.branch),
      } satisfies Omit<Membership, "createdAt" | "updatedAt">);
      await tx.appendAuditEvent(
        memberAudit(
          input,
          this.ids.generate(),
          input.personId,
          "membership.transferred",
          {
            organization_id: target.id,
          },
        ),
      );
      const updated = await tx.findMemberDetail(input.tenantId, input.personId);
      if (updated === null) throw new NotFoundError("Membre introuvable.");
      return visibleMemberDetail(input.actor, input.tenantId, updated);
    });
  }

  async listMemberships(
    input: ReadMemberInput,
  ): Promise<readonly Membership[]> {
    const detail = await this.getMember(input);
    return detail.memberships;
  }

  async aggregateMembers(
    actor: ActorContext,
    tenantId: string,
    organization: MemberOrganizationRef,
  ): Promise<MemberAggregateView> {
    assertScopePermission(actor, "member.read", organization);
    return this.repository.transaction((tx) =>
      tx.aggregateMembers(tenantId, [organization.path]),
    );
  }
}

function readableScopePaths(
  actor: ActorContext,
  tenantId: string,
  permission: PermissionCode,
): string[] {
  return actor.assignments
    .filter(
      (assignment) =>
        assignment.tenantId === tenantId &&
        assignment.scopePath !== null &&
        assignment.permissions.includes(permission) &&
        assignment.roleCode !== "PLATFORM_ADMIN" &&
        isRoleAssignmentActive(assignment, new Date()),
    )
    .map((assignment) => assignment.scopePath as string);
}

function assertCanReadMember(
  actor: ActorContext,
  detail: MemberDetailView,
  permission: PermissionCode,
): void {
  if (detail.currentOrganization === null) {
    if (
      actor.assignments.some(
        (assignment) =>
          assignment.tenantId === detail.tenantId &&
          assignment.scopeType === "REGION" &&
          assignment.scopePath !== null &&
          assignment.permissions.includes(permission) &&
          assignment.roleCode !== "PLATFORM_ADMIN" &&
          isRoleAssignmentActive(assignment, new Date()),
      )
    )
      return;
    throw new ValidationError("Permission denied.", "AUTHZ_DENIED", 403);
  }
  assertScopePermission(actor, permission, detail.currentOrganization);
}

function canReadSensitive(
  actor: ActorContext,
  tenantId: string,
  organization: MemberOrganizationRef | null,
): boolean {
  if (organization === null) {
    return hasRegionalPermission(actor, tenantId, "member.read_sensitive");
  }
  return hasScopePermission(actor, "member.read_sensitive", organization);
}

function hasRegionalPermission(
  actor: ActorContext,
  tenantId: string,
  permission: PermissionCode,
): boolean {
  return actor.assignments.some(
    (assignment) =>
      assignment.tenantId === tenantId &&
      assignment.scopeType === "REGION" &&
      assignment.scopePath !== null &&
      assignment.permissions.includes(permission) &&
      assignment.roleCode !== "PLATFORM_ADMIN" &&
      isRoleAssignmentActive(assignment, new Date()),
  );
}

function visibleMemberDetail(
  actor: ActorContext,
  tenantId: string,
  detail: MemberDetailView,
): MemberDetailView {
  const scopePaths = readableScopePaths(actor, tenantId, "member.read");
  const memberships = detail.memberships.filter((membership) => {
    if (scopePaths.some((path) => path === `/${tenantId}/`)) return true;
    const organizationPath = membership.organizationPath;
    return (
      organizationPath !== undefined &&
      scopePaths.some((path) => organizationPath.startsWith(path))
    );
  });
  const activeAppointments = detail.activeAppointments.filter((appointment) =>
    scopePaths.some((path) => appointment.scopePath.startsWith(path)),
  );
  const scoped = {
    ...detail,
    memberships,
    activeAppointments,
    primaryAppointment: activeAppointments[0]
      ? {
          title: activeAppointments[0].title,
          scopeName: activeAppointments[0].scopeName,
        }
      : null,
  };
  return canReadSensitive(actor, tenantId, detail.currentOrganization)
    ? scoped
    : redactSensitive(scoped);
}

function assertScopePermission(
  actor: ActorContext,
  permission: PermissionCode,
  organization: MemberOrganizationRef,
): void {
  if (!hasScopePermission(actor, permission, organization)) {
    throw new ValidationError("Permission denied.", "AUTHZ_DENIED", 403);
  }
}

function hasScopePermission(
  actor: ActorContext,
  permission: PermissionCode,
  organization: MemberOrganizationRef,
): boolean {
  return actor.assignments.some(
    (assignment) =>
      assignment.tenantId === organization.tenantId &&
      assignment.scopePath !== null &&
      organization.path.startsWith(assignment.scopePath) &&
      assignment.permissions.includes(permission) &&
      assignment.roleCode !== "PLATFORM_ADMIN" &&
      isRoleAssignmentActive(assignment, new Date()),
  );
}

function assertTerritorialTarget(
  organization: MemberOrganizationRef | null,
): asserts organization is MemberOrganizationRef {
  if (organization === null) throw new NotFoundError("Structure introuvable.");
  if (!isTerritorialMembershipOrganizationType(organization.type)) {
    throw new ValidationError(
      "Structure incompatible pour un rattachement.",
      "MEMBERSHIP_ORG_TYPE_INVALID",
    );
  }
}

function validateDates(
  birthDate: Date | null | undefined,
  startsAt?: Date,
  joinedScoutingAt?: Date | null,
): void {
  const now = new Date(Date.now() + 1000 * 60 * 5);
  if (birthDate !== undefined && birthDate !== null && birthDate > now) {
    throw new ValidationError(
      "La date de naissance ne peut pas être future.",
      "BIRTH_DATE_FUTURE",
    );
  }
  if (startsAt !== undefined && startsAt > now) {
    throw new ValidationError(
      "La date de rattachement ne peut pas être future.",
      "MEMBERSHIP_START_FUTURE",
    );
  }
  if (
    joinedScoutingAt !== undefined &&
    joinedScoutingAt !== null &&
    joinedScoutingAt > now
  ) {
    throw new ValidationError(
      "La date d'entrée ne peut pas être future.",
      "JOINED_SCOUTING_FUTURE",
    );
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizePatch(
  patch: UpdateMemberRecord,
  currentFirstName: string,
  currentLastName: string,
): UpdateMemberRecord {
  const profile = patch.profile;
  const firstName = patch.firstName?.trim();
  const lastName = patch.lastName?.trim();
  return {
    ...patch,
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(firstName !== undefined || lastName !== undefined
      ? {
          displayName: displayNameFor(
            firstName ?? currentFirstName,
            lastName ?? currentLastName,
          ),
        }
      : {}),
    ...(profile
      ? {
          profile: {
            ...profile,
            birthPlace: clean(profile.birthPlace),
            primaryPhone: clean(profile.primaryPhone),
            secondaryPhone: clean(profile.secondaryPhone),
            email: clean(profile.email)?.toLowerCase() ?? null,
            guardianName: clean(profile.guardianName),
            guardianPhone: clean(profile.guardianPhone),
            guardianRelationship: clean(profile.guardianRelationship),
            insuranceNumber: clean(profile.insuranceNumber),
            administrativeNotes: clean(profile.administrativeNotes),
          },
        }
      : {}),
  };
}

function redactSensitive(detail: MemberDetailView): MemberDetailView {
  return {
    ...detail,
    birthDate: null,
    birthPlace: null,
    primaryPhone: null,
    secondaryPhone: null,
    email: null,
    guardianName: null,
    guardianPhone: null,
    guardianRelationship: null,
    insuranceNumber: null,
    insuranceYear: null,
    administrativeNotes: null,
  };
}

function memberAudit(
  input: RequestContext & {
    readonly actor: ActorContext;
    readonly tenantId: string;
  },
  auditId: string,
  resourceId: string,
  action: MemberAuditAction,
  metadata: Record<string, unknown>,
) {
  return createAuditEvent({
    id: auditId,
    tenantId: input.tenantId,
    resourceType: action.startsWith("membership.") ? "membership" : "member",
    resourceId,
    action,
    metadata,
    requestId: input.requestId,
    auditActor: { kind: "USER", id: input.actor.account.id },
  });
}

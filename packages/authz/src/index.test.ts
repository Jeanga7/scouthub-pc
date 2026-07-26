import { describe, expect, it } from "vitest";
import type { Account, PermissionCode, RoleCode } from "@scouthub/domain";
import {
  canAccessOrganization,
  canAccessProject,
  canAccessScopedAction,
  validateSlice2RoleScope,
  type Actor
} from ".";

const now = new Date("2026-07-25T12:00:00.000Z");
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const regionAPath = `/${tenantA}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/`;
const groupAPath = `${regionAPath}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3/`;
const unitAPath = `${groupAPath}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4/`;
const groupBPath = `${regionAPath}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5/`;
const districtAPath = `${regionAPath}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6/`;
const districtBPath = `${regionAPath}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7/`;
const districtChildPath = `${districtAPath}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8/`;

describe("organization policy engine", () => {
  it.each([
    ["RegionalAdmin Region A -> Region A", actor("REGIONAL_ADMIN", regionAPath), regionAPath, "allow"],
    ["RegionalAdmin Region A -> child Group A", actor("REGIONAL_ADMIN", regionAPath), groupAPath, "allow"],
    ["RegionalAdmin Region A -> tenant B", actor("REGIONAL_ADMIN", regionAPath), `/${tenantB}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/`, "deny"],
    ["GroupAdmin Group A -> Group A", actor("GROUP_ADMIN", groupAPath), groupAPath, "allow"],
    ["GroupAdmin Group A -> Unit child", actor("GROUP_ADMIN", groupAPath), unitAPath, "allow"],
    ["GroupAdmin Group A -> Group B", actor("GROUP_ADMIN", groupAPath), groupBPath, "deny"],
    ["DistrictReviewer District A -> child Group", actor("DISTRICT_REVIEWER", districtAPath), districtChildPath, "allow"],
    ["DistrictReviewer District A -> District B", actor("DISTRICT_REVIEWER", districtAPath), districtBPath, "deny"],
    ["Programme reviewer read allowed", actor("REGIONAL_PROGRAMME_REVIEWER", regionAPath), regionAPath, "allow"],
    ["PlatformAdmin business read denied", actor("PLATFORM_ADMIN", null), regionAPath, "deny"],
    ["expired assignment denied", actor("REGIONAL_ADMIN", regionAPath, { endsAt: new Date("2026-01-01T00:00:00.000Z") }), regionAPath, "deny"],
    ["revoked assignment denied", actor("REGIONAL_ADMIN", regionAPath, { revokedAt: new Date("2026-01-01T00:00:00.000Z") }), regionAPath, "deny"],
    ["future assignment denied", actor("REGIONAL_ADMIN", regionAPath, { startsAt: new Date("2027-01-01T00:00:00.000Z") }), regionAPath, "deny"],
    ["suspended account denied", actor("REGIONAL_ADMIN", regionAPath, { accountStatus: "SUSPENDED" }), regionAPath, "deny"]
  ])("%s", (_label, testActor, path, expected) => {
    const decision = canAccessOrganization(
      testActor,
      "organization.read",
      {
        tenantId: path.includes(tenantB) ? tenantB : tenantA,
        organizationId: path.split("/").filter(Boolean).at(-1) ?? tenantA,
        path
      },
      { now }
    );

    expect(decision.effect).toBe(expected);
  });

  it("denies role.assign to RegionalProgrammeReviewer", () => {
    const decision = canAccessOrganization(
      actor("REGIONAL_PROGRAMME_REVIEWER", regionAPath),
      "role.assign",
      {
        tenantId: tenantA,
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        path: regionAPath
      },
      { now }
    );

    expect(decision.effect).toBe("deny");
  });

  it("does not combine permission from one assignment with scope from another", () => {
    const regionBPath = `/${tenantA}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9/`;
    const baseActor = actor("REGIONAL_ADMIN", regionAPath);
    const baseAssignment = baseActor.assignments[0];
    if (baseAssignment === undefined) {
      throw new Error("Expected base assignment.");
    }
    const testActor: Actor = {
      ...baseActor,
      assignments: [
        ...baseActor.assignments,
        {
          ...baseAssignment,
          id: "readonly-region-b",
          roleCode: "REGIONAL_COMMS",
          permissions: ["organization.read"],
          scopeOrgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
          scopePath: regionBPath
        }
      ]
    };

    const decision = canAccessScopedAction(
      testActor,
      "role.assign",
      {
        tenantId: tenantA,
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
        path: regionBPath
      },
      { now }
    );

    expect(decision.effect).toBe("deny");
  });

  it.each([
    ["UNIT_LEADER", "UNIT", true],
    ["GROUP_ADMIN", "GROUP", true],
    ["DISTRICT_REVIEWER", "DISTRICT", true],
    ["REGIONAL_PROGRAMME_REVIEWER", "REGION", true],
    ["REGIONAL_ADMIN", "REGION", true],
    ["REGIONAL_COMMS", "REGION", true],
    ["DATA_OFFICER", "REGION", true],
    ["GROUP_ADMIN", "REGION", false],
    ["UNIT_LEADER", "GROUP", false],
    ["DISTRICT_REVIEWER", "GROUP", false],
    ["REGIONAL_ADMIN", "GROUP", false],
    ["PROJECT_CONTRIBUTOR", "GROUP", false],
    ["PLATFORM_ADMIN", "REGION", false],
    ["NATIONAL_OBSERVER", "NSO", false]
  ] as const)("validates Slice 2 role scope matrix: %s on %s", (roleCode, organizationType, ok) => {
    const result = validateSlice2RoleScope({ roleCode, organizationType });
    expect("ok" in result).toBe(ok);
  });

  it.each([
    ["GroupAdmin Group A -> Project Group A", actor("GROUP_ADMIN", groupAPath, { permissions: ["project.read", "project.update"] }), groupAPath, "project.update", "allow"],
    ["GroupAdmin Group A -> Project Unit child", actor("GROUP_ADMIN", groupAPath, { permissions: ["project.read", "project.update"] }), unitAPath, "project.update", "allow"],
    ["GroupAdmin Group A -> Project Group B", actor("GROUP_ADMIN", groupAPath, { permissions: ["project.read", "project.update"] }), groupBPath, "project.update", "deny"],
    ["UnitLeader Unit A -> Project Unit A", actor("UNIT_LEADER", unitAPath, { permissions: ["project.read", "project.update"] }), unitAPath, "project.update", "allow"],
    ["UnitLeader Unit A -> sibling Unit B", actor("UNIT_LEADER", unitAPath, { permissions: ["project.read", "project.update"] }), `${groupAPath}aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9/`, "project.update", "deny"],
    ["Regional reviewer read allowed", actor("REGIONAL_PROGRAMME_REVIEWER", regionAPath, { permissions: ["project.read"] }), groupAPath, "project.read", "allow"],
    ["Regional reviewer update denied", actor("REGIONAL_PROGRAMME_REVIEWER", regionAPath, { permissions: ["project.read"] }), groupAPath, "project.update", "deny"],
    ["RegionalAdmin update denied", actor("REGIONAL_ADMIN", regionAPath, { permissions: ["project.read"] }), groupAPath, "project.update", "deny"],
    ["PlatformAdmin project read denied", actor("PLATFORM_ADMIN", null, { permissions: ["project.read"] }), groupAPath, "project.read", "deny"]
  ] as const)("%s", (_label, testActor, ownerPath, action, expected) => {
    const decision = canAccessProject(
      testActor,
      action,
      {
        projectId: "project-a",
        tenantId: tenantA,
        ownerOrganizationId: ownerPath.split("/").filter(Boolean).at(-1) ?? tenantA,
        ownerOrganizationPath: ownerPath,
        status: "DRAFT",
        createdByAccountId: "creator"
      },
      { now }
    );

    expect(decision.effect).toBe(expected);
  });

  it("does not give permanent access to a creator without an active scoped assignment", () => {
    const decision = canAccessProject(
      actor("GROUP_ADMIN", groupAPath, {
        permissions: ["project.update"],
        endsAt: new Date("2026-01-01T00:00:00.000Z")
      }),
      "project.update",
      {
        projectId: "project-a",
        tenantId: tenantA,
        ownerOrganizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
        ownerOrganizationPath: groupAPath,
        status: "DRAFT",
        createdByAccountId: "acct"
      },
      { now }
    );

    expect(decision.effect).toBe("deny");
  });
});

function actor(
  roleCode: RoleCode,
  scopePath: string | null,
  options: {
    readonly startsAt?: Date;
    readonly endsAt?: Date | null;
    readonly revokedAt?: Date | null;
    readonly accountStatus?: Account["status"];
    readonly permissions?: PermissionCode[];
  } = {}
): Actor {
  const permission: PermissionCode[] =
    options.permissions ?? (roleCode === "REGIONAL_ADMIN" ? ["organization.read", "role.assign"] : ["organization.read"]);
  return {
    account: {
      id: "acct",
      externalIdentityId: "user_test",
      primaryEmail: "user@example.test",
      status: options.accountStatus ?? "ACTIVE",
      lastLoginAt: null,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now
    },
    assuranceLevel: "standard",
    assignments: [
      {
        id: "assignment",
        tenantId: tenantA,
        accountId: "acct",
        roleId: "role",
        roleCode,
        permissions: permission,
        scopeType: scopePath === null ? "GLOBAL_TECH" : "REGION",
        scopeOrgId: scopePath === null ? null : scopePath.split("/").filter(Boolean).at(-1) ?? null,
        scopePath,
        startsAt: options.startsAt ?? new Date("2026-01-01T00:00:00.000Z"),
        endsAt: options.endsAt ?? null,
        grantedByAccountId: null,
        grantedAt: new Date("2026-01-01T00:00:00.000Z"),
        revokedAt: options.revokedAt ?? null
      }
    ]
  };
}

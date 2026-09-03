import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { OrganizationUseCases, type IdGenerator } from "@scouthub/application";
import { createPgOrganizationRepository } from "./organization-repository";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";

const ids = {
  alpha: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  beta: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  region: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  districtA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  districtB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  groupX: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  unitOne: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
  groupDirect: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
  betaRegion: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  betaDistrict: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
  betaGroup: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3"
};

describe("PgOrganizationRepository", () => {
  beforeEach(async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query("TRUNCATE audit_event, organization RESTART IDENTITY CASCADE");
    } finally {
      await pool.end();
    }
  });

  it("creates and queries a multi-tenant hierarchy with optional districts", async () => {
    const useCases = createUseCases([
      ids.alpha,
      ids.region,
      ids.districtA,
      ids.groupX,
      ids.unitOne,
      ids.groupDirect,
      ids.beta,
      ids.betaRegion,
      ids.betaDistrict,
      ids.betaGroup
    ]);

    const alpha = await useCases.createTenantRoot({ name: "Alpha", code: "alpha" });
    expect(alpha.id).toBe(alpha.tenantId);
    expect(alpha.status).toBe("DRAFT");

    const region = await useCases.createOrganization({
      tenantId: alpha.tenantId,
      parentId: alpha.id,
      type: "REGION",
      name: "Region Horizon",
      code: "horizon"
    });
    const district = await useCases.createOrganization({
      tenantId: alpha.tenantId,
      parentId: region.id,
      type: "DISTRICT",
      name: "District Nord",
      code: "nord"
    });
    const groupUnderDistrict = await useCases.createOrganization({
      tenantId: alpha.tenantId,
      parentId: district.id,
      type: "GROUP",
      name: "Groupe Baobab",
      code: "baobab"
    });
    const unit = await useCases.createOrganization({
      tenantId: alpha.tenantId,
      parentId: groupUnderDistrict.id,
      type: "UNIT",
      name: "Unite Louveteaux",
      code: "louveteaux"
    });
    const groupUnderRegion = await useCases.createOrganization({
      tenantId: alpha.tenantId,
      parentId: district.id,
      type: "GROUP",
      name: "Groupe Teranga",
      code: "teranga"
    });

    const beta = await useCases.createTenantRoot({ name: "Beta", code: "alpha" });
    const betaRegion = await useCases.createOrganization({
      tenantId: beta.tenantId,
      parentId: beta.id,
      type: "REGION",
      name: "Region Rivage",
      code: "horizon"
    });
    const betaDistrict = await useCases.createOrganization({
      tenantId: beta.tenantId,
      parentId: betaRegion.id,
      type: "DISTRICT",
      name: "District Rivage",
      code: "district-rivage"
    });
    await useCases.createOrganization({
      tenantId: beta.tenantId,
      parentId: betaDistrict.id,
      type: "GROUP",
      name: "Groupe Nebuleuse",
      code: "nebuleuse"
    });

    await expect(
      useCases.createOrganization({
        tenantId: alpha.tenantId,
        parentId: region.id,
        type: "GROUP",
        name: "Duplicate",
        code: "baobab"
      })
    ).rejects.toThrow();

    await expect(useCases.getOrganization(beta.tenantId, region.id)).rejects.toThrow();
    await expect(
      useCases.createOrganization({
        tenantId: beta.tenantId,
        parentId: region.id,
        type: "GROUP",
        name: "Cross Tenant",
        code: "cross"
      })
    ).rejects.toThrow("Parent organization not found");

    const alphaChildren = await useCases.listChildren(alpha.tenantId, region.id);
    expect(alphaChildren.map((item) => item.id)).toEqual([district.id]);
    const ancestors = await useCases.listAncestors(alpha.tenantId, unit.id);
    expect(ancestors.map((item) => item.id)).toEqual([
      alpha.id,
      region.id,
      district.id,
      groupUnderDistrict.id
    ]);
    const descendants = await useCases.listDescendants(alpha.tenantId, region.id);
    expect(descendants.map((item) => item.id)).toContain(unit.id);
    expect(groupUnderRegion.depth).toBe(3);
    expect(unit.path).toBe(
      `/${alpha.id}/${region.id}/${district.id}/${groupUnderDistrict.id}/${unit.id}/`
    );
  });

  it("moves a subtree atomically and recalculates paths and depths", async () => {
    const useCases = await createAlphaTree();
    const before = await useCases.getOrganization(ids.alpha, ids.groupX);
    const unitBefore = await useCases.getOrganization(ids.alpha, ids.unitOne);
    const moved = await useCases.moveOrganization({
      tenantId: ids.alpha,
      organizationId: ids.groupX,
      newParentId: ids.districtB,
      expectedVersion: before.version
    });
    const movedUnit = await useCases.getOrganization(ids.alpha, ids.unitOne);

    expect(moved.parentId).toBe(ids.districtB);
    expect(moved.path).toBe(`/${ids.alpha}/${ids.region}/${ids.districtB}/${ids.groupX}/`);
    expect(movedUnit.path).toBe(
      `/${ids.alpha}/${ids.region}/${ids.districtB}/${ids.groupX}/${ids.unitOne}/`
    );
    expect(movedUnit.name).toBe(unitBefore.name);
    expect(movedUnit.code).toBe(unitBefore.code);
    expect(movedUnit.depth).toBe(4);
    expect(moved.version).toBe(before.version + 1);
    expect(movedUnit.version).toBe(unitBefore.version + 1);

    await expect(
      useCases.moveOrganization({
        tenantId: ids.alpha,
        organizationId: ids.groupX,
        newParentId: ids.unitOne,
        expectedVersion: moved.version
      })
    ).rejects.toThrow("own descendant");
    await expect(
      useCases.moveOrganization({
        tenantId: ids.alpha,
        organizationId: ids.alpha,
        newParentId: ids.region,
        expectedVersion: 1
      })
    ).rejects.toThrow("NSO root");
  });

  it("rejects hierarchy violations, stale versions and writes append-only audit", async () => {
    const useCases = await createAlphaTree();

    await expect(
      useCases.createOrganization({
        tenantId: ids.alpha,
        parentId: ids.region,
        type: "UNIT",
        name: "Invalid Unit",
        code: "invalid-unit"
      })
    ).rejects.toThrow("Invalid parent/child");

    await expect(
      useCases.createOrganization({
        tenantId: ids.alpha,
        parentId: ids.region,
        type: "TEAM",
        name: "Reserved Team",
        code: "team"
      })
    ).rejects.toThrow("TEAM");

    const group = await useCases.getOrganization(ids.alpha, ids.groupX);
    await useCases.updateOrganization({
      tenantId: ids.alpha,
      organizationId: group.id,
      expectedVersion: group.version,
      name: "Groupe X Renomme",
      code: group.code,
      locationLabel: "Local fictif"
    });
    await expect(
      useCases.activateOrganization({
        tenantId: ids.alpha,
        organizationId: group.id,
        expectedVersion: group.version
      })
    ).rejects.toThrow("conflict");

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const auditCount = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_event"
      );
      expect(auditCount.rows[0]?.count).toBeGreaterThan(0);
      await expect(
        pool.query("UPDATE audit_event SET action = action")
      ).rejects.toThrow("append-only");
      await expect(pool.query("DELETE FROM audit_event")).rejects.toThrow("append-only");

      const beforeRollback = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_event"
      );
      const repository = createPgOrganizationRepository(databaseUrl);
      await expect(
        repository.transaction(async (transaction) => {
          await transaction.appendAuditEvent({
            id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
            tenantId: ids.alpha,
            resourceType: "organization",
            resourceId: ids.groupX,
            action: "organization.updated",
            actorKind: "SYSTEM",
            actorId: null,
            requestId: "req_rollback",
            metadata: { changed_fields: ["name"] },
            occurredAt: new Date()
          });
          throw new Error("rollback");
        })
      ).rejects.toThrow("rollback");
      const afterRollback = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_event"
      );
      expect(afterRollback.rows[0]?.count).toBe(beforeRollback.rows[0]?.count);
    } finally {
      await pool.end();
    }
  });

  it("applies PATCH semantics and maps duplicate code updates to conflicts", async () => {
    const useCases = await createAlphaTree();
    const group = await useCases.getOrganization(ids.alpha, ids.groupX);
    const groupDirect = await useCases.getOrganization(ids.alpha, ids.groupDirect);
    const activeFrom = new Date("2026-01-01T00:00:00.000Z");
    const activeUntil = new Date("2026-12-31T00:00:00.000Z");
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

    try {
      const auditBeforeEmptyPatch = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_event"
      );
      await expect(
        useCases.updateOrganization({
          tenantId: ids.alpha,
          organizationId: group.id,
          expectedVersion: group.version
        })
      ).rejects.toThrow("At least one mutable organization field");
      const afterEmptyPatch = await useCases.getOrganization(ids.alpha, ids.groupX);
      const auditAfterEmptyPatch = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_event"
      );

      expect(afterEmptyPatch.version).toBe(group.version);
      expect(afterEmptyPatch.updatedAt.toISOString()).toBe(group.updatedAt.toISOString());
      expect(auditAfterEmptyPatch.rows[0]?.count).toBe(
        auditBeforeEmptyPatch.rows[0]?.count
      );
    } finally {
      await pool.end();
    }

    const withDetails = await useCases.updateOrganization({
      tenantId: ids.alpha,
      organizationId: group.id,
      expectedVersion: group.version,
      locationLabel: "Local fictif",
      activeFrom,
      activeUntil
    });
    const renamed = await useCases.updateOrganization({
      tenantId: ids.alpha,
      organizationId: group.id,
      expectedVersion: withDetails.version,
      name: "Group X nouveau nom"
    });

    expect(renamed.name).toBe("Group X nouveau nom");
    expect(renamed.code).toBe(group.code);
    expect(renamed.locationLabel).toBe("Local fictif");
    expect(renamed.activeFrom?.toISOString()).toBe(activeFrom.toISOString());
    expect(renamed.activeUntil?.toISOString()).toBe(activeUntil.toISOString());

    const cleared = await useCases.updateOrganization({
      tenantId: ids.alpha,
      organizationId: group.id,
      expectedVersion: renamed.version,
      locationLabel: null
    });
    expect(cleared.locationLabel).toBeNull();
    expect(cleared.activeFrom?.toISOString()).toBe(activeFrom.toISOString());

    await expect(
      useCases.updateOrganization({
        tenantId: ids.alpha,
        organizationId: group.id,
        expectedVersion: cleared.version,
        code: groupDirect.code
      })
    ).rejects.toThrow("already exists");
  });
});

function createUseCases(idValues: string[]): OrganizationUseCases {
  let auditCounter = 1;
  let callCounter = 0;
  const generator: IdGenerator = {
    generate() {
      callCounter += 1;
      if (callCounter % 2 === 1 && idValues.length > 0) {
        const next = idValues.shift();
        if (next !== undefined) {
          return next;
        }
      }

      const suffix = String(auditCounter).padStart(12, "0");
      auditCounter += 1;
      return `cccccccc-cccc-4ccc-8ccc-${suffix}`;
    }
  };
  return new OrganizationUseCases(createPgOrganizationRepository(databaseUrl), generator);
}

async function createAlphaTree(): Promise<OrganizationUseCases> {
  const useCases = createUseCases([
    ids.alpha,
    ids.region,
    ids.districtA,
    ids.districtB,
    ids.groupX,
    ids.unitOne,
    ids.groupDirect
  ]);
  await useCases.createTenantRoot({ name: "Alpha", code: "alpha" });
  await useCases.createOrganization({
    tenantId: ids.alpha,
    parentId: ids.alpha,
    type: "REGION",
    name: "Region Horizon",
    code: "horizon"
  });
  await useCases.createOrganization({
    tenantId: ids.alpha,
    parentId: ids.region,
    type: "DISTRICT",
    name: "District A",
    code: "district-a"
  });
  await useCases.createOrganization({
    tenantId: ids.alpha,
    parentId: ids.region,
    type: "DISTRICT",
    name: "District B",
    code: "district-b"
  });
  await useCases.createOrganization({
    tenantId: ids.alpha,
    parentId: ids.districtA,
    type: "GROUP",
    name: "Group X",
    code: "group-x"
  });
  await useCases.createOrganization({
    tenantId: ids.alpha,
    parentId: ids.groupX,
    type: "UNIT",
    name: "Unit One",
    code: "unit-one"
  });
  await useCases.createOrganization({
    tenantId: ids.alpha,
    parentId: ids.districtA,
    type: "GROUP",
    name: "Group Direct",
    code: "group-direct"
  });

  return useCases;
}

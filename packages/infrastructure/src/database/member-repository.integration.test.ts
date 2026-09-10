import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActorContext, MemberUseCases } from "@scouthub/application";
import { MemberUseCases as MemberUseCasesImpl } from "@scouthub/application";
import { createPgMemberRepository } from "../index";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";
const tenantId = "c1000000-0000-4000-8000-000000000001";
const regionId = "c1000000-0000-4000-8000-000000000002";
const districtId = "c1000000-0000-4000-8000-000000000003";
const groupAId = "c1000000-0000-4000-8000-000000000004";
const groupBId = "c1000000-0000-4000-8000-000000000005";
const unitId = "c1000000-0000-4000-8000-000000000006";
const personId = "c1000000-0000-4000-8000-000000000007";
const accountId = "c1000000-0000-4000-8000-000000000008";
const districtBId = "c1000000-0000-4000-8000-000000000009";
const pool = new pg.Pool({ connectionString: databaseUrl, max: 25 });
const repository = createPgMemberRepository(databaseUrl);
const memberUseCases: MemberUseCases = new MemberUseCasesImpl(repository, {
  generate: () => crypto.randomUUID(),
});

function actor(
  scopeType: "REGION" | "DISTRICT" | "GROUP",
  scopeOrgId: string,
  permissions = [
    "member.read",
    "member.read_sensitive",
    "member.create",
    "member.update",
    "member.transfer",
  ],
): ActorContext {
  const paths = {
    REGION: `/${tenantId}/${regionId}/`,
    DISTRICT: `/${tenantId}/${regionId}/${districtId}/`,
    GROUP: `/${tenantId}/${regionId}/${districtId}/${groupAId}/`,
  };
  return {
    account: { id: accountId },
    assignments: [
      {
        tenantId,
        accountId,
        roleCode:
          scopeType === "REGION"
            ? "REGIONAL_ADMIN"
            : scopeType === "DISTRICT"
              ? "DISTRICT_REVIEWER"
              : "GROUP_ADMIN",
        scopeType,
        scopeOrgId,
        scopePath: paths[scopeType],
        permissions,
        startsAt: new Date(0),
        endsAt: null,
        revokedAt: null,
      },
    ],
  } as unknown as ActorContext;
}

beforeAll(async () => {
  await pool.query(
    "INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth) VALUES ($1,$1,NULL,'NSO','Test members tenant','TEST-MEMBERS','ACTIVE',$2,0) ON CONFLICT (id) DO NOTHING",
    [tenantId, `/${tenantId}/`],
  );
  await pool.query(
    "INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth) VALUES ($1,$2,$2,'REGION','Test members region','TEST-REGION','ACTIVE',$3,1) ON CONFLICT (id) DO NOTHING",
    [regionId, tenantId, `/${tenantId}/${regionId}/`],
  );
  await pool.query(
    "INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth) VALUES ($1,$2,$3,'DISTRICT','Test members district','TEST-DISTRICT','ACTIVE',$4,2) ON CONFLICT (id) DO NOTHING",
    [districtId, tenantId, regionId, `/${tenantId}/${regionId}/${districtId}/`],
  );
  await pool.query(
    "INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth) VALUES ($1,$2,$3,'GROUP','Test members group A','TEST-GROUP-A','ACTIVE',$4,3) ON CONFLICT (id) DO NOTHING",
    [
      groupAId,
      tenantId,
      districtId,
      `/${tenantId}/${regionId}/${districtId}/${groupAId}/`,
    ],
  );
  await pool.query(
    "INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth) VALUES ($1,$2,$2,'DISTRICT','Test members district B','TEST-DISTRICT-B','ACTIVE',$3,2) ON CONFLICT (id) DO NOTHING",
    [districtBId, tenantId, `/${tenantId}/${regionId}/${districtBId}/`],
  );
  await pool.query(
    "INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth) VALUES ($1,$2,$3,'GROUP','Test members group B','TEST-GROUP-B','ACTIVE',$4,3) ON CONFLICT (id) DO NOTHING",
    [
      groupBId,
      tenantId,
      districtBId,
      `/${tenantId}/${regionId}/${districtBId}/${groupBId}/`,
    ],
  );
  await pool.query(
    "INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth) VALUES ($1,$2,$3,'UNIT','Test members unit','TEST-UNIT','ACTIVE',$4,4) ON CONFLICT (id) DO NOTHING",
    [
      unitId,
      tenantId,
      groupAId,
      `/${tenantId}/${regionId}/${districtId}/${groupAId}/${unitId}/`,
    ],
  );
  await pool.query(
    "INSERT INTO person (id, tenant_id, first_name, last_name, display_name) VALUES ($1,$2,'Test','Member','Test Member') ON CONFLICT (id) DO NOTHING",
    [personId, tenantId],
  );
});

afterAll(async () => {
  await pool.query("DELETE FROM scout_profile WHERE tenant_id = $1", [
    tenantId,
  ]);
  await pool.query("DELETE FROM membership WHERE tenant_id = $1", [tenantId]);
  await pool.query("DELETE FROM person WHERE tenant_id = $1", [tenantId]);
  await pool.query("DELETE FROM organization WHERE tenant_id = $1", [tenantId]);
  await pool.end();
});

describe("member registry PostgreSQL invariants", () => {
  it("creates 20 complete members concurrently through the real use case", async () => {
    const created = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        memberUseCases.createMember({
          actor: actor("REGION", regionId),
          requestId: crypto.randomUUID(),
          tenantId,
          firstName: `Concurrent${index}`,
          lastName: "Member",
          birthDate: new Date("2010-01-15T00:00:00Z"),
          birthPlace: null,
          sex: index % 2 ? "MALE" : "FEMALE",
          primaryPhone: null,
          secondaryPhone: null,
          email: null,
          guardianName: null,
          guardianPhone: null,
          guardianRelationship: null,
          organizationId: unitId,
          startsAt: new Date("2024-01-15T00:00:00Z"),
          branch: "Verte",
          insuranceNumber: null,
          insuranceYear: null,
          joinedScoutingAt: null,
          administrativeNotes: null,
        }),
      ),
    );
    expect(created).toHaveLength(20);
    expect(new Set(created.map((item) => item.scoutId)).size).toBe(20);
    expect(created.every((item) => /^PC-[0-9]{6,}$/.test(item.scoutId))).toBe(
      true,
    );
    const counts = await pool.query<{
      people: string;
      profiles: string;
      memberships: string;
    }>(
      "SELECT (SELECT count(*) FROM person WHERE tenant_id = $1 AND display_name LIKE 'Concurrent%') AS people, (SELECT count(*) FROM scout_profile sp JOIN person p ON p.id = sp.person_id WHERE p.tenant_id = $1 AND p.display_name LIKE 'Concurrent%') AS profiles, (SELECT count(*) FROM membership m JOIN person p ON p.id = m.person_id WHERE p.tenant_id = $1 AND p.display_name LIKE 'Concurrent%' AND m.status = 'ACTIVE') AS memberships",
      [tenantId],
    );
    expect(counts.rows[0]).toEqual({
      people: "20",
      profiles: "20",
      memberships: "20",
    });
  });

  it("allows only regional scope to read an orphan member", async () => {
    await pool.query(
      "INSERT INTO scout_profile (tenant_id, person_id, scout_id) VALUES ($1,$2,'PC-900001') ON CONFLICT (person_id) DO NOTHING",
      [tenantId, personId],
    );
    await expect(
      memberUseCases.getMember({
        actor: actor("GROUP", groupAId),
        tenantId,
        personId,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      memberUseCases.getMember({
        actor: actor("DISTRICT", districtId),
        tenantId,
        personId,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      memberUseCases.getMember({
        actor: actor("REGION", regionId),
        tenantId,
        personId,
      }),
    ).resolves.toMatchObject({ personId });
  });

  it("redacts sensitive fields from create results without read_sensitive", async () => {
    const created = await memberUseCases.createMember({
      actor: actor("GROUP", groupAId, ["member.read", "member.create"]),
      requestId: crypto.randomUUID(),
      tenantId,
      firstName: "Redacted",
      lastName: "Create",
      birthDate: new Date("2012-04-05T00:00:00Z"),
      birthPlace: "Dakar",
      sex: "FEMALE",
      primaryPhone: "+221700000001",
      secondaryPhone: "+221700000002",
      email: "redacted@example.test",
      guardianName: "Fictional Guardian",
      guardianPhone: "+221700000003",
      guardianRelationship: "Parent",
      organizationId: groupAId,
      startsAt: new Date("2024-01-01T00:00:00Z"),
      branch: "Verte",
      insuranceNumber: "INS-001",
      insuranceYear: 2024,
      joinedScoutingAt: new Date("2024-01-01T00:00:00Z"),
      administrativeNotes: "Restricted note",
    });
    expect(created).toMatchObject({
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
    });
    await expect(
      memberUseCases.getMember({
        actor: actor("REGION", regionId),
        tenantId,
        personId: created.personId,
      }),
    ).resolves.toMatchObject({
      birthDate: new Date("2012-04-05T00:00:00Z"),
      primaryPhone: "+221700000001",
      guardianName: "Fictional Guardian",
      insuranceNumber: "INS-001",
      administrativeNotes: "Restricted note",
    });
  });

  it("scopes membership history to the actor organization paths", async () => {
    const member = await memberUseCases.createMember({
      actor: actor("REGION", regionId),
      requestId: crypto.randomUUID(),
      tenantId,
      firstName: "History",
      lastName: "Scoped",
      birthDate: null,
      birthPlace: null,
      sex: "UNSPECIFIED",
      primaryPhone: null,
      secondaryPhone: null,
      email: null,
      guardianName: null,
      guardianPhone: null,
      guardianRelationship: null,
      organizationId: groupBId,
      startsAt: new Date("2024-01-01T00:00:00Z"),
      branch: null,
      insuranceNumber: null,
      insuranceYear: null,
      joinedScoutingAt: null,
      administrativeNotes: null,
    });
    await memberUseCases.transferMember({
      actor: actor("REGION", regionId),
      requestId: crypto.randomUUID(),
      tenantId,
      personId: member.personId,
      organizationId: groupAId,
      startsAt: new Date("2025-01-01T00:00:00Z"),
      branch: null,
    });
    const groupView = await memberUseCases.getMember({
      actor: actor("GROUP", groupAId),
      tenantId,
      personId: member.personId,
    });
    expect(groupView.currentOrganization?.id).toBe(groupAId);
    expect(groupView.memberships.map((item) => item.organizationId)).toEqual([
      groupAId,
    ]);
    const regionalView = await memberUseCases.getMember({
      actor: actor("REGION", regionId),
      tenantId,
      personId: member.personId,
    });
    expect(regionalView.memberships.map((item) => item.organizationId)).toEqual(
      expect.arrayContaining([groupAId, groupBId]),
    );
  });

  it("does not combine regional read with a separate group sensitive grant for orphans", async () => {
    const orphanId = crypto.randomUUID();
    const orphanProfileId = crypto.randomUUID();
    await pool.query(
      "INSERT INTO person (id, tenant_id, first_name, last_name, display_name, birth_date) VALUES ($1,$2,'Orphan','Mixed','Orphan Mixed','2010-01-01')",
      [orphanId, tenantId],
    );
    await pool.query(
      "INSERT INTO scout_profile (id, tenant_id, person_id, scout_id, primary_phone, email) VALUES ($1,$2,$3,'PC-900002','+221700000004','mixed@example.test')",
      [orphanProfileId, tenantId, orphanId],
    );
    const mixedActor = {
      ...actor("REGION", regionId, ["member.read"]),
      assignments: [
        ...actor("REGION", regionId, ["member.read"]).assignments,
        ...actor("GROUP", groupAId, ["member.read_sensitive"]).assignments,
      ],
    } as ActorContext;
    await expect(
      memberUseCases.getMember({
        actor: mixedActor,
        tenantId,
        personId: orphanId,
      }),
    ).resolves.toMatchObject({
      birthDate: null,
      primaryPhone: null,
      email: null,
    });
    await expect(
      memberUseCases.getMember({
        actor: actor("REGION", regionId),
        tenantId,
        personId: orphanId,
      }),
    ).resolves.toMatchObject({ primaryPhone: "+221700000004" });
  });

  it("rejects NSO targets and keeps sibling organization filters scoped", async () => {
    await expect(
      memberUseCases.createMember({
        actor: actor("REGION", regionId),
        requestId: crypto.randomUUID(),
        tenantId,
        firstName: "Invalid",
        lastName: "Target",
        birthDate: null,
        birthPlace: null,
        sex: "UNSPECIFIED",
        primaryPhone: null,
        secondaryPhone: null,
        email: null,
        guardianName: null,
        guardianPhone: null,
        guardianRelationship: null,
        organizationId: tenantId,
        startsAt: new Date("2024-01-01T00:00:00Z"),
        branch: null,
        insuranceNumber: null,
        insuranceYear: null,
        joinedScoutingAt: null,
        administrativeNotes: null,
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_ORG_TYPE_INVALID" });
    const sibling = await memberUseCases.createMember({
      actor: actor("REGION", regionId),
      requestId: crypto.randomUUID(),
      tenantId,
      firstName: "Sibling",
      lastName: "Member",
      birthDate: null,
      birthPlace: null,
      sex: "UNSPECIFIED",
      primaryPhone: null,
      secondaryPhone: null,
      email: null,
      guardianName: null,
      guardianPhone: null,
      guardianRelationship: null,
      organizationId: groupBId,
      startsAt: new Date("2024-01-01T00:00:00Z"),
      branch: null,
      insuranceNumber: null,
      insuranceYear: null,
      joinedScoutingAt: null,
      administrativeNotes: null,
    });
    const visible = await memberUseCases.listMembers({
      actor: actor("GROUP", groupAId),
      tenantId,
      query: null,
      filterOrganizationIds: [groupBId],
      branch: null,
      status: null,
      page: 1,
      pageSize: 25,
    });
    expect(
      visible.items.some((item) => item.personId === sibling.personId),
    ).toBe(false);
  });

  it("rejects transfer dates at or before the active membership start", async () => {
    const member = await memberUseCases.createMember({
      actor: actor("REGION", regionId),
      requestId: crypto.randomUUID(),
      tenantId,
      firstName: "Transfer",
      lastName: "Date",
      birthDate: null,
      birthPlace: null,
      sex: "UNSPECIFIED",
      primaryPhone: null,
      secondaryPhone: null,
      email: null,
      guardianName: null,
      guardianPhone: null,
      guardianRelationship: null,
      organizationId: groupAId,
      startsAt: new Date("2024-01-01T00:00:00Z"),
      branch: null,
      insuranceNumber: null,
      insuranceYear: null,
      joinedScoutingAt: null,
      administrativeNotes: null,
    });
    for (const startsAt of [
      new Date("2023-12-31T00:00:00Z"),
      new Date("2024-01-01T00:00:00Z"),
    ]) {
      await expect(
        memberUseCases.transferMember({
          actor: actor("REGION", regionId),
          requestId: crypto.randomUUID(),
          tenantId,
          personId: member.personId,
          organizationId: groupBId,
          startsAt,
          branch: null,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_TRANSFER_DATE_INVALID" });
    }
    await expect(
      memberUseCases.transferMember({
        actor: actor("REGION", regionId),
        requestId: crypto.randomUUID(),
        tenantId,
        personId: member.personId,
        organizationId: groupBId,
        startsAt: new Date("2024-02-01T00:00:00Z"),
        branch: null,
      }),
    ).resolves.toBeDefined();
    const history = await pool.query<{
      status: string;
      starts_at: Date;
      ends_at: Date | null;
    }>(
      "SELECT status, starts_at, ends_at FROM membership WHERE person_id = $1 ORDER BY starts_at",
      [member.personId],
    );
    expect(history.rows).toHaveLength(2);
    expect(history.rows[0]!.ends_at?.toISOString()).toBe(
      history.rows[1]!.starts_at.toISOString(),
    );
  });

  it("serializes concurrent transfers without two active memberships or lost history", async () => {
    const member = await memberUseCases.createMember({
      actor: actor("REGION", regionId),
      requestId: crypto.randomUUID(),
      tenantId,
      firstName: "Concurrent",
      lastName: "Transfer",
      birthDate: null,
      birthPlace: null,
      sex: "UNSPECIFIED",
      primaryPhone: null,
      secondaryPhone: null,
      email: null,
      guardianName: null,
      guardianPhone: null,
      guardianRelationship: null,
      organizationId: groupAId,
      startsAt: new Date("2024-01-01T00:00:00Z"),
      branch: null,
      insuranceNumber: null,
      insuranceYear: null,
      joinedScoutingAt: null,
      administrativeNotes: null,
    });
    const results = await Promise.allSettled([
      memberUseCases.transferMember({
        actor: actor("REGION", regionId),
        requestId: crypto.randomUUID(),
        tenantId,
        personId: member.personId,
        organizationId: groupBId,
        startsAt: new Date("2024-02-01T00:00:00Z"),
        branch: null,
      }),
      memberUseCases.transferMember({
        actor: actor("REGION", regionId),
        requestId: crypto.randomUUID(),
        tenantId,
        personId: member.personId,
        organizationId: unitId,
        startsAt: new Date("2024-03-01T00:00:00Z"),
        branch: "Verte",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled").length,
    ).toBeGreaterThanOrEqual(1);
    const history = await pool.query<{ active: string; overlaps: string }>(
      "SELECT (SELECT count(*) FROM membership WHERE person_id = $1 AND status = 'ACTIVE') AS active, (SELECT count(*) FROM membership a JOIN membership b ON a.person_id = b.person_id AND a.id < b.id AND a.starts_at < COALESCE(b.ends_at, 'infinity'::timestamptz) AND b.starts_at < COALESCE(a.ends_at, 'infinity'::timestamptz) WHERE a.person_id = $1) AS overlaps",
      [member.personId],
    );
    expect(history.rows[0]).toEqual({ active: "1", overlaps: "0" });
  });

  it("allocates unique Scout IDs under concurrent sequence access", async () => {
    const values = await Promise.all(
      Array.from({ length: 20 }, () =>
        pool.query<{ value: string }>(
          "SELECT nextval('scout_profile_scout_id_seq')::text AS value",
        ),
      ),
    );
    expect(
      new Set(values.map((result) => result.rows[0]?.value ?? "")).size,
    ).toBe(20);
  });

  it("keeps at most one active membership under concurrent inserts", async () => {
    const insert = () =>
      pool.query(
        "INSERT INTO membership (tenant_id, person_id, organization_id, starts_at) VALUES ($1,$2,$3,now())",
        [tenantId, personId, unitId],
      );
    const results = await Promise.allSettled([insert(), insert()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
});

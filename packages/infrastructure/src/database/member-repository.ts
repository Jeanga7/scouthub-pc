import "pg-cloudflare";
import pg from "pg";
import type { QueryResultRow } from "pg";
import {
  normalizeScoutId,
  type Membership,
  type Person,
  type ScoutProfileSex,
} from "@scouthub/domain";
import type {
  CreateMemberRecord,
  MemberAggregateView,
  MemberDetailView,
  MemberListInput,
  MemberListPage,
  MemberOrganizationRef,
  MemberRepository,
  MemberSummaryView,
  MemberTransaction,
  UpdateMemberRecord,
} from "@scouthub/application";
import type { AuditEventInput } from "@scouthub/application";
import { ConflictError } from "@scouthub/application";

interface Queryable {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: TRow[]; readonly rowCount?: number | null }>;
}

type OrgRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  name: string;
  type: MemberOrganizationRef["type"];
  path: string;
};

type SummaryRow = QueryResultRow & {
  person_id: string;
  tenant_id: string;
  scout_id: string;
  display_name: string;
  status: Person["status"];
  organization_id: string | null;
  organization_name: string | null;
  organization_type: MemberOrganizationRef["type"] | null;
  organization_path: string | null;
  branch: string | null;
  appointment_title: string | null;
  appointment_scope_name: string | null;
  total_count?: string;
};

type DetailRow = SummaryRow & {
  first_name: string;
  last_name: string;
  birth_date: Date | null;
  birth_place: string | null;
  sex: ScoutProfileSex;
  primary_phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_relationship: string | null;
  insurance_number: string | null;
  insurance_year: number | null;
  joined_scouting_at: Date | null;
  administrative_notes: string | null;
  account_linked: boolean;
};

type MembershipRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  person_id: string;
  organization_id: string;
  organization_name: string | null;
  organization_type: MemberOrganizationRef["type"] | null;
  organization_path: string | null;
  status: Membership["status"];
  starts_at: Date;
  ends_at: Date | null;
  branch: string | null;
  created_at: Date;
  updated_at: Date;
};

export function createPgMemberRepository(
  databaseUrl: string,
): MemberRepository {
  return new PgMemberRepository(databaseUrl);
}

class PgMemberRepository implements MemberRepository {
  constructor(private readonly databaseUrl: string) {}

  async transaction<TResult>(
    handler: (transaction: MemberTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const pool = new pg.Pool({ connectionString: this.databaseUrl, max: 1 });
    try {
      await pool.query("BEGIN");
      const result = await handler(new PgMemberTransaction(pool));
      await pool.query("COMMIT");
      return result;
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    } finally {
      await pool.end();
    }
  }
}

class PgMemberTransaction implements MemberTransaction {
  constructor(private readonly db: Queryable) {}

  async findOrganization(tenantId: string, organizationId: string) {
    const result = await this.db.query<OrgRow>(
      `SELECT id, tenant_id, name, type, path
       FROM organization
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, organizationId],
    );
    return result.rows[0] ? mapOrg(result.rows[0]) : null;
  }

  async listOrganizations(
    tenantId: string,
    organizationIds: readonly string[],
  ) {
    if (organizationIds.length === 0) return [];
    const result = await this.db.query<OrgRow>(
      `SELECT id, tenant_id, name, type, path
       FROM organization
       WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [tenantId, organizationIds],
    );
    return result.rows.map(mapOrg);
  }

  async listMembers(input: MemberListInput): Promise<MemberListPage> {
    const clauses = [
      "p.tenant_id = $1",
      "sp.id IS NOT NULL",
      input.scopePaths.length ? "o.path LIKE ANY($2::text[])" : "FALSE",
    ];
    const values: unknown[] = [
      input.tenantId,
      input.scopePaths.map((path) => `${path}%`),
    ];
    if (input.query) {
      values.push(`%${input.query.trim()}%`);
      values.push(input.query.trim().toUpperCase());
      clauses.push(
        `(p.display_name ILIKE $${values.length - 1} OR sp.scout_id = $${values.length})`,
      );
    }
    if (input.filterOrganizationIds.length) {
      values.push(input.filterOrganizationIds);
      clauses.push(`EXISTS (
        SELECT 1
        FROM organization filter_org
        WHERE filter_org.tenant_id = $1
          AND filter_org.id = ANY($${values.length}::uuid[])
          AND o.path LIKE filter_org.path || '%'
      )`);
    }
    if (input.branch) {
      values.push(input.branch);
      clauses.push(`m.branch = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      clauses.push(`p.status = $${values.length}`);
    }
    values.push(input.limit, input.offset);
    const result = await this.db.query<SummaryRow>(
      `${memberSummarySql}
       WHERE ${clauses.join(" AND ")}
       ORDER BY sp.scout_id ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const total = Number(result.rows[0]?.total_count ?? 0);
    return { items: result.rows.map(mapSummary), total };
  }

  async findMemberDetail(tenantId: string, personId: string) {
    const result = await this.db.query<DetailRow>(
      `${memberDetailSql}
       WHERE p.tenant_id = $1 AND p.id = $2
       LIMIT 1`,
      [tenantId, personId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const [memberships, appointments, ancestors] = await Promise.all([
      this.listMemberships(tenantId, personId),
      this.listActiveAppointments(tenantId, personId),
      row.organization_path
        ? this.listAncestorsByPath(tenantId, row.organization_path)
        : Promise.resolve([]),
    ]);
    return {
      ...mapSummary(row),
      firstName: row.first_name,
      lastName: row.last_name,
      birthDate: row.birth_date,
      birthPlace: row.birth_place,
      sex: row.sex,
      primaryPhone: row.primary_phone,
      secondaryPhone: row.secondary_phone,
      email: row.email,
      guardianName: row.guardian_name,
      guardianPhone: row.guardian_phone,
      guardianRelationship: row.guardian_relationship,
      insuranceNumber: row.insurance_number,
      insuranceYear: row.insurance_year,
      joinedScoutingAt: row.joined_scouting_at,
      administrativeNotes: row.administrative_notes,
      accountLinked: row.account_linked,
      memberships,
      activeAppointments: appointments,
      ancestors,
    } satisfies MemberDetailView;
  }

  async createMember(input: CreateMemberRecord) {
    const scoutId = await this.nextScoutId();
    await this.db.query(
      `INSERT INTO person (id, tenant_id, first_name, last_name, display_name, birth_date, classification)
       VALUES ($1, $2, $3, $4, $5, $6, 'P2')`,
      [
        input.person.id,
        input.person.tenantId,
        input.person.firstName,
        input.person.lastName,
        input.person.displayName,
        input.person.birthDate,
      ],
    );
    await this.db.query(
      `INSERT INTO scout_profile (
        id, tenant_id, person_id, scout_id, sex, birth_place, primary_phone,
        secondary_phone, email, guardian_name, guardian_phone,
        guardian_relationship, insurance_number, insurance_year,
        joined_scouting_at, administrative_notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        input.profile.id,
        input.profile.tenantId,
        input.profile.personId,
        scoutId,
        input.profile.sex,
        input.profile.birthPlace,
        input.profile.primaryPhone,
        input.profile.secondaryPhone,
        input.profile.email,
        input.profile.guardianName,
        input.profile.guardianPhone,
        input.profile.guardianRelationship,
        input.profile.insuranceNumber,
        input.profile.insuranceYear,
        input.profile.joinedScoutingAt,
        input.profile.administrativeNotes,
      ],
    );
    await this.createMembership(input.membership);
    const detail = await this.findMemberDetail(
      input.person.tenantId,
      input.person.id,
    );
    if (detail === null) throw new Error("Created member cannot be loaded.");
    return detail;
  }

  async updateMember(
    tenantId: string,
    personId: string,
    patch: UpdateMemberRecord,
  ) {
    const personSets: string[] = [];
    const personValues: unknown[] = [tenantId, personId];
    for (const [column, value] of [
      ["first_name", patch.firstName],
      ["last_name", patch.lastName],
      ["display_name", patch.displayName],
      ["birth_date", patch.birthDate],
      ["status", patch.status],
    ] as const) {
      if (value !== undefined) {
        personValues.push(value);
        personSets.push(`${column} = $${personValues.length}`);
      }
    }
    if (personSets.length) {
      await this.db.query(
        `UPDATE person SET ${personSets.join(", ")}, updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        personValues,
      );
    }
    if (patch.profile) {
      const sets: string[] = [];
      const values: unknown[] = [tenantId, personId];
      const profileColumns = {
        sex: "sex",
        birthPlace: "birth_place",
        primaryPhone: "primary_phone",
        secondaryPhone: "secondary_phone",
        email: "email",
        guardianName: "guardian_name",
        guardianPhone: "guardian_phone",
        guardianRelationship: "guardian_relationship",
        insuranceNumber: "insurance_number",
        insuranceYear: "insurance_year",
        joinedScoutingAt: "joined_scouting_at",
        administrativeNotes: "administrative_notes",
      } as const;
      for (const key of Object.keys(
        profileColumns,
      ) as (keyof typeof profileColumns)[]) {
        const value = patch.profile[key];
        if (value !== undefined) {
          values.push(value);
          sets.push(`${profileColumns[key]} = $${values.length}`);
        }
      }
      if (sets.length) {
        await this.db.query(
          `UPDATE scout_profile SET ${sets.join(", ")}, updated_at = now()
           WHERE tenant_id = $1 AND person_id = $2`,
          values,
        );
      }
    }
    return this.findMemberDetail(tenantId, personId);
  }

  async findActiveMembershipForUpdate(tenantId: string, personId: string) {
    const result = await this.db.query<MembershipRow>(
      `SELECT m.*, o.name AS organization_name, o.type AS organization_type, o.path AS organization_path
       FROM membership m
       JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
       WHERE m.tenant_id = $1 AND m.person_id = $2 AND m.status = 'ACTIVE'
       FOR UPDATE OF m`,
      [tenantId, personId],
    );
    return result.rows[0] ? mapMembership(result.rows[0]) : null;
  }

  async endMembership(tenantId: string, membershipId: string, endsAt: Date) {
    const result = await this.db.query<MembershipRow>(
      `UPDATE membership
       SET status = 'ENDED', ends_at = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING *`,
      [tenantId, membershipId, endsAt],
    );
    return result.rows[0] ? mapMembership(result.rows[0]) : null;
  }

  async createMembership(input: Omit<Membership, "createdAt" | "updatedAt">) {
    try {
      const result = await this.db.query<MembershipRow>(
        `INSERT INTO membership (id, tenant_id, person_id, organization_id, status, starts_at, ends_at, branch)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          input.id,
          input.tenantId,
          input.personId,
          input.organizationId,
          input.status,
          input.startsAt,
          input.endsAt,
          input.branch,
        ],
      );
      if (!result.rows[0])
        throw new Error("Membership insert returned no row.");
      return mapMembership(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "Un rattachement actif existe déjà pour cette personne.",
        );
      }
      throw error;
    }
  }

  async aggregateMembers(tenantId: string, scopePaths: readonly string[]) {
    const scopeLikes = scopePaths.map((path) => `${path}%`);
    const total = await this.db.query<QueryResultRow & { count: string }>(
      `SELECT count(*)::text AS count
       FROM person p
       JOIN scout_profile sp ON sp.person_id = p.id AND sp.tenant_id = p.tenant_id
       JOIN membership m ON m.person_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'ACTIVE'
       JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
       WHERE p.tenant_id = $1 AND p.status = 'ACTIVE' AND o.path LIKE ANY($2::text[])`,
      [tenantId, scopeLikes],
    );
    const bySex = await this.db.query<
      QueryResultRow & { sex: ScoutProfileSex; count: string }
    >(
      `SELECT sp.sex, count(*)::text AS count
       FROM scout_profile sp
       JOIN person p ON p.id = sp.person_id AND p.tenant_id = sp.tenant_id
       JOIN membership m ON m.person_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'ACTIVE'
       JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
       WHERE p.tenant_id = $1 AND p.status = 'ACTIVE' AND o.path LIKE ANY($2::text[])
       GROUP BY sp.sex`,
      [tenantId, scopeLikes],
    );
    const byBranch = await this.db.query<
      QueryResultRow & { branch: string; count: string }
    >(
      `SELECT COALESCE(m.branch, 'Non renseignée') AS branch, count(*)::text AS count
       FROM person p
       JOIN scout_profile sp ON sp.person_id = p.id AND sp.tenant_id = p.tenant_id
       JOIN membership m ON m.person_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'ACTIVE'
       JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
       WHERE p.tenant_id = $1 AND p.status = 'ACTIVE' AND o.path LIKE ANY($2::text[])
       GROUP BY branch ORDER BY branch`,
      [tenantId, scopeLikes],
    );
    const byOrganizationType = await this.db.query<
      QueryResultRow & { type: MemberOrganizationRef["type"]; count: string }
    >(
      `SELECT o.type, count(*)::text AS count
       FROM person p
       JOIN scout_profile sp ON sp.person_id = p.id AND sp.tenant_id = p.tenant_id
       JOIN membership m ON m.person_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'ACTIVE'
       JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
       WHERE p.tenant_id = $1 AND p.status = 'ACTIVE' AND o.path LIKE ANY($2::text[])
       GROUP BY o.type`,
      [tenantId, scopeLikes],
    );
    return {
      totalActive: Number(total.rows[0]?.count ?? 0),
      bySex: bySex.rows.map((row) => ({
        sex: row.sex,
        count: Number(row.count),
      })),
      byBranch: byBranch.rows.map((row) => ({
        branch: row.branch,
        count: Number(row.count),
      })),
      byOrganizationType: byOrganizationType.rows.map((row) => ({
        type: row.type,
        count: Number(row.count),
      })),
    } satisfies MemberAggregateView;
  }

  async appendAuditEvent(input: AuditEventInput): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_event (id, tenant_id, resource_type, resource_id, action, actor_kind, actor_id, request_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.id,
        input.tenantId,
        input.resourceType,
        input.resourceId,
        input.action,
        input.actorKind,
        input.actorId,
        input.requestId ?? null,
        input.metadata,
      ],
    );
  }

  private async nextScoutId(): Promise<string> {
    const result = await this.db.query<QueryResultRow & { value: string }>(
      "SELECT nextval('scout_profile_scout_id_seq')::text AS value",
    );
    return normalizeScoutId(Number(result.rows[0]?.value));
  }

  private async listMemberships(tenantId: string, personId: string) {
    const result = await this.db.query<MembershipRow>(
      `SELECT m.*, o.name AS organization_name, o.type AS organization_type, o.path AS organization_path
       FROM membership m
       JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
       WHERE m.tenant_id = $1 AND m.person_id = $2
       ORDER BY m.starts_at DESC, m.created_at DESC`,
      [tenantId, personId],
    );
    return result.rows.map(mapMembership);
  }

  private async listActiveAppointments(tenantId: string, personId: string) {
    const result = await this.db.query<
      QueryResultRow & {
        id: string;
        title: string;
        scope_name: string;
        scope_path: string;
        starts_at: Date;
        ends_at: Date | null;
      }
    >(
      `SELECT a.id, pos.title, org.name AS scope_name, org.path AS scope_path, a.starts_at, a.ends_at
       FROM appointment a
       JOIN position pos ON pos.id = a.position_id AND pos.tenant_id = a.tenant_id
       JOIN organization org ON org.id = a.scope_org_id AND org.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.person_id = $2 AND a.status = 'ACTIVE'
       ORDER BY a.starts_at DESC`,
      [tenantId, personId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      scopeName: row.scope_name,
      scopePath: row.scope_path,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    }));
  }

  private async listAncestorsByPath(tenantId: string, path: string) {
    const ids = path.split("/").filter(Boolean);
    const result = await this.db.query<OrgRow>(
      `SELECT id, tenant_id, name, type, path
       FROM organization
       WHERE tenant_id = $1 AND id = ANY($2::uuid[])
       ORDER BY depth ASC`,
      [tenantId, ids],
    );
    return result.rows.map(mapOrg);
  }
}

const memberSummarySql = `
  SELECT
    p.id AS person_id,
    p.tenant_id,
    sp.scout_id,
    p.display_name,
    p.status,
    o.id AS organization_id,
    o.name AS organization_name,
    o.type AS organization_type,
    o.path AS organization_path,
    m.branch AS branch,
    primary_appt.title AS appointment_title,
    primary_appt.scope_name AS appointment_scope_name,
    count(*) OVER()::text AS total_count
  FROM person p
  JOIN scout_profile sp ON sp.person_id = p.id AND sp.tenant_id = p.tenant_id
  LEFT JOIN membership m ON m.person_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'ACTIVE'
  LEFT JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
  LEFT JOIN LATERAL (
    SELECT pos.title, org.name AS scope_name
    FROM appointment a
    JOIN position pos ON pos.id = a.position_id AND pos.tenant_id = a.tenant_id
    JOIN organization org ON org.id = a.scope_org_id AND org.tenant_id = a.tenant_id
    WHERE a.tenant_id = p.tenant_id AND a.person_id = p.id AND a.status = 'ACTIVE'
    ORDER BY a.starts_at DESC
    LIMIT 1
  ) primary_appt ON TRUE
`;

const memberDetailSql = `
  SELECT
    p.id AS person_id,
    p.tenant_id,
    sp.scout_id,
    p.display_name,
    p.status,
    p.first_name,
    p.last_name,
    p.birth_date,
    sp.birth_place,
    sp.sex,
    sp.primary_phone,
    sp.secondary_phone,
    sp.email,
    sp.guardian_name,
    sp.guardian_phone,
    sp.guardian_relationship,
    sp.insurance_number,
    sp.insurance_year,
    sp.joined_scouting_at,
    sp.administrative_notes,
    EXISTS (
      SELECT 1 FROM account_person_link apl
      JOIN account acc ON acc.id = apl.account_id
      WHERE apl.tenant_id = p.tenant_id AND apl.person_id = p.id AND acc.status = 'ACTIVE'
    ) AS account_linked,
    o.id AS organization_id,
    o.name AS organization_name,
    o.type AS organization_type,
    o.path AS organization_path,
    m.branch AS branch,
    primary_appt.title AS appointment_title,
    primary_appt.scope_name AS appointment_scope_name
  FROM person p
  JOIN scout_profile sp ON sp.person_id = p.id AND sp.tenant_id = p.tenant_id
  LEFT JOIN membership m ON m.person_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'ACTIVE'
  LEFT JOIN organization o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
  LEFT JOIN LATERAL (
    SELECT pos.title, org.name AS scope_name
    FROM appointment a
    JOIN position pos ON pos.id = a.position_id AND pos.tenant_id = a.tenant_id
    JOIN organization org ON org.id = a.scope_org_id AND org.tenant_id = a.tenant_id
    WHERE a.tenant_id = p.tenant_id AND a.person_id = p.id AND a.status = 'ACTIVE'
    ORDER BY a.starts_at DESC
    LIMIT 1
  ) primary_appt ON TRUE
`;

function mapOrg(row: OrgRow): MemberOrganizationRef {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    type: row.type,
    path: row.path,
  };
}

function mapSummary(row: SummaryRow): MemberSummaryView {
  return {
    personId: row.person_id,
    tenantId: row.tenant_id,
    scoutId: row.scout_id,
    displayName: row.display_name,
    status: row.status,
    currentOrganization:
      row.organization_id &&
      row.organization_name &&
      row.organization_type &&
      row.organization_path
        ? {
            id: row.organization_id,
            tenantId: row.tenant_id,
            name: row.organization_name,
            type: row.organization_type,
            path: row.organization_path,
          }
        : null,
    branch: row.branch,
    primaryAppointment:
      row.appointment_title && row.appointment_scope_name
        ? {
            title: row.appointment_title,
            scopeName: row.appointment_scope_name,
          }
        : null,
  };
}

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    personId: row.person_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name ?? undefined,
    organizationType: row.organization_type ?? undefined,
    organizationPath: row.organization_path ?? undefined,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    branch: row.branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

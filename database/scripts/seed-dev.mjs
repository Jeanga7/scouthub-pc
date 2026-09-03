import pg from "pg";

const alpha = {
  nso: "11111111-1111-4111-8111-111111111111",
  region: "11111111-1111-4111-8111-111111111112",
  district: "11111111-1111-4111-8111-111111111113",
  groupBaobab: "11111111-1111-4111-8111-111111111114",
  unitLouveteaux: "11111111-1111-4111-8111-111111111115",
  unitEclaireurs: "11111111-1111-4111-8111-111111111116",
  groupTeranga: "11111111-1111-4111-8111-111111111117",
  unitRoutiers: "11111111-1111-4111-8111-111111111118"
};

const beta = {
  nso: "22222222-2222-4222-8222-222222222221",
  region: "22222222-2222-4222-8222-222222222222",
  groupNebuleuse: "22222222-2222-4222-8222-222222222223"
};

const demo = {
  adminAccount: "71000000-0000-4000-8000-000000000001",
  ownerAccount: "71000000-0000-4000-8000-000000000002",
  reviewerAccount: "71000000-0000-4000-8000-000000000003",
  adminPerson: "72000000-0000-4000-8000-000000000001",
  ownerPerson: "72000000-0000-4000-8000-000000000002",
  reviewerPerson: "72000000-0000-4000-8000-000000000003",
  adminAssignment: "73000000-0000-4000-8000-000000000001",
  ownerAssignment: "73000000-0000-4000-8000-000000000002",
  reviewerAssignment: "73000000-0000-4000-8000-000000000003",
  draftProject: "74000000-0000-4000-8000-000000000001",
  reviewProject: "74000000-0000-4000-8000-000000000002",
  approvedProject: "74000000-0000-4000-8000-000000000003",
  pendingReview: "75000000-0000-4000-8000-000000000001",
  approvedReview: "75000000-0000-4000-8000-000000000002",
  approvedDecision: "75000000-0000-4000-8000-000000000003",
  reviewComment: "76000000-0000-4000-8000-000000000001",
  submittedTransition: "77000000-0000-4000-8000-000000000001",
  approvedTransition: "77000000-0000-4000-8000-000000000002"
};

const rows = [
  [alpha.nso, alpha.nso, null, "NSO", "Federation Scoute Alpha", "ALPHA", `/${alpha.nso}/`, 0],
  [alpha.region, alpha.nso, alpha.nso, "REGION", "Region Horizon", "HORIZON", `/${alpha.nso}/${alpha.region}/`, 1],
  [alpha.district, alpha.nso, alpha.region, "DISTRICT", "District Nord", "NORD", `/${alpha.nso}/${alpha.region}/${alpha.district}/`, 2],
  [alpha.groupBaobab, alpha.nso, alpha.district, "GROUP", "Groupe Baobab", "BAOBAB", `/${alpha.nso}/${alpha.region}/${alpha.district}/${alpha.groupBaobab}/`, 3],
  [alpha.unitLouveteaux, alpha.nso, alpha.groupBaobab, "UNIT", "Unite Louveteaux", "LOUVETEAUX", `/${alpha.nso}/${alpha.region}/${alpha.district}/${alpha.groupBaobab}/${alpha.unitLouveteaux}/`, 4],
  [alpha.unitEclaireurs, alpha.nso, alpha.groupBaobab, "UNIT", "Unite Eclaireurs", "ECLAIREURS", `/${alpha.nso}/${alpha.region}/${alpha.district}/${alpha.groupBaobab}/${alpha.unitEclaireurs}/`, 4],
  [alpha.groupTeranga, alpha.nso, alpha.region, "GROUP", "Groupe Teranga", "TERANGA", `/${alpha.nso}/${alpha.region}/${alpha.groupTeranga}/`, 2],
  [alpha.unitRoutiers, alpha.nso, alpha.groupTeranga, "UNIT", "Unite Routiers", "ROUTIERS", `/${alpha.nso}/${alpha.region}/${alpha.groupTeranga}/${alpha.unitRoutiers}/`, 3],
  [beta.nso, beta.nso, null, "NSO", "Association Scoute Beta", "BETA", `/${beta.nso}/`, 0],
  [beta.region, beta.nso, beta.nso, "REGION", "Region Rivage", "RIVAGE", `/${beta.nso}/${beta.region}/`, 1],
  [beta.groupNebuleuse, beta.nso, beta.region, "GROUP", "Groupe Nebuleuse", "NEBULEUSE", `/${beta.nso}/${beta.region}/${beta.groupNebuleuse}/`, 2]
];

export function resolveSeedConfig(env = process.env) {
  const appEnv = env.APP_ENV;
  if (appEnv !== "local" && appEnv !== "test") {
    throw new Error("db:seed:dev requires explicit APP_ENV=local or APP_ENV=test.");
  }

  const databaseUrl =
    env.DATABASE_URL ??
    "postgres://scouthub:scouthub@localhost:5433/scouthub";
  if (appEnv === "local" && !isLocalDatabaseUrl(databaseUrl)) {
    throw new Error("db:seed:dev refuses non-local DATABASE_URL when APP_ENV=local.");
  }

  return { appEnv, databaseUrl };
}

export function isLocalDatabaseUrl(databaseUrl) {
  const hostname = new URL(databaseUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function seedDevelopmentOrganizations(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  await pool.query("BEGIN");
  try {
    for (const row of rows) {
      await pool.query(
        `
      INSERT INTO organization
        (id, tenant_id, parent_id, type, name, code, status, path, depth)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8)
      ON CONFLICT (id) DO NOTHING
      `,
        row
      );
    }
    await seedDemoPersonas(pool);
    await seedDemoProjects(pool);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

async function seedDemoPersonas(pool) {
  const personas = [
    [demo.adminAccount, "local_demo_regional_admin", "admin.regional@demo.scouthub.test", demo.adminPerson, "Aminata", "Diop", "Aminata Diop", "REGIONAL_ADMIN", "REGION", alpha.region, demo.adminAssignment],
    [demo.ownerAccount, "local_demo_project_owner", "responsable.baobab@demo.scouthub.test", demo.ownerPerson, "Moussa", "Fall", "Moussa Fall", "GROUP_ADMIN", "GROUP", alpha.groupBaobab, demo.ownerAssignment],
    [demo.reviewerAccount, "local_demo_reviewer", "reviewer.programme@demo.scouthub.test", demo.reviewerPerson, "Fatou", "Sarr", "Fatou Sarr", "REGIONAL_PROGRAMME_REVIEWER", "REGION", alpha.region, demo.reviewerAssignment]
  ];
  for (const [accountId, subjectId, email, personId, firstName, lastName, displayName, roleCode, scopeType, scopeOrgId, assignmentId] of personas) {
    await pool.query(`INSERT INTO account (id, external_identity_id, primary_email, status, email_verified_at)
      VALUES ($1, $2, $3, 'ACTIVE', '2026-01-01T00:00:00Z')
      ON CONFLICT (id) DO UPDATE SET external_identity_id = EXCLUDED.external_identity_id, primary_email = EXCLUDED.primary_email, status = 'ACTIVE'`, [accountId, subjectId, email]);
    await pool.query(`INSERT INTO person (id, tenant_id, first_name, last_name, display_name)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`, [personId, alpha.nso, firstName, lastName, displayName]);
    await pool.query(`INSERT INTO account_person_link (account_id, tenant_id, person_id)
      VALUES ($1, $2, $3) ON CONFLICT (account_id, tenant_id) DO NOTHING`, [accountId, alpha.nso, personId]);
    await pool.query(`INSERT INTO role_assignment (id, tenant_id, account_id, role_id, scope_type, scope_org_id, starts_at)
      SELECT $1, $2, $3, id, $4, $5, '2026-01-01T00:00:00Z' FROM role_definition WHERE code = $6
      ON CONFLICT (id) DO NOTHING`, [assignmentId, alpha.nso, accountId, scopeType, scopeOrgId, roleCode]);
  }
}

async function seedDemoProjects(pool) {
  const projects = [
    [demo.draftProject, "PRJ-DEMO00000001", "jardin-partage-baobab", "Jardin partagé du quartier", "DRAFT", 1, "Créer un espace nourricier et éducatif avec les habitants."],
    [demo.reviewProject, "PRJ-DEMO00000002", "plage-propre-petite-cote", "Opération plage propre", "READY_FOR_REVIEW", 2, "Mobilisation citoyenne pour réduire les déchets sur le littoral."],
    [demo.approvedProject, "PRJ-DEMO00000003", "bibliotheque-mobile", "Bibliothèque mobile", "APPROVED_FOR_EXECUTION", 3, "Un accès itinérant à la lecture pour les quartiers éloignés."]
  ];
  for (const [id, code, slug, title, status, version, summary] of projects) {
    await pool.query(`INSERT INTO project (
      id, tenant_id, owner_org_id, code, internal_slug, title, summary, problem_statement,
      diagnostic, project_mode, status, visibility, location_label, planned_start_at,
      planned_end_at, project_lead_person_id, created_by_account_id, version, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PLANNED',$10,'INTERNAL',$11,$12,$13,$14,$15,$16,$17,$17)
    ON CONFLICT (id) DO NOTHING`, [id, alpha.nso, alpha.groupBaobab, code, slug, title, summary, "Un besoin communautaire identifié avec les partenaires locaux.", "Diagnostic participatif fictif réalisé par le groupe.", status, "Petite Côte", "2026-09-15T00:00:00Z", "2026-12-20T00:00:00Z", demo.ownerPerson, demo.ownerAccount, version, `2026-08-0${version}T09:00:00Z`]);
  }
  await pool.query(`INSERT INTO approval_request (id, tenant_id, resource_id, status, submitted_project_version, requested_by_account_id, requested_at)
    VALUES ($1,$2,$3,'PENDING',2,$4,'2026-08-10T10:00:00Z') ON CONFLICT (id) DO NOTHING`, [demo.pendingReview, alpha.nso, demo.reviewProject, demo.ownerAccount]);
  await pool.query(`INSERT INTO approval_request (id, tenant_id, resource_id, status, submitted_project_version, requested_by_account_id, requested_at, resolved_at)
    VALUES ($1,$2,$3,'APPROVED',2,$4,'2026-08-05T10:00:00Z','2026-08-06T10:00:00Z') ON CONFLICT (id) DO NOTHING`, [demo.approvedReview, alpha.nso, demo.approvedProject, demo.ownerAccount]);
  await pool.query(`INSERT INTO approval_decision (id, tenant_id, request_id, reviewer_account_id, decision, decided_at)
    VALUES ($1,$2,$3,$4,'APPROVED','2026-08-06T10:00:00Z') ON CONFLICT (id) DO NOTHING`, [demo.approvedDecision, alpha.nso, demo.approvedReview, demo.reviewerAccount]);
  await pool.query(`INSERT INTO project_comment (id, tenant_id, project_id, approval_request_id, author_account_id, kind, body, created_at)
    VALUES ($1,$2,$3,$4,$5,'GLOBAL','Dossier clair, prêt pour la revue régionale.','2026-08-10T11:00:00Z') ON CONFLICT (id) DO NOTHING`, [demo.reviewComment, alpha.nso, demo.reviewProject, demo.pendingReview, demo.reviewerAccount]);
  await pool.query(`INSERT INTO state_transition (id, tenant_id, entity_id, from_state, to_state, actor_account_id, approval_request_id, occurred_at)
    VALUES ($1,$2,$3,'DRAFT','READY_FOR_REVIEW',$4,$5,'2026-08-10T10:00:00Z') ON CONFLICT (id) DO NOTHING`, [demo.submittedTransition, alpha.nso, demo.reviewProject, demo.ownerAccount, demo.pendingReview]);
  await pool.query(`INSERT INTO state_transition (id, tenant_id, entity_id, from_state, to_state, actor_account_id, approval_request_id, occurred_at)
    VALUES ($1,$2,$3,'IN_REVIEW','APPROVED_FOR_EXECUTION',$4,$5,'2026-08-06T10:00:00Z') ON CONFLICT (id) DO NOTHING`, [demo.approvedTransition, alpha.nso, demo.approvedProject, demo.reviewerAccount, demo.approvedReview]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { databaseUrl } = resolveSeedConfig();
  await seedDevelopmentOrganizations(databaseUrl);
  console.log("Development demo seed applied (organizations, personas, projects and reviews).");
}

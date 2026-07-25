import pg from "pg";

const appEnv = process.env.APP_ENV ?? "local";
if (appEnv !== "local" && appEnv !== "test") {
  throw new Error("db:seed:dev is allowed only for APP_ENV=local or APP_ENV=test.");
}

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

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

try {
  await pool.query("BEGIN");
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
  await pool.query("COMMIT");
  console.log("Development organization seed applied.");
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}

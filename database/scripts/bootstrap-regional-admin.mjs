import { randomUUID } from "node:crypto";
import pg from "pg";

const required = [
  "BOOTSTRAP_CONFIRM",
  "CLERK_USER_ID",
  "BOOTSTRAP_EMAIL",
  "BOOTSTRAP_FIRST_NAME",
  "BOOTSTRAP_LAST_NAME",
  "TENANT_ID",
  "REGION_ORG_ID",
  "DATABASE_URL"
];

export function validateBootstrapEnv(env) {
  const missing = required.filter((key) => env[key] === undefined || env[key] === "");
  if (missing.length > 0) {
    throw new Error(`Missing required bootstrap variables: ${missing.join(", ")}`);
  }
  if (env.BOOTSTRAP_CONFIRM !== "true") {
    throw new Error("BOOTSTRAP_CONFIRM=true is required.");
  }
}

async function main() {
  validateBootstrapEnv(process.env);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const region = await client.query(
      "SELECT id FROM organization WHERE tenant_id = $1 AND id = $2 AND type = 'REGION'",
      [process.env.TENANT_ID, process.env.REGION_ORG_ID]
    );
    if (region.rowCount !== 1) {
      throw new Error("REGION_ORG_ID must be a REGION in TENANT_ID.");
    }
    const existing = await client.query(
      `SELECT count(*)::int AS count
       FROM role_assignment ra
       JOIN role_definition rd ON rd.id = ra.role_id
       JOIN account a ON a.id = ra.account_id
       WHERE ra.tenant_id = $1 AND ra.scope_org_id = $2
         AND rd.code = 'REGIONAL_ADMIN'
         AND a.status = 'ACTIVE'
         AND ra.starts_at <= now()
         AND (ra.ends_at IS NULL OR now() < ra.ends_at)
         AND ra.revoked_at IS NULL`,
      [process.env.TENANT_ID, process.env.REGION_ORG_ID]
    );
    if ((existing.rows[0]?.count ?? 0) > 0) {
      throw new Error("A RegionalAdmin already exists for this region.");
    }

    const role = await client.query(
      "SELECT id FROM role_definition WHERE code = 'REGIONAL_ADMIN'"
    );
    const roleId = role.rows[0]?.id;
    if (typeof roleId !== "string") {
      throw new Error("REGIONAL_ADMIN role is missing. Run migrations first.");
    }

    const accountId = randomUUID();
    const personId = randomUUID();
    const assignmentId = randomUUID();
    const displayName = `${process.env.BOOTSTRAP_FIRST_NAME} ${process.env.BOOTSTRAP_LAST_NAME}`.trim();
    console.log(`Bootstrapping first RegionalAdmin for tenant ${process.env.TENANT_ID}.`);
    await client.query(
      `INSERT INTO person (id, tenant_id, first_name, last_name, display_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        personId,
        process.env.TENANT_ID,
        process.env.BOOTSTRAP_FIRST_NAME,
        process.env.BOOTSTRAP_LAST_NAME,
        displayName
      ]
    );
    await client.query(
      `INSERT INTO account (id, external_identity_id, primary_email, status, email_verified_at)
       VALUES ($1, $2, $3, 'ACTIVE', now())`,
      [accountId, process.env.CLERK_USER_ID, process.env.BOOTSTRAP_EMAIL]
    );
    await client.query(
      "INSERT INTO account_person_link (account_id, tenant_id, person_id) VALUES ($1, $2, $3)",
      [accountId, process.env.TENANT_ID, personId]
    );
    await client.query(
      `INSERT INTO role_assignment (
        id, tenant_id, account_id, role_id, scope_type, scope_org_id,
        starts_at, granted_by_account_id
      )
       VALUES ($1, $2, $3, $4, 'REGION', $5, now(), $3)`,
      [assignmentId, process.env.TENANT_ID, accountId, roleId, process.env.REGION_ORG_ID]
    );
    await client.query(
      `INSERT INTO audit_event (
        tenant_id, resource_type, resource_id, action, actor_kind, metadata
      )
       VALUES ($1, 'account', $2, 'identity.role_assigned', 'SYSTEM', $3::jsonb)`,
      [
        process.env.TENANT_ID,
        accountId,
        JSON.stringify({ role: "REGIONAL_ADMIN", bootstrap: true })
      ]
    );
    await client.query("COMMIT");
    console.log("RegionalAdmin bootstrap complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

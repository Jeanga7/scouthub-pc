import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1
});

const db = drizzle(pool);

await migrate(db, { migrationsFolder: "migrations" });
await pool.end();

console.log("Database migrations applied.");

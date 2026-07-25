import { describe, expect, it } from "vitest";
import { isLocalDatabaseUrl, resolveSeedConfig } from "./seed-dev.mjs";

describe("db:seed:dev guard", () => {
  it("refuses a missing APP_ENV", () => {
    expect(() =>
      resolveSeedConfig({
        DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub"
      })
    ).toThrow("requires explicit APP_ENV");
  });

  it("refuses a remote database in local mode", () => {
    expect(() =>
      resolveSeedConfig({
        APP_ENV: "local",
        DATABASE_URL: "postgres://user:pass@example.neon.tech/scouthub"
      })
    ).toThrow("refuses non-local DATABASE_URL");
  });

  it("accepts manifestly local PostgreSQL URLs", () => {
    expect(isLocalDatabaseUrl("postgres://user:pass@localhost:5433/scouthub")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://user:pass@127.0.0.1:5433/scouthub")).toBe(true);
  });
});

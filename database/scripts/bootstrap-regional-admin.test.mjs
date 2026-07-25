import { describe, expect, it } from "vitest";
import { validateBootstrapEnv } from "./bootstrap-regional-admin.mjs";

const validEnv = {
  BOOTSTRAP_CONFIRM: "true",
  CLERK_USER_ID: "user_test",
  BOOTSTRAP_EMAIL: "admin@example.test",
  BOOTSTRAP_FIRST_NAME: "Awa",
  BOOTSTRAP_LAST_NAME: "Ndiaye",
  TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  REGION_ORG_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub"
};

describe("bootstrap regional admin guard", () => {
  it("requires explicit confirmation", () => {
    expect(() =>
      validateBootstrapEnv({ ...validEnv, BOOTSTRAP_CONFIRM: "false" })
    ).toThrow("BOOTSTRAP_CONFIRM=true");
  });

  it("requires a Clerk subject", () => {
    expect(() =>
      validateBootstrapEnv({ ...validEnv, CLERK_USER_ID: "" })
    ).toThrow("CLERK_USER_ID");
  });
});


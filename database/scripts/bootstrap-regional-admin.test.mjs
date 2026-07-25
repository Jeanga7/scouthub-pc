import { describe, expect, it } from "vitest";
import {
  fetchBootstrapClerkUser,
  validateBootstrapEnv
} from "./bootstrap-regional-admin.mjs";

const validEnv = {
  BOOTSTRAP_CONFIRM: "true",
  CLERK_USER_ID: "user_test",
  BOOTSTRAP_EMAIL: "admin@example.test",
  BOOTSTRAP_FIRST_NAME: "Awa",
  BOOTSTRAP_LAST_NAME: "Ndiaye",
  TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  REGION_ORG_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
  CLERK_SECRET_KEY: "sk_test_example"
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

  it("refuses an unknown Clerk subject", async () => {
    await expect(
      fetchBootstrapClerkUser(validEnv, () => Promise.resolve({
        ok: false,
        json: () => Promise.resolve({})
      }))
    ).rejects.toThrow("not found");
  });

  it("refuses an unverified primary email", async () => {
    await expect(
      fetchBootstrapClerkUser(validEnv, fakeClerkFetch({
        verification: { status: "unverified" },
        email_address: "admin@example.test"
      }))
    ).rejects.toThrow("verified");
  });

  it("refuses an email mismatch", async () => {
    await expect(
      fetchBootstrapClerkUser(validEnv, fakeClerkFetch({
        verification: { status: "verified" },
        email_address: "other@example.test"
      }))
    ).rejects.toThrow("does not match");
  });

  it("returns a verified Clerk subject and normalized email", async () => {
    const user = await fetchBootstrapClerkUser(validEnv, fakeClerkFetch({
      verification: { status: "verified" },
      email_address: "ADMIN@example.test"
    }));

    expect(user).toEqual({
      subjectId: "user_test",
      primaryEmail: "admin@example.test"
    });
  });
});

function fakeClerkFetch(primaryEmail) {
  return () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      id: "user_test",
      primary_email_address_id: "email_primary",
      email_addresses: [
        {
          id: "email_primary",
          ...primaryEmail
        }
      ]
    })
  });
}

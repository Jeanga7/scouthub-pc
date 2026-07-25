import { describe, expect, it, beforeEach } from "vitest";
import {
  tenantQuerySchema,
  updateOrganizationRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
import { assertDevAdmin, handleRouteError } from "./http";
import { resetServerEnvForTests } from "@/env/server";

describe("dev-admin HTTP guard", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://scouthub:scouthub@localhost:5433/scouthub";
    process.env.NEXT_PUBLIC_APP_NAME = "ScoutHub-PC";
    resetServerEnvForTests();
  });

  it.each([
    ["production", "true", 404],
    ["preview", "true", 404],
    ["local", "false", 404],
    ["local", "true", null],
    ["test", "true", null]
  ])("APP_ENV=%s ENABLE_DEV_ADMIN=%s", (appEnv, enabled, expectedStatus) => {
    process.env.APP_ENV = appEnv;
    process.env.ENABLE_DEV_ADMIN = enabled;
    resetServerEnvForTests();

    const response = assertDevAdmin(
      new Request("http://localhost/api/v1/organizations", {
        headers: { "x-request-id": "req_test" }
      })
    );

    expect(response?.status ?? null).toBe(expectedStatus);
  });

  it("requires tenant and valid UUID parameters at the HTTP boundary", () => {
    expect(() => tenantQuerySchema.parse({})).toThrow();
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
  });

  it("accepts partial PATCH payloads and rejects immutable fields", () => {
    const parsed = updateOrganizationRequestSchema.parse({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      expectedVersion: 3,
      name: "Nouveau nom"
    });

    expect(parsed).not.toHaveProperty("locationLabel");
    expect(() =>
      updateOrganizationRequestSchema.parse({
        tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        expectedVersion: 3,
        parentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
      })
    ).toThrow();
  });

  it("returns problem details with request_id and without internal details", async () => {
    const response = handleRouteError(
      new Error("SQL password stack trace"),
      "req_problem"
    );
    const body = (await response.json()) as {
      readonly detail: string;
      readonly request_id: string;
    };

    expect(response.status).toBe(500);
    expect(body.request_id).toBe("req_problem");
    expect(body.detail).not.toContain("SQL");
    expect(body.detail).not.toContain("password");
  });
});

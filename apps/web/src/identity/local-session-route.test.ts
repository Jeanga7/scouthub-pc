import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../../app/api/dev/local-session/route";
import { localDemoPersonas } from "./local-personas";

const originalAppEnv = process.env.APP_ENV;
const originalAppOrigin = process.env.APP_ORIGIN;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  restoreEnvironment("APP_ENV", originalAppEnv);
  restoreEnvironment("APP_ORIGIN", originalAppOrigin);
  restoreEnvironment("DATABASE_URL", originalDatabaseUrl);
});

describe("local persona session route", () => {
  it("sets a hardened opaque cookie only in local", async () => {
    enableLocalIdentity();
    const response = await POST(formRequest(localDemoPersonas[1].selectorId));
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("scouthub_local_persona=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).not.toContain("GROUP_ADMIN");
  });

  it.each(["test", "preview", "production"])("is unavailable in %s", async (appEnv) => {
    enableLocalIdentity();
    process.env.APP_ENV = appEnv;
    expect((await POST(formRequest(localDemoPersonas[0].selectorId))).status).toBe(404);
  });

  it("rejects unknown selectors and ignores claimed authorization fields", async () => {
    enableLocalIdentity();
    const response = await POST(formRequest("unknown", {
      tenantId: "attacker-tenant",
      role: "REGIONAL_ADMIN",
      permissions: "*"
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

function formRequest(persona: string, extra: Record<string, string> = {}): Request {
  const body = new URLSearchParams({ persona, ...extra });
  return new Request("http://localhost:3000/api/dev/local-session", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
}

function enableLocalIdentity(): void {
  process.env.APP_ENV = "local";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.DATABASE_URL = "postgres://scouthub:scouthub@127.0.0.1:5433/scouthub";
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

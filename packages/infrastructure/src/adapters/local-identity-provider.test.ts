import { describe, expect, it } from "vitest";
import { createLocalIdentityProviderAdapter, LOCAL_PERSONA_COOKIE } from "./local-identity-provider";

const persona = {
  selectorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  subjectId: "local_demo_owner"
};

describe("local identity provider", () => {
  it("resolves only an allowlisted opaque selector in local", async () => {
    const provider = createLocalIdentityProviderAdapter({ appEnv: "local", personas: [persona] });
    const session = await provider.getSession(request(persona.selectorId));
    expect(session?.subjectId).toBe(persona.subjectId);
  });

  it.each(["test", "preview", "staging", "production"])("fails closed in %s", async (appEnv) => {
    const provider = createLocalIdentityProviderAdapter({ appEnv, personas: [persona] });
    expect(await provider.getSession(request(persona.selectorId))).toBeNull();
  });

  it("rejects unknown and manipulated cookies", async () => {
    const provider = createLocalIdentityProviderAdapter({ appEnv: "local", personas: [persona] });
    expect(await provider.getSession(request("unknown"))).toBeNull();
    expect(await provider.getSession(request(`${persona.selectorId};role=REGIONAL_ADMIN`))).toBeNull();
    expect(await provider.getSession(request("%E0%A4%A"))).toBeNull();
  });
});

function request(selector: string): Request {
  return new Request("http://localhost:3000/app", {
    headers: { cookie: `${LOCAL_PERSONA_COOKIE}=${encodeURIComponent(selector)}` }
  });
}

import { describe, expect, it, vi } from "vitest";

const clerkServer = vi.hoisted(() => ({
  auth: vi.fn()
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkServer.auth,
  clerkClient: vi.fn(),
  currentUser: vi.fn()
}));

import { createClerkIdentityProvider, mapClerkSession } from "./clerk";

describe("Clerk identity bridge", () => {
  it("maps Clerk iat, exp and fva claims to provider-neutral session fields", () => {
    const standard = mapClerkSession({
      userId: "user_1",
      sessionId: "sess_1",
      claims: { iat: 1_700_000_000, exp: 1_700_003_600, fva: [0, -1] }
    });
    expect(standard?.issuedAt.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(standard?.expiresAt.toISOString()).toBe("2023-11-14T23:13:20.000Z");
    expect(standard?.assuranceLevel).toBe("standard");
    expect(standard?.firstFactorAgeMinutes).toBe(0);
    expect(standard?.secondFactorAgeMinutes).toBe(-1);

    const mfa = mapClerkSession({
      userId: "user_1",
      sessionId: "sess_1",
      claims: { iat: 1_700_000_000, exp: 1_700_003_600, fva: [0, 0] }
    });
    expect(mfa?.assuranceLevel).toBe("mfa");
  });

  it("marks Clerk actor sessions as impersonated", () => {
    expect(
      mapClerkSession({
        userId: "user_1",
        sessionId: "sess_1",
        claims: { iat: 1, exp: 2, act: { sub: "support" } }
      })?.impersonated
    ).toBe(true);
  });

  it("requests only Clerk user session tokens", async () => {
    clerkServer.auth.mockResolvedValueOnce({
      userId: "user_1",
      sessionId: "sess_1",
      sessionClaims: { iat: 1, exp: 2, fva: [0, -1] }
    });
    await createClerkIdentityProvider().getSession(new Request("http://localhost"));
    expect(clerkServer.auth).toHaveBeenCalledWith({ acceptsToken: "session_token" });
  });
});

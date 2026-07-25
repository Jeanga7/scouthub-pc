import { describe, expect, it } from "vitest";
import type { IdentitySession } from "./identity-provider";

describe("IdentitySession", () => {
  it("carries a revocable session identifier", () => {
    const session: IdentitySession = {
      sessionId: "sess_phase0",
      subjectId: "user_phase0",
      emailVerified: true,
      assuranceLevel: "standard",
      issuedAt: new Date("2026-07-25T00:00:00.000Z"),
      expiresAt: new Date("2026-07-25T01:00:00.000Z")
    };

    expect(session.sessionId).toBe("sess_phase0");
  });
});

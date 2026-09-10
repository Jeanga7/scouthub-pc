import { describe, expect, it } from "vitest";
import { memberSummarySchema } from "./index";

describe("member summary privacy contract", () => {
  it("does not expose sensitive profile fields", () => {
    const summary = memberSummarySchema.parse({
      personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      scoutId: "PC-000001",
      displayName: "Personne fictive",
      status: "ACTIVE",
      currentOrganization: null,
      branch: null,
      primaryAppointment: null,
      birthDate: "2010-01-01T00:00:00.000Z",
      primaryPhone: "77000000",
      guardianName: "Responsable fictif",
      insuranceNumber: "FAKE-1",
    });
    expect(summary).not.toHaveProperty("birthDate");
    expect(summary).not.toHaveProperty("primaryPhone");
    expect(summary).not.toHaveProperty("guardianName");
    expect(summary).not.toHaveProperty("insuranceNumber");
  });
});

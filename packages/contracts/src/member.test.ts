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
      birthPlace: "Dakar",
      primaryPhone: "77000000",
      secondaryPhone: "78000000",
      email: "personne@example.test",
      guardianName: "Responsable fictif",
      guardianPhone: "79000000",
      guardianRelationship: "Parent",
      insuranceNumber: "FAKE-1",
      insuranceYear: 2026,
      administrativeNotes: "Note interne",
    });
    expect(summary).not.toHaveProperty("birthDate");
    expect(summary).not.toHaveProperty("birthPlace");
    expect(summary).not.toHaveProperty("primaryPhone");
    expect(summary).not.toHaveProperty("secondaryPhone");
    expect(summary).not.toHaveProperty("email");
    expect(summary).not.toHaveProperty("guardianName");
    expect(summary).not.toHaveProperty("guardianPhone");
    expect(summary).not.toHaveProperty("guardianRelationship");
    expect(summary).not.toHaveProperty("insuranceNumber");
    expect(summary).not.toHaveProperty("insuranceYear");
    expect(summary).not.toHaveProperty("administrativeNotes");
  });
});

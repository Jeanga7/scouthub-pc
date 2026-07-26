import { describe, expect, it } from "vitest";
import {
  createProjectDraftRequestSchema,
  updateProjectDraftRequestSchema
} from ".";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ownerOrganizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

describe("project contracts", () => {
  it("allows planned and already completed draft creation but not public visibility", () => {
    expect(createProjectDraftRequestSchema.parse({
      tenantId,
      ownerOrganizationId,
      title: "Jardin communautaire",
      projectMode: "ALREADY_COMPLETED",
      visibility: "INTERNAL"
    }).projectMode).toBe("ALREADY_COMPLETED");

    expect(() =>
      createProjectDraftRequestSchema.parse({
        tenantId,
        ownerOrganizationId,
        title: "Jardin communautaire",
        visibility: "PUBLIC"
      })
    ).toThrow();
  });

  it("keeps PATCH partial and rejects empty mutations", () => {
    const nameOnly = updateProjectDraftRequestSchema.parse({
      tenantId,
      expectedVersion: 3,
      title: "Nouveau titre"
    });
    expect("summary" in nameOnly).toBe(false);
    expect("plannedStartAt" in nameOnly).toBe(false);

    const clearSummary = updateProjectDraftRequestSchema.parse({
      tenantId,
      expectedVersion: 3,
      summary: null
    });
    expect(clearSummary.summary).toBeNull();

    expect(() =>
      updateProjectDraftRequestSchema.parse({
        tenantId,
        expectedVersion: 3
      })
    ).toThrow();
  });
});


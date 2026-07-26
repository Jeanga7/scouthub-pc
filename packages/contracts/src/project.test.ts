import { describe, expect, it } from "vitest";
import {
  createProjectDraftRequestSchema,
  projectStatusSchema,
  updateProjectDraftRequestSchema
} from ".";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ownerOrganizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

describe("project contracts", () => {
  it("uses the normative Project status machine values", () => {
    expect(projectStatusSchema.options).toEqual([
      "DRAFT",
      "READY_FOR_REVIEW",
      "IN_REVIEW",
      "CHANGES_REQUESTED",
      "APPROVED_FOR_EXECUTION",
      "IN_EXECUTION",
      "EXECUTION_COMPLETED",
      "FINAL_REVIEW",
      "FINAL_CHANGES_REQUESTED",
      "VALIDATED",
      "READY_FOR_PUBLICATION",
      "PUBLISHED",
      "EXTERNAL_SUBMITTED",
      "MONITORING",
      "CLOSED",
      "CANCELLED",
      "REJECTED",
      "ARCHIVED"
    ]);
  });

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

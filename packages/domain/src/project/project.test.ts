import { describe, expect, it } from "vitest";
import {
  assertSlice3OwnerOrganization,
  assertProjectCommentShape,
  assertSlice4Transition,
  buildInternalProjectSlug,
  buildProjectCode,
  isProjectContentEditable,
  normalizeProjectTitle,
  validateProjectDateRange
} from "../index";

describe("project draft domain invariants", () => {
  it("normalizes titles and rejects empty titles", () => {
    expect(normalizeProjectTitle(" Jardin communautaire ")).toBe("Jardin communautaire");
    expect(() => normalizeProjectTitle("   ")).toThrow("Project title is required");
  });

  it("allows only active group or unit owners in Slice 3", () => {
    expect(() =>
      assertSlice3OwnerOrganization({ type: "GROUP", status: "ACTIVE" })
    ).not.toThrow();
    expect(() =>
      assertSlice3OwnerOrganization({ type: "UNIT", status: "ACTIVE" })
    ).not.toThrow();
    expect(() =>
      assertSlice3OwnerOrganization({ type: "REGION", status: "ACTIVE" })
    ).toThrow("group or unit");
    expect(() =>
      assertSlice3OwnerOrganization({ type: "GROUP", status: "DRAFT" })
    ).toThrow("must be active");
  });

  it("validates draft date ranges without requiring complete dates", () => {
    expect(() => validateProjectDateRange(null, new Date("2026-01-01"), "DATES")).not.toThrow();
    expect(() =>
      validateProjectDateRange(new Date("2026-02-01"), new Date("2026-01-01"), "DATES")
    ).toThrow("date range");
  });

  it("builds stable internal references without using the title as code", () => {
    expect(buildProjectCode("a1b2c3d4e5f6")).toBe("PRJ-A1B2C3D4E5F6");
    expect(buildInternalProjectSlug("Reboisement Mbour", "a1b2c3d4e5f6")).toBe("reboisement-mbour-a1b2c3d4e5f6");
  });

  it("allows only Slice 4 workflow transitions", () => {
    for (const [from, to] of [
      ["DRAFT", "READY_FOR_REVIEW"],
      ["READY_FOR_REVIEW", "IN_REVIEW"],
      ["IN_REVIEW", "CHANGES_REQUESTED"],
      ["CHANGES_REQUESTED", "READY_FOR_REVIEW"],
      ["IN_REVIEW", "APPROVED_FOR_EXECUTION"],
      ["IN_REVIEW", "REJECTED"]
    ] as const) {
      expect(() => assertSlice4Transition(from, to)).not.toThrow();
    }

    expect(() => assertSlice4Transition("DRAFT", "IN_REVIEW")).toThrow("not allowed");
    expect(() => assertSlice4Transition("READY_FOR_REVIEW", "APPROVED_FOR_EXECUTION")).toThrow("not allowed");
    expect(() => assertSlice4Transition("APPROVED_FOR_EXECUTION", "DRAFT")).toThrow("not allowed");
  });

  it("freezes content outside draft and changes-requested statuses", () => {
    expect(isProjectContentEditable("DRAFT")).toBe(true);
    expect(isProjectContentEditable("CHANGES_REQUESTED")).toBe(true);
    expect(isProjectContentEditable("READY_FOR_REVIEW")).toBe(false);
    expect(isProjectContentEditable("IN_REVIEW")).toBe(false);
    expect(isProjectContentEditable("APPROVED_FOR_EXECUTION")).toBe(false);
    expect(isProjectContentEditable("REJECTED")).toBe(false);
  });

  it("validates review comments as plain field or global notes", () => {
    expect(assertProjectCommentShape({
      kind: "GLOBAL",
      fieldKey: null,
      body: "Retour global"
    })).toEqual({ fieldKey: null, body: "Retour global" });
    expect(assertProjectCommentShape({
      kind: "FIELD",
      fieldKey: "diagnostic",
      body: "A preciser"
    })).toEqual({ fieldKey: "diagnostic", body: "A preciser" });
    expect(() => assertProjectCommentShape({
      kind: "FIELD",
      fieldKey: "unknown",
      body: "A preciser"
    })).toThrow("field");
    expect(() => assertProjectCommentShape({
      kind: "GLOBAL",
      fieldKey: "diagnostic",
      body: "A preciser"
    })).toThrow("Global");
  });
});

import { describe, expect, it } from "vitest";
import {
  assertSlice3OwnerOrganization,
  buildInternalProjectSlug,
  buildProjectCode,
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
});

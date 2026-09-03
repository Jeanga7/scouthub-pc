import { describe, expect, it } from "vitest";
import {
  assertRootRules,
  isAllowedParentChild,
  isSlice1CreatableType,
  normalizeOrganizationCode,
  normalizeOrganizationName,
  validateActivePeriod
} from "../index";

describe("organization hierarchy", () => {
  it.each([
    ["NSO", "REGION"],
    ["REGION", "DISTRICT"],
    ["REGION", "GROUP"],
    ["DISTRICT", "GROUP"],
    ["GROUP", "ANNEX"],
    ["GROUP", "UNIT"],
    ["ANNEX", "UNIT"]
  ] as const)("allows %s -> %s", (parentType, childType) => {
    expect(isAllowedParentChild(parentType, childType)).toBe(true);
  });

  it.each([
    ["REGION", "UNIT"],
    ["DISTRICT", "UNIT"],
    ["ANNEX", "GROUP"],
    ["REGION", "ANNEX"],
    ["GROUP", "GROUP"],
    ["UNIT", "GROUP"],
    ["UNIT", "UNIT"]
  ] as const)("rejects %s -> %s", (parentType, childType) => {
    expect(isAllowedParentChild(parentType, childType)).toBe(false);
  });

  it("keeps TEAM reserved for a future institutional decision", () => {
    expect(isSlice1CreatableType("TEAM")).toBe(false);
  });
});

describe("organization invariants", () => {
  it("normalizes code deterministically", () => {
    expect(normalizeOrganizationCode(" alpha-01 ")).toBe("ALPHA-01");
  });

  it("rejects empty names", () => {
    expect(() => normalizeOrganizationName("  ")).toThrow("name cannot be empty");
  });

  it("rejects invalid active periods", () => {
    expect(() =>
      validateActivePeriod(new Date("2026-03-02"), new Date("2026-03-01"))
    ).toThrow("activeUntil");
  });

  it("enforces NSO root rules", () => {
    expect(() =>
      assertRootRules({
        id: "tenant-a",
        tenantId: "tenant-a",
        parentId: null,
        type: "NSO",
        depth: 0,
        path: "/tenant-a/"
      })
    ).not.toThrow();
  });

  it("requires non-root organizations to have a parent", () => {
    expect(() =>
      assertRootRules({
        id: "region-a",
        tenantId: "tenant-a",
        parentId: null,
        type: "REGION",
        depth: 1,
        path: "/tenant-a/region-a/"
      })
    ).toThrow("require a parent");
  });
});

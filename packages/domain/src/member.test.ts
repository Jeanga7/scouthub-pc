import { describe, expect, it } from "vitest";
import {
  isValidScoutId,
  isTerritorialMembershipOrganizationType,
  normalizeScoutId,
} from "./member";

describe("member identity", () => {
  it("formats sequence values as stable regional Scout IDs", () => {
    expect(normalizeScoutId(1)).toBe("PC-000001");
    expect(normalizeScoutId(42)).toBe("PC-000042");
    expect(isValidScoutId("PC-000042")).toBe(true);
    expect(isValidScoutId("GROUP-42")).toBe(false);
  });

  it("limits memberships to territorial organization nodes", () => {
    expect(isTerritorialMembershipOrganizationType("UNIT")).toBe(true);
    expect(isTerritorialMembershipOrganizationType("DISTRICT")).toBe(true);
    expect(isTerritorialMembershipOrganizationType("TEAM")).toBe(false);
  });
});

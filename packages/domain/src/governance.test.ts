import { describe, expect, it } from "vitest";
import {
  canEndAppointment,
  canProposeAppointment,
  canValidateAppointment,
  isAppointmentActiveAt,
  type Appointment,
  type Position,
} from "./governance";

const districtPath = "/nso/region/district-x/";
const actor = (
  scopePaths: string[],
  permissions: string[],
  overrides = {},
) => ({
  accountId: "validator",
  tenantId: "t",
  personId: "validator-person",
  scopePaths,
  permissions,
  ...overrides,
});
const scope = (
  id: string,
  path: string,
  type: "GROUP" | "UNIT" | "ANNEX" = "GROUP",
) => ({ id, tenantId: "t", type, path });
const position: Position = {
  id: "p",
  tenantId: "t",
  code: "GROUP_LEADER",
  title: "Chef de Groupe",
  description: null,
  allowedScopeTypes: ["GROUP", "UNIT", "ANNEX"],
  sector: null,
  branch: null,
  holderPolicy: "SINGLE",
  active: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const appointment: Appointment = {
  id: "a",
  tenantId: "t",
  personId: "person",
  positionId: "p",
  scopeOrgId: "group-a",
  status: "PENDING",
  startsAt: new Date("2027-01-01"),
  endsAt: null,
  proposedBy: "proposer",
  validatedBy: null,
  proposedAt: new Date(0),
  validatedAt: null,
  endedAt: null,
  notes: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("appointment hierarchy policy", () => {
  it("allows District X on a descendant Group when permission is present", () =>
    expect(
      canProposeAppointment(
        actor([districtPath], ["appointment.create"]),
        position,
        scope("group-a", `${districtPath}group-a/`),
      ),
    ).toBe(true));
  it("denies District X on a Group under District Y", () =>
    expect(
      canProposeAppointment(
        actor([districtPath], ["appointment.create"]),
        position,
        scope("group-b", "/nso/region/district-y/group-b/"),
      ),
    ).toBe(false));
  it.each([
    ["UNIT", "unit-a"],
    ["ANNEX", "annex-a"],
  ] as const)("allows Group A on descendant %s", (type, id) =>
    expect(
      canProposeAppointment(
        actor([`${districtPath}group-a/`], ["appointment.create"]),
        position,
        scope(id, `${districtPath}group-a/${id}/`, type),
      ),
    ).toBe(true),
  );
  it("denies Group A on sibling Group B", () =>
    expect(
      canProposeAppointment(
        actor([`${districtPath}group-a/`], ["appointment.create"]),
        position,
        scope("group-b", `${districtPath}group-b/`),
      ),
    ).toBe(false));
  it("applies descendant scope to validation and ending", () => {
    const target = scope("group-a", `${districtPath}group-a/`);
    expect(
      canValidateAppointment(
        actor([districtPath], ["appointment.validate"]),
        appointment,
        "person",
        target,
      ),
    ).toBe(true);
    expect(
      canEndAppointment(
        actor([districtPath], ["appointment.end"]),
        { ...appointment, status: "ACTIVE" },
        target,
      ),
    ).toBe(true);
  });
  it("prevents proposer and nominated person from self-validating", () => {
    const target = scope("group-a", `${districtPath}group-a/`);
    expect(
      canValidateAppointment(
        actor([districtPath], ["appointment.validate"], {
          accountId: "proposer",
        }),
        appointment,
        "person",
        target,
      ),
    ).toBe(false);
    expect(
      canValidateAppointment(
        actor([districtPath], ["appointment.validate"], { personId: "person" }),
        appointment,
        "person",
        target,
      ),
    ).toBe(false);
  });
  it("rejects cross-tenant and invalid state", () => {
    const target = scope("group-a", `${districtPath}group-a/`);
    expect(
      canValidateAppointment(
        actor([districtPath], ["appointment.validate"], { tenantId: "other" }),
        appointment,
        "person",
        target,
      ),
    ).toBe(false);
    expect(
      canValidateAppointment(
        actor([districtPath], ["appointment.validate"]),
        { ...appointment, status: "REJECTED" },
        "person",
        target,
      ),
    ).toBe(false);
  });
  it("evaluates active dates", () => {
    const active = { ...appointment, status: "ACTIVE" as const };
    expect(isAppointmentActiveAt(active, new Date("2027-02-01"))).toBe(true);
    expect(
      isAppointmentActiveAt(
        { ...active, endsAt: new Date("2027-01-15") },
        new Date("2027-02-01"),
      ),
    ).toBe(false);
  });
});

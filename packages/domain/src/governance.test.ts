import { describe, expect, it } from "vitest";
import {
  canEndAppointment,
  canDirectlyActivateAppointment,
  canProposeAppointment,
  canValidateAppointment,
  isAppointmentCurrentlyActive,
  isAppointmentEffectiveAt,
  type Appointment,
  type AppointmentActor,
  type Position,
} from "./governance";

const districtPath = "/nso/region/district-x/";
const actor = (
  scopePaths: string[],
  permissions: string[],
  overrides: Partial<AppointmentActor> = {},
): AppointmentActor => ({
  accountId: "validator",
  tenantId: "t",
  personId: "validator-person",
  grants: scopePaths.map((scopePath) => ({
    scopePath,
    scopeType: "DISTRICT" as const,
    permissions,
  })),
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
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  endedBy: null,
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
    const active = {
      ...appointment,
      status: "ACTIVE" as const,
      validatedAt: new Date("2027-01-01"),
    };
    expect(isAppointmentCurrentlyActive(active, new Date("2027-02-01"))).toBe(
      true,
    );
    expect(
      isAppointmentCurrentlyActive(
        { ...active, endsAt: new Date("2027-01-15") },
        new Date("2027-02-01"),
      ),
    ).toBe(false);
  });
  it.each([
    ["ACTIVE in interval", "ACTIVE", "2027-02-01", null, true],
    ["before starts", "ACTIVE", "2026-12-01", null, false],
    ["after ends", "ACTIVE", "2027-03-01", "2027-02-15", false],
    ["ENDED historical interval", "ENDED", "2027-02-01", "2027-02-15", true],
    ["ENDED after interval", "ENDED", "2027-03-01", "2027-02-15", false],
    ["REJECTED", "REJECTED", "2027-02-01", "2027-02-15", false],
    ["PENDING", "PENDING", "2027-02-01", "2027-02-15", false],
  ] as const)("effectiveAt: %s", (_label, status, date, ends, expected) => {
    expect(
      isAppointmentEffectiveAt(
        {
          ...appointment,
          status,
          startsAt: new Date("2027-01-01"),
          endsAt: ends ? new Date(ends) : null,
          validatedAt:
            status === "ACTIVE" || status === "ENDED"
              ? new Date("2027-01-01")
              : null,
        },
        new Date(date),
      ),
    ).toBe(expected);
  });
  it("stops being historically effective after manual end boundary", () => {
    const ended = {
      ...appointment,
      status: "ENDED" as const,
      startsAt: new Date("2027-01-01T00:00:00Z"),
      endsAt: new Date("2027-02-01T00:00:00Z"),
      validatedAt: new Date("2027-01-01T00:00:00Z"),
      endedAt: new Date("2027-02-01T00:00:00Z"),
    };
    expect(
      isAppointmentEffectiveAt(ended, new Date("2027-01-15T00:00:00Z")),
    ).toBe(true);
    expect(
      isAppointmentEffectiveAt(ended, new Date("2027-02-02T00:00:00Z")),
    ).toBe(false);
  });
  it("allows direct activation only for group authority on subordinate units", () => {
    const groupActor = actor(
      [`${districtPath}group-a/`],
      ["appointment.create"],
      {
        grants: [
          {
            scopePath: `${districtPath}group-a/`,
            scopeType: "GROUP",
            permissions: ["appointment.create"],
          },
        ],
      },
    );
    const unit = scope("unit-a", `${districtPath}group-a/unit-a/`, "UNIT");
    expect(
      canDirectlyActivateAppointment(groupActor, position, unit, "person"),
    ).toBe(true);
    expect(
      canDirectlyActivateAppointment(
        groupActor,
        position,
        scope("annex-a", `${districtPath}group-a/annex-a/`, "ANNEX"),
        "person",
      ),
    ).toBe(true);
    expect(
      canDirectlyActivateAppointment(
        groupActor,
        position,
        scope("group-a", `${districtPath}group-a/`),
        "person",
      ),
    ).toBe(false);
  });
  it("denies direct activation when group type and covering path come from different grants", () => {
    const mixedActor = actor([], ["appointment.create"], {
      grants: [
        {
          scopePath: `${districtPath}group-a/`,
          scopeType: "GROUP",
          permissions: ["appointment.create"],
        },
        {
          scopePath: "/nso/region/district-y/",
          scopeType: "DISTRICT",
          permissions: ["appointment.create"],
        },
      ],
    });
    expect(
      canDirectlyActivateAppointment(
        mixedActor,
        position,
        scope("unit-b", "/nso/region/district-y/group-b/unit-b/", "UNIT"),
        "person",
      ),
    ).toBe(false);
  });
  it("denies self direct appointment", () => {
    const groupActor = actor([], ["appointment.create"], {
      personId: "person",
      grants: [
        {
          scopePath: `${districtPath}group-a/`,
          scopeType: "GROUP",
          permissions: ["appointment.create"],
        },
      ],
    });
    expect(
      canDirectlyActivateAppointment(
        groupActor,
        position,
        scope("unit-a", `${districtPath}group-a/unit-a/`, "UNIT"),
        "person",
      ),
    ).toBe(false);
  });
});

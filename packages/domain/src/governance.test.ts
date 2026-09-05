import { describe, expect, it } from "vitest";
import { canEndAppointment, canProposeAppointment, canValidateAppointment, isAppointmentActiveAt, type Appointment, type Position } from "./governance";

const position: Position = { id: "p", tenantId: "t", code: "GROUP_LEADER", title: "Chef de Groupe", description: null, allowedScopeTypes: ["GROUP"], sector: null, branch: null, holderPolicy: "SINGLE", active: true, createdAt: new Date(0), updatedAt: new Date(0) };
const appointment: Appointment = { id: "a", tenantId: "t", personId: "person", positionId: "p", scopeOrgId: "group", status: "PENDING", startsAt: new Date("2027-01-01"), endsAt: null, proposedBy: "proposer", validatedBy: null, proposedAt: new Date(0), validatedAt: null, endedAt: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0) };

describe("appointment governance policy", () => {
  it("requires tenant, scope, active position and create capability", () => {
    expect(canProposeAppointment({ accountId: "a", tenantId: "t", personId: null, scopeOrgIds: ["group"], permissions: ["appointment.create"] }, position, { id: "group", tenantId: "t", type: "GROUP", path: "/group/" })).toBe(true);
    expect(canProposeAppointment({ accountId: "a", tenantId: "other", personId: null, scopeOrgIds: ["group"], permissions: ["appointment.create"] }, position, { id: "group", tenantId: "t", type: "GROUP", path: "/group/" })).toBe(false);
  });
  it("prevents self validation and allows a scoped superior", () => {
    expect(canValidateAppointment({ accountId: "proposer", tenantId: "t", personId: "other", scopeOrgIds: ["group"], permissions: ["appointment.validate"] }, appointment, "person")).toBe(false);
    expect(canValidateAppointment({ accountId: "validator", tenantId: "t", personId: "other", scopeOrgIds: ["group"], permissions: ["appointment.validate"] }, appointment, "person")).toBe(true);
  });
  it("ends only active appointments and evaluates historical dates", () => {
    const active = { ...appointment, status: "ACTIVE" as const };
    expect(canEndAppointment({ accountId: "validator", tenantId: "t", personId: null, scopeOrgIds: ["group"], permissions: ["appointment.end"] }, active)).toBe(true);
    expect(isAppointmentActiveAt(active, new Date("2027-02-01"))).toBe(true);
    expect(isAppointmentActiveAt({ ...active, endsAt: new Date("2027-01-15") }, new Date("2027-02-01"))).toBe(false);
  });
});

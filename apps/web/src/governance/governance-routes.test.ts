import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApplicationError } from "@scouthub/application";
import type { ActorContext } from "@scouthub/application";
vi.mock("@/identity/http", () => ({ requireActor: vi.fn() }));
vi.mock("@/governance/service", () => ({
  createPositionUseCases: vi.fn(),
  createAppointmentUseCases: vi.fn(),
}));
vi.mock("@/organizations/service", () => ({
  createOrganizationUseCases: vi.fn(),
}));
import { requireActor } from "@/identity/http";
import {
  createAppointmentUseCases,
  createPositionUseCases,
} from "@/governance/service";
import { createOrganizationUseCases } from "@/organizations/service";
import {
  GET as GET_POSITIONS,
  POST as POST_POSITION,
} from "../../app/api/v1/governance/positions/route";
import { POST as APPROVE } from "../../app/api/v1/governance/appointments/[id]/approve/route";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const regionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const appointmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const positionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const personId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6";
const now = new Date("2026-09-05T00:00:00Z");
const actor = (
  permissions: string[],
  person = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
): ActorContext => ({
  account: {
    id: accountId,
    externalIdentityId: "subject",
    primaryEmail: "admin@example.test",
    status: "ACTIVE",
    lastLoginAt: null,
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
  },
  person: {
    id: person,
    tenantId,
    firstName: "A",
    lastName: "B",
    displayName: "A B",
    classification: "P2",
    status: "ACTIVE",
    birthDate: null,
    createdAt: now,
    updatedAt: now,
  },
  assuranceLevel: "standard",
  assignments: [
    {
      id: crypto.randomUUID(),
      tenantId,
      accountId,
      roleId: crypto.randomUUID(),
      roleCode: "REGIONAL_ADMIN",
      permissions: permissions as never,
      scopeType: "REGION",
      scopeOrgId: regionId,
      scopePath: `/${tenantId}/${regionId}/`,
      startsAt: new Date(0),
      endsAt: null,
      grantedByAccountId: accountId,
      grantedAt: now,
      revokedAt: null,
    },
  ],
});
const position = {
  id: positionId,
  tenantId,
  code: "LEADER",
  title: "Chef",
  description: null,
  allowedScopeTypes: ["REGION"] as const,
  sector: null,
  branch: null,
  holderPolicy: "SINGLE" as const,
  active: true,
  createdAt: now,
  updatedAt: now,
};
const appointment = {
  id: appointmentId,
  tenantId,
  personId,
  positionId,
  scopeOrgId: regionId,
  status: "PENDING" as const,
  startsAt: now,
  endsAt: null,
  proposedBy: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
  validatedBy: null,
  proposedAt: now,
  validatedAt: null,
  endedAt: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createPositionUseCases).mockReturnValue({
    listPositions: vi.fn().mockResolvedValue([position]),
    createPosition: vi.fn().mockResolvedValue(position),
  } as never);
  vi.mocked(createAppointmentUseCases).mockReturnValue({
    getAppointment: vi.fn().mockResolvedValue(appointment),
    approveAppointment: vi
      .fn()
      .mockResolvedValue({ ...appointment, status: "ACTIVE" }),
  } as never);
  vi.mocked(createOrganizationUseCases).mockReturnValue({
    getOrganization: vi.fn().mockResolvedValue({
      id: regionId,
      tenantId,
      type: "REGION",
      path: `/${tenantId}/${regionId}/`,
    }),
  } as never);
});
describe("Governance API routes", () => {
  it("requires authentication", async () => {
    vi.mocked(requireActor).mockRejectedValue(
      new ApplicationError("Authentication required.", "AUTH_REQUIRED", 401),
    );
    expect(
      (
        await GET_POSITIONS(
          new Request(
            `http://localhost/api/v1/governance/positions?tenantId=${tenantId}`,
          ),
        )
      ).status,
    ).toBe(401);
  });
  it("denies cross-tenant catalogue access", async () => {
    vi.mocked(requireActor).mockResolvedValue(actor(["position.read"]));
    expect(
      (
        await GET_POSITIONS(
          new Request(
            "http://localhost/api/v1/governance/positions?tenantId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("creates a position through its Zod contract", async () => {
    vi.mocked(requireActor).mockResolvedValue(actor(["position.manage"]));
    const response = await POST_POSITION(
      new Request(
        `http://localhost/api/v1/governance/positions?tenantId=${tenantId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: "LEADER",
            title: "Chef",
            description: null,
            allowedScopeTypes: ["REGION"],
            sector: null,
            branch: null,
            holderPolicy: "SINGLE",
          }),
        },
      ),
    );
    expect(response.status).toBe(201);
  });
  it("prevents the nominated person from self-validating", async () => {
    vi.mocked(requireActor).mockResolvedValue(
      actor(["appointment.validate"], personId),
    );
    const response = await APPROVE(
      new Request(
        `http://localhost/api/v1/governance/appointments/${appointmentId}/approve?tenantId=${tenantId}`,
        {
          method: "POST",
          body: "{}",
          headers: { "content-type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: appointmentId }) },
    );
    expect(response.status).toBe(403);
  });
  it("maps invalid state transitions", async () => {
    vi.mocked(requireActor).mockResolvedValue(actor(["appointment.validate"]));
    vi.mocked(createAppointmentUseCases).mockReturnValue({
      getAppointment: vi.fn().mockResolvedValue(appointment),
      approveAppointment: vi
        .fn()
        .mockRejectedValue(
          new ApplicationError("Invalid", "APPOINTMENT_INVALID_STATE", 409),
        ),
    } as never);
    const response = await APPROVE(
      new Request(
        `http://localhost/api/v1/governance/appointments/${appointmentId}/approve?tenantId=${tenantId}`,
        {
          method: "POST",
          body: "{}",
          headers: { "content-type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: appointmentId }) },
    );
    expect(response.status).toBe(409);
  });
});

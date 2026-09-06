import type { Appointment } from "@scouthub/domain";
import { describe, expect, it, vi } from "vitest";
import type {
  AppointmentRepository,
  AppointmentTransaction,
} from "../ports/governance-repository";
import { AppointmentUseCases } from "./use-cases";

const now = new Date("2026-09-06T00:00:00Z");
const appointment: Appointment = {
  id: "appointment-1",
  tenantId: "tenant-1",
  personId: "person-1",
  positionId: "position-1",
  scopeOrgId: "unit-1",
  status: "PENDING",
  startsAt: now,
  endsAt: null,
  proposedBy: "account-1",
  validatedBy: null,
  proposedAt: now,
  validatedAt: null,
  endedAt: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
};

describe("AppointmentUseCases", () => {
  it("creates then directly activates inside one transaction", async () => {
    const activated = {
      ...appointment,
      status: "ACTIVE" as const,
      validatedBy: "validator-1",
      validatedAt: now,
    };
    const createAppointment = vi.fn<AppointmentTransaction["create"]>(() =>
      Promise.resolve(appointment),
    );
    const activateAppointment = vi.fn<AppointmentTransaction["activate"]>(() =>
      Promise.resolve(activated),
    );
    const tx: AppointmentTransaction = {
      create: createAppointment,
      findById: vi.fn(),
      list: vi.fn(),
      listViews: vi.fn(),
      update: vi.fn(),
      activate: activateAppointment,
    };
    let transactionCalls = 0;
    const repository: AppointmentRepository = {
      transaction: async (handler) => {
        transactionCalls += 1;
        return handler(tx);
      },
    };
    const result = await new AppointmentUseCases(repository).proposeAppointment(
      appointment,
      { directActivate: true, validatedBy: "validator-1" },
    );
    expect(result.status).toBe("ACTIVE");
    expect(transactionCalls).toBe(1);
    expect(createAppointment).toHaveBeenCalledWith(appointment);
    expect(activateAppointment).toHaveBeenCalledWith(
      appointment.tenantId,
      appointment.id,
      "validator-1",
      expect.any(Date),
    );
  });
});

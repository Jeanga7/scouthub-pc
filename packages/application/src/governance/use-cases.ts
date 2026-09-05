import type { Appointment, Position } from "@scouthub/domain";
import { ApplicationError, ValidationError } from "../organization/errors";
import type {
  AppointmentRepository,
  PositionRepository,
} from "../ports/governance-repository";
export class PositionUseCases {
  constructor(private readonly repository: PositionRepository) {}
  createPosition(value: Position) {
    return this.repository.transaction((tx) => tx.create(value));
  }
  getPosition(tenantId: string, id: string) {
    return this.repository.transaction((tx) => tx.findById(tenantId, id));
  }
  listPositions(tenantId: string) {
    return this.repository.transaction((tx) => tx.list(tenantId));
  }
  updatePosition(tenantId: string, id: string, patch: Partial<Position>) {
    return this.repository.transaction((tx) => tx.update(tenantId, id, patch));
  }
  async deactivatePosition(tenantId: string, id: string) {
    if (!(await this.getPosition(tenantId, id)))
      throw new ValidationError(
        "Position introuvable.",
        "POSITION_NOT_FOUND",
        404,
      );
    return this.updatePosition(tenantId, id, { active: false });
  }
}
export class AppointmentUseCases {
  constructor(private readonly repository: AppointmentRepository) {}
  proposeAppointment(value: Appointment) {
    return this.repository.transaction((tx) => tx.create(value));
  }
  getAppointment(tenantId: string, id: string) {
    return this.repository.transaction((tx) => tx.findById(tenantId, id));
  }
  listAppointments(tenantId: string) {
    return this.repository.transaction((tx) => tx.list(tenantId));
  }
  listAppointmentViews(tenantId: string) {
    return this.repository.transaction((tx) => tx.listViews(tenantId));
  }
  approveAppointment(tenantId: string, id: string, validatedBy: string) {
    return this.repository.transaction(async (tx) => {
      const current = await tx.findById(tenantId, id);
      if (current === null)
        throw new ValidationError(
          "Nomination introuvable.",
          "APPOINTMENT_NOT_FOUND",
          404,
        );
      if (current.status !== "PENDING")
        throw new ApplicationError(
          "Transition de nomination invalide.",
          "APPOINTMENT_INVALID_STATE",
          409,
        );
      const updated = await tx.activate(tenantId, id, validatedBy, new Date());
      if (updated === null)
        throw new ApplicationError(
          "La nomination a changé.",
          "APPOINTMENT_INVALID_STATE",
          409,
        );
      return updated;
    });
  }
  private transition(
    tenantId: string,
    id: string,
    expected: Appointment["status"],
    patch: Partial<Appointment>,
  ) {
    return this.repository.transaction(async (tx) => {
      const current = await tx.findById(tenantId, id);
      if (current === null)
        throw new ValidationError(
          "Nomination introuvable.",
          "APPOINTMENT_NOT_FOUND",
          404,
        );
      if (current.status !== expected)
        throw new ApplicationError(
          "Transition de nomination invalide.",
          "APPOINTMENT_INVALID_STATE",
          409,
        );
      const updated = await tx.update(tenantId, id, patch);
      if (updated === null)
        throw new ApplicationError(
          "La nomination a changé.",
          "APPOINTMENT_INVALID_STATE",
          409,
        );
      return updated;
    });
  }
  rejectAppointment(tenantId: string, id: string) {
    return this.transition(tenantId, id, "PENDING", { status: "REJECTED" });
  }
  endAppointment(tenantId: string, id: string) {
    return this.transition(tenantId, id, "ACTIVE", {
      status: "ENDED",
      endedAt: new Date(),
    });
  }
}

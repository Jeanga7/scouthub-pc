import type { Appointment, AppointmentStatus, Position } from "@scouthub/domain";

export interface PositionRepository {
  transaction<TResult>(handler: (transaction: PositionTransaction) => Promise<TResult>): Promise<TResult>;
}
export interface PositionTransaction {
  create(position: Position): Promise<Position>;
  findById(tenantId: string, id: string): Promise<Position | null>;
  list(tenantId: string): Promise<Position[]>;
  update(tenantId: string, id: string, patch: Partial<Position>): Promise<Position | null>;
}
export interface AppointmentRepository {
  transaction<TResult>(handler: (transaction: AppointmentTransaction) => Promise<TResult>): Promise<TResult>;
}
export interface AppointmentTransaction {
  create(appointment: Appointment): Promise<Appointment>;
  findById(tenantId: string, id: string): Promise<Appointment | null>;
  list(tenantId: string, status?: AppointmentStatus): Promise<Appointment[]>;
  update(tenantId: string, id: string, patch: Partial<Appointment>): Promise<Appointment | null>;
}

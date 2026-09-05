import type {
  Appointment,
  AppointmentStatus,
  Position,
} from "@scouthub/domain";
export interface AppointmentView extends Appointment {
  readonly personName: string;
  readonly positionTitle: string;
  readonly scopeName: string;
}

export interface PositionRepository {
  transaction<TResult>(
    handler: (transaction: PositionTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
export interface PositionTransaction {
  create(position: Position): Promise<Position>;
  findById(tenantId: string, id: string): Promise<Position | null>;
  list(tenantId: string): Promise<Position[]>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<Position>,
  ): Promise<Position | null>;
}
export interface AppointmentRepository {
  transaction<TResult>(
    handler: (transaction: AppointmentTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
export interface AppointmentTransaction {
  create(appointment: Appointment): Promise<Appointment>;
  findById(tenantId: string, id: string): Promise<Appointment | null>;
  list(tenantId: string, status?: AppointmentStatus): Promise<Appointment[]>;
  listViews(
    tenantId: string,
    status?: AppointmentStatus,
  ): Promise<AppointmentView[]>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<Appointment>,
  ): Promise<Appointment | null>;
  activate(
    tenantId: string,
    id: string,
    validatedBy: string,
    validatedAt: Date,
  ): Promise<Appointment | null>;
}

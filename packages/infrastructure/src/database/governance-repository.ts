import { and, asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  appointment,
  organization,
  person,
  position,
} from "@scouthub/database";
import type {
  Appointment,
  AppointmentStatus,
  Position,
} from "@scouthub/domain";
import {
  ApplicationError,
  type AppointmentRepository,
  type AppointmentTransaction,
  type PositionRepository,
  type PositionTransaction,
} from "@scouthub/application";

type Database = ReturnType<typeof drizzle>;
type Db = Pick<Database, "select" | "insert" | "update" | "execute">;

export function createPgPositionRepository(url: string): PositionRepository {
  return new PgPositionRepository(url);
}
export function createPgAppointmentRepository(
  url: string,
): AppointmentRepository {
  return new PgAppointmentRepository(url);
}

class PgPositionRepository implements PositionRepository {
  constructor(private readonly url: string) {}
  async transaction<T>(
    handler: (tx: PositionTransaction) => Promise<T>,
  ): Promise<T> {
    const pool = new pg.Pool({ connectionString: this.url, max: 1 });
    try {
      return await drizzle(pool).transaction((db) =>
        handler(new PositionTx(db)),
      );
    } finally {
      await pool.end();
    }
  }
}
class PositionTx implements PositionTransaction {
  constructor(private readonly db: Db) {}
  async create(value: Position) {
    const [row] = await this.db
      .insert(position)
      .values({ ...value, allowedScopeTypes: [...value.allowedScopeTypes] })
      .returning();
    if (!row) throw new Error("Position insert returned no row");
    return mapPosition(row);
  }
  async findById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(position)
      .where(and(eq(position.tenantId, tenantId), eq(position.id, id)))
      .limit(1);
    return row ? mapPosition(row) : null;
  }
  async list(tenantId: string) {
    return (
      await this.db
        .select()
        .from(position)
        .where(eq(position.tenantId, tenantId))
        .orderBy(asc(position.title))
    ).map(mapPosition);
  }
  async update(tenantId: string, id: string, patch: Partial<Position>) {
    const [row] = await this.db
      .update(position)
      .set({
        ...patch,
        updatedAt: new Date(),
        allowedScopeTypes: patch.allowedScopeTypes
          ? [...patch.allowedScopeTypes]
          : undefined,
      })
      .where(and(eq(position.tenantId, tenantId), eq(position.id, id)))
      .returning();
    return row ? mapPosition(row) : null;
  }
}

class PgAppointmentRepository implements AppointmentRepository {
  constructor(private readonly url: string) {}
  async transaction<T>(
    handler: (tx: AppointmentTransaction) => Promise<T>,
  ): Promise<T> {
    const pool = new pg.Pool({ connectionString: this.url, max: 1 });
    try {
      return await drizzle(pool).transaction((db) =>
        handler(new AppointmentTx(db)),
      );
    } finally {
      await pool.end();
    }
  }
}
class AppointmentTx implements AppointmentTransaction {
  constructor(private readonly db: Db) {}
  async create(value: Appointment) {
    const [row] = await this.db.insert(appointment).values(value).returning();
    if (!row) throw new Error("Appointment insert returned no row");
    return mapAppointment(row);
  }
  async findById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(appointment)
      .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, id)))
      .limit(1);
    return row ? mapAppointment(row) : null;
  }
  async list(tenantId: string, status?: AppointmentStatus) {
    const rows = await this.db
      .select()
      .from(appointment)
      .where(
        status
          ? and(
              eq(appointment.tenantId, tenantId),
              eq(appointment.status, status),
            )
          : eq(appointment.tenantId, tenantId),
      )
      .orderBy(asc(appointment.startsAt), asc(appointment.id));
    return rows.map(mapAppointment);
  }
  async listViews(tenantId: string, status?: AppointmentStatus) {
    const rows = await this.db
      .select({
        appointment,
        personName: person.displayName,
        positionTitle: position.title,
        scopeName: organization.name,
      })
      .from(appointment)
      .innerJoin(
        person,
        and(
          eq(person.id, appointment.personId),
          eq(person.tenantId, appointment.tenantId),
        ),
      )
      .innerJoin(
        position,
        and(
          eq(position.id, appointment.positionId),
          eq(position.tenantId, appointment.tenantId),
        ),
      )
      .innerJoin(
        organization,
        and(
          eq(organization.id, appointment.scopeOrgId),
          eq(organization.tenantId, appointment.tenantId),
        ),
      )
      .where(
        status
          ? and(
              eq(appointment.tenantId, tenantId),
              eq(appointment.status, status),
            )
          : eq(appointment.tenantId, tenantId),
      )
      .orderBy(asc(appointment.startsAt), asc(appointment.id));
    return rows.map((row) => ({
      ...mapAppointment(row.appointment),
      personName: row.personName,
      positionTitle: row.positionTitle,
      scopeName: row.scopeName,
    }));
  }
  async update(tenantId: string, id: string, patch: Partial<Appointment>) {
    const [row] = await this.db
      .update(appointment)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(appointment.tenantId, tenantId), eq(appointment.id, id)))
      .returning();
    return row ? mapAppointment(row) : null;
  }
  async activate(
    tenantId: string,
    id: string,
    validatedBy: string,
    validatedAt: Date,
  ) {
    const current = await this.findById(tenantId, id);
    if (current === null || current.status !== "PENDING") return null;
    // All activations for one tenant/position/scope serialize on the same
    // transaction-scoped lock, including requests coming through other Workers.
    await this.db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${current.positionId}:${current.scopeOrgId}`}, 0))`,
    );
    const [configuredPosition] = await this.db
      .select({ holderPolicy: position.holderPolicy })
      .from(position)
      .where(
        and(
          eq(position.tenantId, tenantId),
          eq(position.id, current.positionId),
        ),
      )
      .limit(1);
    if (!configuredPosition)
      throw new ApplicationError(
        "Position introuvable.",
        "POSITION_NOT_FOUND",
        404,
      );
    if (configuredPosition.holderPolicy === "SINGLE") {
      const [conflict] = await this.db
        .select({ id: appointment.id })
        .from(appointment)
        .where(
          and(
            eq(appointment.tenantId, tenantId),
            eq(appointment.positionId, current.positionId),
            eq(appointment.scopeOrgId, current.scopeOrgId),
            eq(appointment.status, "ACTIVE"),
            ne(appointment.id, id),
            sql`${appointment.startsAt} < COALESCE(${current.endsAt}, 'infinity'::timestamptz)`,
            sql`COALESCE(${appointment.endsAt}, 'infinity'::timestamptz) > ${current.startsAt}`,
          ),
        )
        .limit(1);
      if (conflict)
        throw new ApplicationError(
          "Une nomination active chevauche déjà cette fonction et ce périmètre.",
          "APPOINTMENT_SINGLE_HOLDER_CONFLICT",
          409,
        );
    }
    const [row] = await this.db
      .update(appointment)
      .set({
        status: "ACTIVE",
        validatedBy,
        validatedAt,
        updatedAt: validatedAt,
      })
      .where(
        and(
          eq(appointment.tenantId, tenantId),
          eq(appointment.id, id),
          eq(appointment.status, "PENDING"),
        ),
      )
      .returning();
    return row ? mapAppointment(row) : null;
  }
}
function mapPosition(row: typeof position.$inferSelect): Position {
  return {
    ...row,
    allowedScopeTypes: row.allowedScopeTypes as Position["allowedScopeTypes"],
  };
}
function mapAppointment(row: typeof appointment.$inferSelect): Appointment {
  return row;
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { AppointmentUseCases } from "@scouthub/application";
import type { Appointment, Position } from "@scouthub/domain";
import {
  createPgAppointmentRepository,
  createPgPositionRepository,
} from "./governance-repository";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";
const pool = new pg.Pool({ connectionString: databaseUrl });
const tenantId = crypto.randomUUID();
const personA = crypto.randomUUID();
const personB = crypto.randomUUID();
const positionId = crypto.randomUUID();
const scopeId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const now = new Date("2027-01-01T00:00:00Z");
const positionValue: Position = {
  id: positionId,
  tenantId,
  code: "TEST_SINGLE",
  title: "Chef test",
  description: null,
  allowedScopeTypes: ["GROUP"],
  sector: null,
  branch: null,
  holderPolicy: "SINGLE",
  active: true,
  createdAt: now,
  updatedAt: now,
};
const appointmentValue = (id: string, personId: string): Appointment => ({
  id,
  tenantId,
  personId,
  positionId,
  scopeOrgId: scopeId,
  status: "PENDING",
  startsAt: now,
  endsAt: null,
  proposedBy: accountId,
  validatedBy: null,
  rejectedBy: null,
  endedBy: null,
  proposedAt: now,
  validatedAt: null,
  rejectedAt: null,
  endedAt: null,
  rejectionReason: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
});

beforeAll(async () => {
  await pool.query(
    "INSERT INTO organization (id,tenant_id,parent_id,type,name,code,status,path,depth) VALUES ($1::uuid,$1::uuid,NULL,'NSO','Governance test','GOV-' || left($1::text,8),'ACTIVE','/' || $1::text || '/',0)",
    [tenantId],
  );
  await pool.query(
    "INSERT INTO organization (id,tenant_id,parent_id,type,name,code,status,path,depth) VALUES ($1::uuid,$2::uuid,$2::uuid,'REGION','Region test','REG-' || left($1::text,8),'ACTIVE','/' || $2::text || '/' || $1::text || '/',1)",
    [scopeId, tenantId],
  );
  for (const [id, name] of [
    [personA, "Personne A"],
    [personB, "Personne B"],
  ])
    await pool.query(
      "INSERT INTO person (id,tenant_id,first_name,last_name,display_name) VALUES ($1,$2,'Test','Adulte',$3)",
      [id, tenantId, name],
    );
});
afterAll(async () => {
  await pool.query("DELETE FROM appointment WHERE tenant_id=$1", [tenantId]);
  await pool.query("DELETE FROM position WHERE tenant_id=$1", [tenantId]);
  await pool.query("DELETE FROM person WHERE tenant_id=$1", [tenantId]);
  await pool.query("DELETE FROM organization WHERE id=$1", [scopeId]);
  await pool.query("DELETE FROM organization WHERE id=$1", [tenantId]);
  await pool.end();
});

describe("PostgreSQL governance repositories", () => {
  it("creates, lists, reads and updates a Position with tenant isolation", async () => {
    const repository = createPgPositionRepository(databaseUrl);
    const created = await repository.transaction((tx) =>
      tx.create(positionValue),
    );
    expect(created.title).toBe("Chef test");
    expect(
      await repository.transaction((tx) =>
        tx.findById(crypto.randomUUID(), positionId),
      ),
    ).toBeNull();
    await repository.transaction((tx) =>
      tx.update(tenantId, positionId, { active: false }),
    );
    expect(
      (await repository.transaction((tx) => tx.list(tenantId)))[0]?.active,
    ).toBe(false);
    await repository.transaction((tx) =>
      tx.update(tenantId, positionId, { active: true }),
    );
  });
  it("creates, lists and transitions an Appointment with tenant isolation", async () => {
    const repository = createPgAppointmentRepository(databaseUrl);
    const value = appointmentValue(crypto.randomUUID(), personA);
    await repository.transaction((tx) => tx.create(value));
    expect(
      await repository.transaction((tx) =>
        tx.findById(crypto.randomUUID(), value.id),
      ),
    ).toBeNull();
    expect(
      (await repository.transaction((tx) => tx.list(tenantId, "PENDING"))).some(
        (item) => item.id === value.id,
      ),
    ).toBe(true);
    const ended = await repository.transaction((tx) =>
      tx.transition(tenantId, value.id, "PENDING", "REJECTED", {
        rejectedBy: accountId,
        rejectedAt: new Date(),
        rejectionReason: "Motif test",
      }),
    );
    expect(ended?.status).toBe("REJECTED");
    expect(ended?.rejectedBy).toBe(accountId);
    expect(ended?.rejectedAt).not.toBeNull();
    expect(ended?.rejectionReason).toBe("Motif test");
  });
  it("proposes an Appointment for a Person without Account", async () => {
    const cases = new AppointmentUseCases(
      createPgAppointmentRepository(databaseUrl),
    );
    const value = appointmentValue(crypto.randomUUID(), personA);
    await expect(cases.proposeAppointment(value)).resolves.toMatchObject({
      id: value.id,
      personId: personA,
      status: "PENDING",
    });
  });
  it("keeps approve vs reject concurrent transitions compare-and-set safe", async () => {
    const cases = new AppointmentUseCases(
      createPgAppointmentRepository(databaseUrl),
    );
    const value = appointmentValue(crypto.randomUUID(), personA);
    await cases.proposeAppointment(value);
    const results = await Promise.allSettled([
      cases.approveAppointment(tenantId, value.id, crypto.randomUUID()),
      cases.rejectAppointment(tenantId, value.id, crypto.randomUUID(), "Non"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const final = await cases.getAppointment(tenantId, value.id);
    expect(["ACTIVE", "REJECTED"]).toContain(final?.status);
    if (final?.status === "REJECTED") {
      expect(final.rejectionReason).toBe("Non");
      expect(final.rejectedBy).not.toBeNull();
      expect(final.rejectedAt).not.toBeNull();
    }
    if (final?.status === "ACTIVE")
      await cases.endAppointment(tenantId, value.id, crypto.randomUUID());
  });
  it("keeps double end concurrent transitions compare-and-set safe", async () => {
    const cases = new AppointmentUseCases(
      createPgAppointmentRepository(databaseUrl),
    );
    const value = appointmentValue(crypto.randomUUID(), personA);
    await cases.proposeAppointment({
      ...value,
      startsAt: new Date(Date.now() - 60_000),
    });
    await cases.approveAppointment(tenantId, value.id, crypto.randomUUID());
    const results = await Promise.allSettled([
      cases.endAppointment(tenantId, value.id, crypto.randomUUID()),
      cases.endAppointment(tenantId, value.id, crypto.randomUUID()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const final = await cases.getAppointment(tenantId, value.id);
    expect(final?.status).toBe("ENDED");
    expect(final?.endedBy).not.toBeNull();
    expect(final?.endedAt).not.toBeNull();
    expect(final?.endsAt).not.toBeNull();
  });
  it("serializes concurrent SINGLE-holder activation and permits only one overlap", async () => {
    const cases = new AppointmentUseCases(
      createPgAppointmentRepository(databaseUrl),
    );
    const first = appointmentValue(crypto.randomUUID(), personA);
    const second = appointmentValue(crypto.randomUUID(), personB);
    await cases.proposeAppointment(first);
    await cases.proposeAppointment(second);
    const results = await Promise.allSettled([
      cases.approveAppointment(tenantId, first.id, crypto.randomUUID()),
      cases.approveAppointment(tenantId, second.id, crypto.randomUUID()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
});

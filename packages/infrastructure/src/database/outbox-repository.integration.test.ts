import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { createDomainEvent, type DomainEvent } from "@scouthub/domain";
import { describeOutboxRepositoryContract } from "@scouthub/application/testing/outbox-repository-contract";
import { createPgOutboxRepository } from "./outbox-repository";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";

const tenantId = "66666666-6666-4666-8666-666666666666";
const otherTenantId = "77777777-7777-4777-8777-777777777777";
const aggregateId = "88888888-8888-4888-8888-888888888888";
const now = new Date("2026-09-03T12:00:00.000Z");

let sequence = 0;

beforeEach(async () => {
  sequence = 0;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query("TRUNCATE outbox_events");
  } finally {
    await pool.end();
  }
});

describeOutboxRepositoryContract("PostgreSQL", () => createPgOutboxRepository(databaseUrl));

describe("PgOutboxRepository integration", () => {
  it("persists and maps every event field", async () => {
    const repository = createPgOutboxRepository(databaseUrl);
    const appended = event({ payload: { nested: ["safe", 3], enabled: true } });

    await repository.transaction((transaction) => transaction.append(appended));
    const found = await repository.transaction((transaction) =>
      transaction.findById(tenantId, appended.id));

    expect(found).toEqual({
      id: appended.id,
      tenantId,
      aggregateType: appended.aggregateType,
      aggregateId,
      eventType: appended.eventType,
      payload: appended.payload,
      status: "PENDING",
      attempts: 0,
      createdAt: appended.occurredAt,
      processedAt: null
    });
  });

  it("isolates aggregate listings by tenant", async () => {
    const repository = createPgOutboxRepository(databaseUrl);
    const own = event();
    const other = event({ tenantId: otherTenantId });
    await repository.transaction(async (transaction) => {
      await transaction.append(own);
      await transaction.append(other);
    });

    const ownList = await repository.transaction((transaction) =>
      transaction.listByAggregate({ tenantId, aggregateType: "project", aggregateId }));
    const otherList = await repository.transaction((transaction) =>
      transaction.listByAggregate({ tenantId: otherTenantId, aggregateType: "project", aggregateId }));

    expect(ownList.map(({ id }) => id)).toEqual([own.id]);
    expect(otherList.map(({ id }) => id)).toEqual([other.id]);
  });

  it("claims deterministically by created_at then id and respects the limit", async () => {
    const repository = createPgOutboxRepository(databaseUrl);
    const oldest = event({
      id: "00000000-0000-4000-8000-000000000003",
      occurredAt: new Date("2026-09-01T00:00:00.000Z")
    });
    const tiedSecond = event({
      id: "00000000-0000-4000-8000-000000000002",
      occurredAt: new Date("2026-09-02T00:00:00.000Z")
    });
    const tiedFirst = event({
      id: "00000000-0000-4000-8000-000000000001",
      occurredAt: new Date("2026-09-02T00:00:00.000Z")
    });
    await repository.transaction(async (transaction) => {
      await transaction.append(tiedSecond);
      await transaction.append(tiedFirst);
      await transaction.append(oldest);
    });

    const claimed = await repository.transaction((transaction) =>
      transaction.claimBatchForProcessing({ limit: 2, now }));

    expect(claimed.map(({ id }) => id)).toEqual([oldest.id, tiedFirst.id]);
    expect(claimed.every(({ status }) => status === "PROCESSING")).toBe(true);
  });

  it("gives concurrent transactions disjoint batches while locks are held", async () => {
    const repositoryA = createPgOutboxRepository(databaseUrl);
    const repositoryB = createPgOutboxRepository(databaseUrl);
    const events = [event(), event(), event(), event()];
    await repositoryA.transaction(async (transaction) => {
      for (const pending of events) {
        await transaction.append(pending);
      }
    });

    const claimedSignal = deferred<readonly string[]>();
    const releaseA = deferred<void>();
    const transactionA = repositoryA.transaction(async (transaction) => {
      const claimed = await transaction.claimBatchForProcessing({ limit: 2, now });
      claimedSignal.resolve(claimed.map(({ id }) => id));
      await releaseA.promise;
      return claimed;
    });

    const idsA = await claimedSignal.promise;
    const batchB = await repositoryB.transaction((transaction) =>
      transaction.claimBatchForProcessing({ limit: 3, now }));
    releaseA.resolve();
    await transactionA;

    const idsB = batchB.map(({ id }) => id);
    expect(idsA).toHaveLength(2);
    expect(idsB).toHaveLength(2);
    expect(idsA.filter((id) => idsB.includes(id))).toHaveLength(0);
  });

  it("rolls a claim transition back atomically", async () => {
    const repositoryA = createPgOutboxRepository(databaseUrl);
    const repositoryB = createPgOutboxRepository(databaseUrl);
    const pending = event();
    await repositoryA.transaction((transaction) => transaction.append(pending));

    await expect(repositoryA.transaction(async (transaction) => {
      const claimed = await transaction.claimBatchForProcessing({ limit: 1, now });
      expect(claimed[0]?.status).toBe("PROCESSING");
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");

    const reclaimed = await repositoryB.transaction((transaction) =>
      transaction.claimBatchForProcessing({ limit: 1, now }));
    expect(reclaimed.map(({ id }) => id)).toEqual([pending.id]);
  });

  it("enforces success, failure, retry, and terminal lifecycle transitions", async () => {
    const repository = createPgOutboxRepository(databaseUrl);
    const successful = event();
    const retryable = event();
    const untouchedFailure = event();
    await repository.transaction(async (transaction) => {
      await transaction.append(successful);
      await transaction.append(retryable);
      await transaction.append(untouchedFailure);
    });

    await repository.transaction(async (transaction) => {
      expect(await transaction.markSent({ id: successful.id, now })).toBeNull();
      expect(await transaction.markFailed({ id: retryable.id, now })).toBeNull();
      await transaction.claimBatchForProcessing({ limit: 3, now });
    });
    const sent = await repository.transaction((transaction) =>
      transaction.markSent({ id: successful.id, now }));
    const failed = await repository.transaction((transaction) =>
      transaction.markFailed({ id: retryable.id, now }));
    await repository.transaction((transaction) =>
      transaction.markFailed({ id: untouchedFailure.id, now }));

    expect(sent).toMatchObject({ status: "SENT", attempts: 0, processedAt: now });
    expect(failed).toMatchObject({ status: "FAILED", attempts: 1, processedAt: now });
    expect(await repository.transaction((transaction) =>
      transaction.reschedule({ id: successful.id, now }))).toBeNull();

    const rescheduled = await repository.transaction((transaction) =>
      transaction.reschedule({ id: retryable.id, now }));
    expect(rescheduled).toMatchObject({ status: "PENDING", attempts: 1, processedAt: null });

    const reclaimed = await repository.transaction((transaction) =>
      transaction.claimBatchForProcessing({ limit: 10, now }));
    expect(reclaimed.map(({ id }) => id)).toEqual([retryable.id]);
  });

  it("rejects invalid claim limits and invalid dates", async () => {
    const repository = createPgOutboxRepository(databaseUrl);
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      await expect(repository.transaction((transaction) =>
        transaction.claimBatchForProcessing({ limit, now }))).rejects.toThrow(
        "positive integer"
      );
    }
    await expect(repository.transaction((transaction) =>
      transaction.claimBatchForProcessing({ limit: 1, now: new Date(Number.NaN) })))
      .rejects.toThrow("date must be valid");
    await expect(repository.transaction((transaction) =>
      transaction.markSent({ id: crypto.randomUUID(), now: new Date(Number.NaN) })))
      .rejects.toThrow("date must be valid");
  });
});

function event(overrides: Partial<Parameters<typeof createDomainEvent>[0]> = {}): DomainEvent {
  sequence += 1;
  return createDomainEvent({
    id: `99999999-9999-4999-8999-${String(sequence).padStart(12, "0")}`,
    tenantId,
    aggregateType: "project",
    aggregateId,
    eventType: "project.submitted",
    payload: { sequence },
    occurredAt: new Date(now.getTime() + sequence * 1_000),
    ...overrides
  });
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

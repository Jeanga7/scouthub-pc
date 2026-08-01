import { describe, expect, it } from "vitest";
import { createDomainEvent, type DomainEvent } from "@scouthub/domain";
import { OutboxEventBus } from "./event-bus";
import type { OutboxRepository } from "./outbox-repository";

const tenantId = "22222222-2222-4222-8222-222222222222";
const otherTenantId = "44444444-4444-4444-8444-444444444444";
const aggregateId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-08-01T10:00:00.000Z");

let sequence = 0;

function event(overrides: Partial<Parameters<typeof createDomainEvent>[0]> = {}): DomainEvent {
  sequence += 1;
  return createDomainEvent({
    id: `11111111-1111-4111-8111-${String(sequence).padStart(12, "0")}`,
    tenantId,
    aggregateType: "project",
    aggregateId,
    eventType: "project.submitted",
    payload: { sequence },
    occurredAt: new Date(now.getTime() + sequence * 1000),
    ...overrides
  });
}

/**
 * Behaviour every OutboxRepository must exhibit, regardless of backing store.
 *
 * Run against the in-memory fake today; the same suite should be pointed at the
 * PostgreSQL adapter when one is written, so the fake cannot drift from the real
 * implementation.
 */
export function describeOutboxRepositoryContract(
  name: string,
  createRepository: () => OutboxRepository
): void {
  describe(`${name} outbox repository contract`, () => {
    it("appends an event as PENDING with no attempts and no processed_at", async () => {
      const repository = createRepository();
      const appended = event();

      const record = await repository.transaction((transaction) => transaction.append(appended));

      expect(record.status).toBe("PENDING");
      expect(record.attempts).toBe(0);
      expect(record.processedAt).toBeNull();
      expect(record.tenantId).toBe(tenantId);
      expect(record.aggregateType).toBe("project");
      expect(record.aggregateId).toBe(aggregateId);
      expect(record.eventType).toBe("project.submitted");
    });

    it("stores the payload so it survives a JSON round-trip", async () => {
      const repository = createRepository();
      const appended = event({ payload: { nested: { count: 2 }, tags: ["a"], ok: true } });

      const record = await repository.transaction((transaction) => transaction.append(appended));

      expect(record.payload).toEqual({ nested: { count: 2 }, tags: ["a"], ok: true });
      expect(JSON.parse(JSON.stringify(record.payload))).toEqual(record.payload);
    });

    it("reads an event back only within its own tenant", async () => {
      const repository = createRepository();
      const appended = event();
      await repository.transaction((transaction) => transaction.append(appended));

      const found = await repository.transaction((transaction) =>
        transaction.findById(tenantId, appended.id));
      const crossTenant = await repository.transaction((transaction) =>
        transaction.findById(otherTenantId, appended.id));

      expect(found?.id).toBe(appended.id);
      expect(crossTenant).toBeNull();
    });

    it("lists an aggregate's events oldest first and excludes other aggregates", async () => {
      const repository = createRepository();
      const first = event();
      const second = event({ eventType: "project.approved" });
      const elsewhere = event({ aggregateId: "55555555-5555-4555-8555-555555555555" });
      await repository.transaction(async (transaction) => {
        await transaction.append(first);
        await transaction.append(second);
        await transaction.append(elsewhere);
      });

      const listed = await repository.transaction((transaction) =>
        transaction.listByAggregate({ tenantId, aggregateType: "project", aggregateId }));

      expect(listed.map((record) => record.id)).toEqual([first.id, second.id]);
    });

    it("rolls back appended events when the unit of work fails", async () => {
      const repository = createRepository();
      const appended = event();

      await expect(repository.transaction(async (transaction) => {
        await transaction.append(appended);
        throw new Error("business rule failed");
      })).rejects.toThrow("business rule failed");

      const found = await repository.transaction((transaction) =>
        transaction.findById(tenantId, appended.id));
      // The whole point of the outbox: no event without the change that caused it.
      expect(found).toBeNull();
    });

    it("claims pending events oldest first and does not hand them out twice", async () => {
      const repository = createRepository();
      const first = event();
      const second = event();
      await repository.transaction(async (transaction) => {
        await transaction.append(first);
        await transaction.append(second);
      });

      const claimed = await repository.transaction((transaction) =>
        transaction.claimBatchForProcessing({ limit: 1, now }));
      const claimedAgain = await repository.transaction((transaction) =>
        transaction.claimBatchForProcessing({ limit: 10, now }));

      expect(claimed.map((record) => record.id)).toEqual([first.id]);
      expect(claimed[0]?.status).toBe("PROCESSING");
      expect(claimedAgain.map((record) => record.id)).toEqual([second.id]);
    });

    it("settles a claimed event as SENT", async () => {
      const repository = createRepository();
      const appended = event();
      await repository.transaction((transaction) => transaction.append(appended));
      await repository.transaction((transaction) =>
        transaction.claimBatchForProcessing({ limit: 1, now }));

      const sent = await repository.transaction((transaction) =>
        transaction.markSent({ id: appended.id, now }));

      expect(sent?.status).toBe("SENT");
      expect(sent?.processedAt).toEqual(now);
      expect(sent?.attempts).toBe(0);
    });

    it("counts an attempt when an event fails and allows a retry", async () => {
      const repository = createRepository();
      const appended = event();
      await repository.transaction((transaction) => transaction.append(appended));
      await repository.transaction((transaction) =>
        transaction.claimBatchForProcessing({ limit: 1, now }));

      const failed = await repository.transaction((transaction) =>
        transaction.markFailed({ id: appended.id, now }));
      expect(failed?.status).toBe("FAILED");
      expect(failed?.attempts).toBe(1);

      const rescheduled = await repository.transaction((transaction) =>
        transaction.reschedule({ id: appended.id, now }));
      expect(rescheduled?.status).toBe("PENDING");
      // Retrying must not erase the fact that an attempt was already made.
      expect(rescheduled?.attempts).toBe(1);
      expect(rescheduled?.processedAt).toBeNull();
    });

    it("refuses transitions outside the lifecycle", async () => {
      const repository = createRepository();
      const appended = event();
      await repository.transaction((transaction) => transaction.append(appended));

      // Still PENDING: it was never claimed.
      const sent = await repository.transaction((transaction) =>
        transaction.markSent({ id: appended.id, now }));
      expect(sent).toBeNull();

      await repository.transaction((transaction) =>
        transaction.claimBatchForProcessing({ limit: 1, now }));
      await repository.transaction((transaction) =>
        transaction.markSent({ id: appended.id, now }));

      // SENT is terminal.
      const reclaimed = await repository.transaction((transaction) =>
        transaction.claimBatchForProcessing({ limit: 10, now }));
      expect(reclaimed).toHaveLength(0);
      const rescheduled = await repository.transaction((transaction) =>
        transaction.reschedule({ id: appended.id, now }));
      expect(rescheduled).toBeNull();
    });

    it("records events published through the outbox-backed EventBus", async () => {
      const repository = createRepository();
      const first = event();
      const second = event({ eventType: "project.approved" });

      await repository.transaction(async (transaction) => {
        const bus = new OutboxEventBus(transaction);
        await bus.publishAll([first, second]);
      });

      const listed = await repository.transaction((transaction) =>
        transaction.listByAggregate({ tenantId, aggregateType: "project", aggregateId }));
      expect(listed.map((record) => record.eventType)).toEqual([
        "project.submitted",
        "project.approved"
      ]);
      expect(listed.every((record) => record.status === "PENDING")).toBe(true);
    });
  });
}

import { canTransitionOutboxStatus, type DomainEvent, type OutboxEventStatus } from "@scouthub/domain";
import type {
  ClaimOutboxBatchInput,
  OutboxRecord,
  OutboxRepository,
  OutboxTransaction,
  SettleOutboxEventInput
} from "./outbox-repository";

/**
 * In-memory OutboxRepository used to exercise the port contract without a
 * database. Not a production implementation: it has no durability and its
 * "transaction" only rolls back the rows this repository owns.
 */
export class InMemoryOutboxRepository implements OutboxRepository, OutboxTransaction {
  readonly records = new Map<string, OutboxRecord>();
  appendCalls = 0;
  transactionCalls = 0;

  async transaction<TResult>(
    handler: (transaction: OutboxTransaction) => Promise<TResult>
  ): Promise<TResult> {
    this.transactionCalls += 1;
    const snapshot = new Map(this.records);
    try {
      return await handler(this);
    } catch (error) {
      // Mirror the atomicity the real adapter gets from PostgreSQL, so a
      // contract test can assert that a failed unit of work leaves no event.
      this.records.clear();
      for (const [id, record] of snapshot) {
        this.records.set(id, record);
      }
      throw error;
    }
  }

  append(event: DomainEvent): Promise<OutboxRecord> {
    this.appendCalls += 1;
    if (this.records.has(event.id)) {
      return Promise.reject(new Error(`Outbox event ${event.id} already exists.`));
    }
    const record: OutboxRecord = {
      id: event.id,
      tenantId: event.tenantId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload,
      status: "PENDING",
      attempts: 0,
      createdAt: event.occurredAt,
      processedAt: null
    };
    this.records.set(record.id, record);
    return Promise.resolve(record);
  }

  findById(tenantId: string, id: string): Promise<OutboxRecord | null> {
    const record = this.records.get(id);
    return Promise.resolve(record === undefined || record.tenantId !== tenantId ? null : record);
  }

  listByAggregate(input: {
    readonly tenantId: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
  }): Promise<readonly OutboxRecord[]> {
    return Promise.resolve(this.ordered().filter((record) =>
      record.tenantId === input.tenantId &&
      record.aggregateType === input.aggregateType &&
      record.aggregateId === input.aggregateId));
  }

  claimBatchForProcessing(input: ClaimOutboxBatchInput): Promise<readonly OutboxRecord[]> {
    const claimed: OutboxRecord[] = [];
    for (const record of this.ordered()) {
      if (claimed.length >= input.limit) {
        break;
      }
      if (record.status !== "PENDING") {
        continue;
      }
      claimed.push(this.write({ ...record, status: "PROCESSING" }));
    }
    return Promise.resolve(claimed);
  }

  markSent(input: SettleOutboxEventInput): Promise<OutboxRecord | null> {
    return Promise.resolve(this.settle(input, "SENT", (record) => ({
      ...record,
      status: "SENT",
      processedAt: input.now
    })));
  }

  markFailed(input: SettleOutboxEventInput): Promise<OutboxRecord | null> {
    return Promise.resolve(this.settle(input, "FAILED", (record) => ({
      ...record,
      status: "FAILED",
      attempts: record.attempts + 1,
      processedAt: input.now
    })));
  }

  reschedule(input: SettleOutboxEventInput): Promise<OutboxRecord | null> {
    return Promise.resolve(this.settle(input, "PENDING", (record) => ({
      ...record,
      status: "PENDING",
      processedAt: null
    })));
  }

  private settle(
    input: SettleOutboxEventInput,
    to: OutboxEventStatus,
    apply: (record: OutboxRecord) => OutboxRecord
  ): OutboxRecord | null {
    const record = this.records.get(input.id);
    if (record === undefined || !canTransitionOutboxStatus(record.status, to)) {
      return null;
    }
    return this.write(apply(record));
  }

  private write(record: OutboxRecord): OutboxRecord {
    this.records.set(record.id, record);
    return record;
  }

  private ordered(): OutboxRecord[] {
    return [...this.records.values()].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
    );
  }
}

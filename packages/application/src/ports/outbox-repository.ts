import type { DomainEvent, EventPayload, OutboxEventStatus } from "@scouthub/domain";

export interface OutboxRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: EventPayload;
  readonly status: OutboxEventStatus;
  readonly attempts: number;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
}

export interface ClaimOutboxBatchInput {
  readonly limit: number;
  readonly now: Date;
}

export interface SettleOutboxEventInput {
  readonly id: string;
  readonly now: Date;
}

/**
 * Write side of the outbox, scoped to a caller's unit of work.
 *
 * `append` must run inside the same transaction as the business change that
 * produced the event. That is the whole point of the pattern: either the
 * aggregate change and its event both commit, or neither does. A port that
 * allowed appending outside a transaction would let the two drift apart.
 */
export interface OutboxTransaction {
  append(event: DomainEvent): Promise<OutboxRecord>;
  findById(tenantId: string, id: string): Promise<OutboxRecord | null>;
  listByAggregate(input: {
    readonly tenantId: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
  }): Promise<readonly OutboxRecord[]>;

  /**
   * Moves up to `limit` PENDING rows to PROCESSING and returns them, oldest
   * first. Implementations must make the claim exclusive so two dispatchers
   * cannot take the same row.
   *
   * Unused in Slice 6: no dispatcher exists yet.
   */
  claimBatchForProcessing(input: ClaimOutboxBatchInput): Promise<readonly OutboxRecord[]>;

  /** PROCESSING -> SENT. Stamps `processed_at`. */
  markSent(input: SettleOutboxEventInput): Promise<OutboxRecord | null>;

  /** PROCESSING -> FAILED. Increments `attempts` and stamps `processed_at`. */
  markFailed(input: SettleOutboxEventInput): Promise<OutboxRecord | null>;

  /** FAILED -> PENDING, so a failed event can be retried. */
  reschedule(input: SettleOutboxEventInput): Promise<OutboxRecord | null>;
}

export interface OutboxRepository {
  transaction<TResult>(handler: (transaction: OutboxTransaction) => Promise<TResult>): Promise<TResult>;
}

import type { DomainEvent } from "@scouthub/domain";
import type { OutboxTransaction } from "./outbox-repository";

/**
 * Publishes domain events without telling the caller how they travel.
 *
 * Use cases depend on this, never on the outbox or on a queue client. In
 * Slice 6 the only implementation writes to the outbox table, so "publish"
 * means "durably recorded, delivery to follow". When a dispatcher and a real
 * transport arrive, callers do not change.
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: readonly DomainEvent[]): Promise<void>;
}

/**
 * EventBus backed by the outbox, bound to an open transaction.
 *
 * It is constructed per unit of work rather than injected as a singleton,
 * because an event is only meaningful if it commits with the change that
 * caused it.
 */
export class OutboxEventBus implements EventBus {
  constructor(private readonly transaction: OutboxTransaction) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.transaction.append(event);
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    // Sequential on purpose: the rows share a transaction, and ordering by
    // insertion keeps `created_at` consistent with the order the aggregate
    // produced them in.
    for (const event of events) {
      await this.transaction.append(event);
    }
  }
}

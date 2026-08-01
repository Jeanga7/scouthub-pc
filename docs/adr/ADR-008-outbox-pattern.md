# ADR-008: Transactional Outbox

## Status

Accepted for Slice 6, Async Foundation.

## Context

Slices 3 to 5 left work that cannot happen inside the request that triggers it: expired temporary upload cleanup, orphaned object cleanup, and eventually notifications when a Project is submitted, approved or has changes requested. ADR-007 explicitly deferred all of it to Slice 6.

The naive approach is to call the side effect directly from the use case, after the transaction commits. That loses work: a crash, a deploy or a timeout between commit and call leaves the database changed and the effect never performed, with nothing recording that it was owed. The inverse ordering is worse — the effect fires and the transaction then rolls back, so a notification describes something that never happened.

PostgreSQL and any external transport are not atomic together, exactly as PostgreSQL and R2 are not. Slice 5 solved that case by ordering operations so no state is destroyed on failure. That reasoning does not extend to sending a message: sending cannot be undone.

## Decision

ScoutHub-PC records domain events in a transactional outbox.

A use case that changes an aggregate appends its events to `outbox_events` **inside the same transaction** as the change. Either both commit or neither does. The event row is the durable record that work is owed. A separate dispatcher, added later, reads pending rows and performs the delivery.

The write path is expressed through ports:

- `DomainEvent` (domain) — an immutable fact: id, tenant, aggregate type and id, event type, JSON payload, occurrence time.
- `EventBus` (application) — how a use case publishes. It never mentions the outbox, a queue or a transport.
- `OutboxRepository` / `OutboxTransaction` (application) — how events are persisted, claimed and settled.

`OutboxEventBus` is the only `EventBus` implementation in Slice 6 and is constructed per unit of work, bound to an open transaction. A singleton bus would let an event commit independently of the change that produced it, which is the failure this ADR exists to prevent.

Layering follows the existing slices: domain has no Drizzle import, application has no PostgreSQL import, and the schema lives in `database/schema`.

### Event identity and shape

Event types are `aggregate.verb_past_tense` (`project.submitted`, `evidence.upload_confirmed`). Aggregate types are lowercase identifiers. Both are enforced in the domain and again as CHECK constraints, so a malformed type cannot reach a future consumer's routing table.

Payloads are validated as JSON-safe at construction. A value that cannot survive a JSONB round-trip — `undefined`, a function, a `BigInt`, `NaN`, a circular reference — is rejected at the call site, while the business transaction is still open and the caller can still react. Discovering it at flush time would mean the aggregate has already committed and its event is permanently unpublishable. `Date` is rejected rather than coerced, so a consumer never receives an ISO string where the producer believed it sent a date.

### Status lifecycle

```text
PENDING --claim--> PROCESSING --success--> SENT
                        |
                        +---failure------> FAILED --retry--> PENDING
```

`SENT` is terminal. `attempts` lives on the row rather than being inferred from status, so a retry does not erase the record of earlier failures — that count is what a future backoff or dead-letter policy will read.

Slice 6 ships no dispatcher, so in practice nothing leaves `PENDING` yet. The transitions are defined and tested now so the repository contract describes the real lifecycle instead of being widened once a consumer appears.

## Why not a queue now

A queue is a transport, not a source of truth, and adding one first would not solve the problem this ADR addresses. Publishing to Cloudflare Queues from inside a PostgreSQL transaction has the same atomicity gap as calling an API directly: the queue accepts the message and the transaction then rolls back, or the transaction commits and the publish fails. An outbox is required either way, so it is built first.

Concretely:

- The outbox is the durable record. A queue would be an optimization of *how fast* rows leave it, not a replacement for having them.
- ADR-002 commits to a zero-cost pilot. Queues, Durable Objects and scheduled Workers add recurring cost and operational surface for a system with no consumers yet.
- A queue's delivery semantics only matter once something consumes events. Choosing that transport before a single consumer exists would fix a decision on no evidence.

The same reasoning defers Cron triggers, a Redis queue, production Workers, retries with backoff, and dead-letter handling. The `AsyncQueue` port already present in the application layer stays unused; when a transport is chosen, the dispatcher will sit between the outbox and that port.

## Relation to Slice 6

This is the first commit of Slice 6 and deliberately has no business consumers. It establishes the table, the abstractions and the contract. Later work in the slice builds on it:

- a PostgreSQL `OutboxRepository` adapter, verified against the same contract suite that the in-memory fake passes today;
- a dispatcher that claims batches and settles them;
- producers in existing use cases, emitting events for Project workflow transitions and Evidence lifecycle;
- the deferred cleanup jobs ADR-007 assigned to Slice 6.

Nothing outside this ADR's scope is introduced: no notifications, no email, no SMS, no external integrations.

## Consequences

Delivery is at-least-once. A dispatcher can crash between performing an effect and marking the row `SENT`, so the same event may be delivered twice. Consumers must be idempotent. This is accepted: the alternative, at-most-once, silently loses work, which is the failure mode this pattern exists to remove.

Events are visible only after the producing transaction commits, so delivery latency is at least the dispatcher's polling interval. That is acceptable for cleanup and notification, and is the trade for not losing work.

`outbox_events` grows without bound until a retention policy exists. Settled rows are retained for now as an audit trail of what was dispatched; pruning belongs with the dispatcher that creates the volume.

## Migration note

Migration `0000` created a placeholder `outbox_event` table with an `outbox_status` enum. It was never read or written by any code. Slice 6 drops it (`0006`) and creates `outbox_events` with the real shape (`0007`), rather than leaving two competing outbox tables in the schema. Nothing is at risk because the placeholder never held rows.

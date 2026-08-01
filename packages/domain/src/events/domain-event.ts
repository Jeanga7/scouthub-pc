import { EventDomainError } from "./event-errors";

/** JSON values a payload may contain once serialized. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type EventPayload = { readonly [key: string]: JsonValue };

/**
 * Something that happened, expressed in the language of the domain.
 *
 * A DomainEvent is a fact: it is named in the past tense, it is immutable, and
 * it carries the tenant and aggregate it belongs to so a consumer can route it
 * without loading the aggregate. It knows nothing about how it will be stored
 * or delivered — persistence is the outbox's concern, delivery is a future
 * dispatcher's.
 */
export interface DomainEvent<TPayload extends EventPayload = EventPayload> {
  readonly id: string;
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
}

const eventTypePattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const aggregateTypePattern = /^[a-z][a-z0-9_]*$/;

export function normalizeAggregateType(value: string): string {
  const aggregateType = value.trim().toLowerCase();
  if (!aggregateTypePattern.test(aggregateType)) {
    throw new EventDomainError(
      "Aggregate type must be a lowercase snake_case identifier.",
      "EVENT_AGGREGATE_TYPE_INVALID"
    );
  }
  return aggregateType;
}

/**
 * Event types are `aggregate.verb_past_tense`, for example `project.submitted`
 * or `evidence.upload_confirmed`. The shape is enforced here so consumers can
 * rely on it for routing once they exist.
 */
export function normalizeEventType(value: string): string {
  const eventType = value.trim().toLowerCase();
  if (!eventTypePattern.test(eventType)) {
    throw new EventDomainError(
      "Event type must look like 'aggregate.verb_past_tense'.",
      "EVENT_TYPE_INVALID"
    );
  }
  return eventType;
}

/**
 * Returns a structurally cloned, JSON-safe copy of the payload.
 *
 * The outbox stores payloads as JSONB, so a value that cannot survive a
 * round-trip must be rejected at construction rather than at flush time: by
 * then the business transaction has already committed and the event would be
 * silently unpublishable. Dates are rejected rather than coerced, because a
 * consumer reading an ISO string it did not expect is worse than a loud failure
 * at the call site.
 */
export function serializeEventPayload(payload: unknown): EventPayload {
  const serialized = toJsonValue(payload, new WeakSet(), "payload");
  if (typeof serialized !== "object" || serialized === null || Array.isArray(serialized)) {
    throw new EventDomainError("Event payload must be a plain object.", "EVENT_PAYLOAD_INVALID");
  }
  return serialized as EventPayload;
}

function toJsonValue(value: unknown, seen: WeakSet<object>, path: string): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EventDomainError(
        `Event payload at ${path} must be a finite number.`,
        "EVENT_PAYLOAD_INVALID"
      );
    }
    return value;
  }
  if (typeof value !== "object") {
    // undefined, function, symbol and bigint have no JSONB representation.
    throw new EventDomainError(
      `Event payload at ${path} is not JSON-serializable.`,
      "EVENT_PAYLOAD_INVALID"
    );
  }
  if (seen.has(value)) {
    throw new EventDomainError(
      `Event payload at ${path} contains a circular reference.`,
      "EVENT_PAYLOAD_INVALID"
    );
  }
  if (value instanceof Date) {
    throw new EventDomainError(
      `Event payload at ${path} must not contain a Date; pass an ISO string.`,
      "EVENT_PAYLOAD_INVALID"
    );
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => toJsonValue(entry, seen, `${path}[${index}]`));
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of entries) {
      // An explicit undefined would vanish through JSONB, changing the payload
      // shape a consumer sees. Reject instead of dropping it.
      result[key] = toJsonValue(entry, seen, `${path}.${key}`);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export interface CreateDomainEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly occurredAt: Date;
}

export function createDomainEvent(input: CreateDomainEventInput): DomainEvent {
  requireIdentifier(input.id, "EVENT_ID_REQUIRED");
  requireIdentifier(input.tenantId, "EVENT_TENANT_REQUIRED");
  requireIdentifier(input.aggregateId, "EVENT_AGGREGATE_ID_REQUIRED");
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new EventDomainError("Event occurredAt must be a valid date.", "EVENT_OCCURRED_AT_INVALID");
  }
  return {
    id: input.id,
    tenantId: input.tenantId,
    aggregateType: normalizeAggregateType(input.aggregateType),
    aggregateId: input.aggregateId,
    eventType: normalizeEventType(input.eventType),
    payload: serializeEventPayload(input.payload),
    occurredAt: new Date(input.occurredAt.getTime())
  };
}

function requireIdentifier(value: string, code: string): void {
  if (value.trim().length === 0) {
    throw new EventDomainError("Event identifier is required.", code);
  }
}

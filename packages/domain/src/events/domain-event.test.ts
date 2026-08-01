import { describe, expect, it } from "vitest";
import {
  canTransitionOutboxStatus,
  createDomainEvent,
  EventDomainError,
  normalizeAggregateType,
  normalizeEventType,
  outboxEventStatuses,
  serializeEventPayload
} from "../index";

const baseInput = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  aggregateType: "project",
  aggregateId: "33333333-3333-4333-8333-333333333333",
  eventType: "project.submitted",
  payload: { projectId: "33333333-3333-4333-8333-333333333333", version: 3 },
  occurredAt: new Date("2026-08-01T10:00:00.000Z")
};

describe("domain event creation", () => {
  it("creates an event carrying tenant and aggregate routing", () => {
    const event = createDomainEvent(baseInput);

    expect(event.tenantId).toBe(baseInput.tenantId);
    expect(event.aggregateType).toBe("project");
    expect(event.aggregateId).toBe(baseInput.aggregateId);
    expect(event.eventType).toBe("project.submitted");
    expect(event.payload).toEqual({ projectId: baseInput.aggregateId, version: 3 });
  });

  it("copies occurredAt so a later mutation cannot rewrite history", () => {
    const occurredAt = new Date("2026-08-01T10:00:00.000Z");
    const event = createDomainEvent({ ...baseInput, occurredAt });

    occurredAt.setFullYear(2030);

    expect(event.occurredAt.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("normalizes aggregate and event types", () => {
    expect(normalizeAggregateType("  Project ")).toBe("project");
    expect(normalizeEventType(" Project.Submitted ")).toBe("project.submitted");
  });

  it("rejects event types that are not aggregate.verb_past_tense", () => {
    for (const invalid of ["submitted", "project.", ".submitted", "project-submitted", "Project Submitted", ""]) {
      expect(() => normalizeEventType(invalid)).toThrow(EventDomainError);
    }
    expect(normalizeEventType("evidence.upload_confirmed")).toBe("evidence.upload_confirmed");
  });

  it("rejects aggregate types that are not lowercase identifiers", () => {
    for (const invalid of ["", "9project", "project.child", "project-child"]) {
      expect(() => normalizeAggregateType(invalid)).toThrow(EventDomainError);
    }
  });

  it("requires identifiers and a valid occurredAt", () => {
    expect(() => createDomainEvent({ ...baseInput, id: "  " })).toThrow(EventDomainError);
    expect(() => createDomainEvent({ ...baseInput, tenantId: "" })).toThrow(EventDomainError);
    expect(() => createDomainEvent({ ...baseInput, aggregateId: "" })).toThrow(EventDomainError);
    expect(() => createDomainEvent({ ...baseInput, occurredAt: new Date("nope") })).toThrow(EventDomainError);
  });
});

describe("event payload serialization", () => {
  it("keeps nested JSON structures intact", () => {
    const payload = serializeEventPayload({
      projectId: "p-1",
      counts: { evidence: 2, comments: 0 },
      tags: ["a", "b"],
      approved: true,
      reviewer: null
    });

    expect(payload).toEqual({
      projectId: "p-1",
      counts: { evidence: 2, comments: 0 },
      tags: ["a", "b"],
      approved: true,
      reviewer: null
    });
  });

  it("survives a JSONB round-trip unchanged", () => {
    const payload = serializeEventPayload(baseInput.payload);

    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("returns a detached copy so later mutation cannot alter a stored event", () => {
    const source = { nested: { value: 1 } };
    const payload = serializeEventPayload(source) as { nested: { value: number } };

    source.nested.value = 99;

    expect(payload.nested.value).toBe(1);
  });

  it("rejects values with no JSONB representation", () => {
    // Each of these would either be dropped or silently coerced by JSON.stringify,
    // changing the payload a consumer receives.
    expect(() => serializeEventPayload({ fn: () => undefined })).toThrow(EventDomainError);
    expect(() => serializeEventPayload({ missing: undefined })).toThrow(EventDomainError);
    expect(() => serializeEventPayload({ big: BigInt(1) })).toThrow(EventDomainError);
    expect(() => serializeEventPayload({ sym: Symbol("s") })).toThrow(EventDomainError);
    expect(() => serializeEventPayload({ nan: Number.NaN })).toThrow(EventDomainError);
    expect(() => serializeEventPayload({ inf: Number.POSITIVE_INFINITY })).toThrow(EventDomainError);
  });

  it("rejects Dates rather than silently turning them into strings", () => {
    expect(() => serializeEventPayload({ at: new Date() })).toThrow(EventDomainError);
    // The caller is expected to be explicit instead.
    expect(serializeEventPayload({ at: new Date("2026-08-01T10:00:00.000Z").toISOString() }))
      .toEqual({ at: "2026-08-01T10:00:00.000Z" });
  });

  it("rejects circular references instead of overflowing the stack", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    expect(() => serializeEventPayload(circular)).toThrow(EventDomainError);
  });

  it("requires the payload root to be a plain object", () => {
    expect(() => serializeEventPayload(["a"])).toThrow(EventDomainError);
    expect(() => serializeEventPayload("a")).toThrow(EventDomainError);
    expect(() => serializeEventPayload(null)).toThrow(EventDomainError);
  });
});

describe("outbox status lifecycle", () => {
  it("exposes the four statuses", () => {
    expect(outboxEventStatuses).toEqual(["PENDING", "PROCESSING", "SENT", "FAILED"]);
  });

  it("allows only the dispatcher lifecycle transitions", () => {
    expect(canTransitionOutboxStatus("PENDING", "PROCESSING")).toBe(true);
    expect(canTransitionOutboxStatus("PROCESSING", "SENT")).toBe(true);
    expect(canTransitionOutboxStatus("PROCESSING", "FAILED")).toBe(true);
    expect(canTransitionOutboxStatus("FAILED", "PENDING")).toBe(true);
  });

  it("treats SENT as terminal and forbids skipping PROCESSING", () => {
    expect(canTransitionOutboxStatus("SENT", "PENDING")).toBe(false);
    expect(canTransitionOutboxStatus("SENT", "PROCESSING")).toBe(false);
    expect(canTransitionOutboxStatus("PENDING", "SENT")).toBe(false);
    expect(canTransitionOutboxStatus("PENDING", "FAILED")).toBe(false);
  });
});

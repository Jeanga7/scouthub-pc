import { describe, expect, it } from "vitest";
import {
  createProjectSubmittedForReviewEvent,
  EventDomainError,
  projectAggregateType,
  projectSubmittedForReviewEventType
} from "../index";

const input = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  actorId: "44444444-4444-4444-8444-444444444444",
  occurredAt: new Date("2026-08-01T10:00:00.000Z")
};

describe("project.submitted_for_review event", () => {
  it("routes on the project aggregate", () => {
    const event = createProjectSubmittedForReviewEvent(input);

    expect(event.aggregateType).toBe(projectAggregateType);
    expect(event.aggregateType).toBe("project");
    expect(event.aggregateId).toBe(input.projectId);
    expect(event.eventType).toBe(projectSubmittedForReviewEventType);
    expect(event.eventType).toBe("project.submitted_for_review");
  });

  it("carries tenant and occurrence on the envelope", () => {
    const event = createProjectSubmittedForReviewEvent(input);

    expect(event.tenantId).toBe(input.tenantId);
    expect(event.occurredAt.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("carries the project and actor in the payload", () => {
    const event = createProjectSubmittedForReviewEvent(input);

    expect(event.payload).toEqual({
      projectId: input.projectId,
      actorId: input.actorId
    });
  });

  it("produces a payload that survives a JSONB round-trip", () => {
    const event = createProjectSubmittedForReviewEvent(input);

    expect(JSON.parse(JSON.stringify(event.payload))).toEqual(event.payload);
  });

  it("validates identifiers like any other domain event", () => {
    expect(() => createProjectSubmittedForReviewEvent({ ...input, tenantId: "" }))
      .toThrow(EventDomainError);
    expect(() => createProjectSubmittedForReviewEvent({ ...input, projectId: " " }))
      .toThrow(EventDomainError);
    expect(() => createProjectSubmittedForReviewEvent({ ...input, occurredAt: new Date("nope") }))
      .toThrow(EventDomainError);
  });

  it("copies occurredAt so a later mutation cannot rewrite the event", () => {
    const occurredAt = new Date("2026-08-01T10:00:00.000Z");
    const event = createProjectSubmittedForReviewEvent({ ...input, occurredAt });

    occurredAt.setFullYear(2030);

    expect(event.occurredAt.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });
});

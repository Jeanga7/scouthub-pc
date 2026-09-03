import { createDomainEvent, type DomainEvent } from "./domain-event";

export const projectAggregateType = "project";
export const projectSubmittedForReviewEventType = "project.submitted_for_review";

// A type alias, not an interface: EventPayload is an index signature, and an
// interface does not satisfy one implicitly.
export type ProjectSubmittedForReviewPayload = {
  readonly projectId: string;
  readonly actorId: string;
};

export type ProjectSubmittedForReviewEvent = DomainEvent<ProjectSubmittedForReviewPayload>;

/**
 * Emitted when a Project leaves DRAFT or CHANGES_REQUESTED for READY_FOR_REVIEW.
 *
 * `tenantId` and `occurredAt` are envelope fields on every DomainEvent, not
 * payload entries: a consumer already receives them, and `occurredAt` could not
 * live in the payload anyway because payloads reject `Date` rather than coercing
 * it to a string. The payload therefore carries only what the envelope does not.
 */
export function createProjectSubmittedForReviewEvent(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly occurredAt: Date;
}): ProjectSubmittedForReviewEvent {
  const payload: ProjectSubmittedForReviewPayload = {
    projectId: input.projectId,
    actorId: input.actorId
  };
  // Built through createDomainEvent so identifiers, the event-type shape and
  // payload serializability are validated exactly as for any other event.
  const event = createDomainEvent({
    id: input.id,
    tenantId: input.tenantId,
    aggregateType: projectAggregateType,
    aggregateId: input.projectId,
    eventType: projectSubmittedForReviewEventType,
    payload,
    occurredAt: input.occurredAt
  });
  return { ...event, payload };
}

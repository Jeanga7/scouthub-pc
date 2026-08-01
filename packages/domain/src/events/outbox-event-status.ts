export const outboxEventStatuses = ["PENDING", "PROCESSING", "SENT", "FAILED"] as const;

export type OutboxEventStatus = (typeof outboxEventStatuses)[number];

/**
 * Transitions an outbox row may take.
 *
 * PENDING is the only state a freshly appended event holds. A dispatcher claims
 * it into PROCESSING, then settles it as SENT or FAILED. FAILED is not terminal:
 * a retry moves it back to PENDING, which is why `attempts` is tracked on the
 * row rather than inferred from the status.
 *
 * Slice 6 ships no dispatcher, so nothing leaves PENDING yet. The map exists so
 * the repository contract can be written and tested against the real lifecycle
 * instead of being widened later.
 */
const allowedTransitions: Record<OutboxEventStatus, readonly OutboxEventStatus[]> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["SENT", "FAILED"],
  SENT: [],
  FAILED: ["PENDING"]
};

export function canTransitionOutboxStatus(
  from: OutboxEventStatus,
  to: OutboxEventStatus
): boolean {
  return allowedTransitions[from].includes(to);
}

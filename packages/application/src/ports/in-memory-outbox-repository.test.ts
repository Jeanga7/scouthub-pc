import { describe, expect, it } from "vitest";
import { createDomainEvent } from "@scouthub/domain";
import { InMemoryOutboxRepository } from "./in-memory-outbox-repository";
import { describeOutboxRepositoryContract } from "./outbox-repository.contract";

describeOutboxRepositoryContract("in-memory", () => new InMemoryOutboxRepository());

describe("in-memory outbox repository specifics", () => {
  it("rejects appending the same event id twice", async () => {
    const repository = new InMemoryOutboxRepository();
    const event = createDomainEvent({
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      aggregateType: "project",
      aggregateId: "33333333-3333-4333-8333-333333333333",
      eventType: "project.submitted",
      payload: {},
      occurredAt: new Date("2026-08-01T10:00:00.000Z")
    });

    await repository.transaction((transaction) => transaction.append(event));

    await expect(repository.transaction((transaction) => transaction.append(event)))
      .rejects.toThrow("already exists");
    expect(repository.records.size).toBe(1);
  });
});

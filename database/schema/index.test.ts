import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { outboxEvents } from "./index";

describe("outbox schema", () => {
  it("exposes the outbox_events table", () => {
    expect(outboxEvents).toBeDefined();
    expect(getTableConfig(outboxEvents).name).toBe("outbox_events");
  });

  it("carries tenant and aggregate routing columns", () => {
    const columns = getTableConfig(outboxEvents).columns.map((column) => column.name);

    expect(columns).toEqual(expect.arrayContaining([
      "id",
      "tenant_id",
      "aggregate_type",
      "aggregate_id",
      "event_type",
      "payload",
      "status",
      "attempts",
      "created_at",
      "processed_at"
    ]));
  });

  it("indexes the tenant, the dispatcher claim and the aggregate lookup", () => {
    const indexes = getTableConfig(outboxEvents).indexes.map((index) => index.config.name);

    expect(indexes).toEqual(expect.arrayContaining([
      "outbox_events_tenant_idx",
      "outbox_events_status_created_at_idx",
      "outbox_events_aggregate_idx"
    ]));
  });

  it("defaults a new event to PENDING with no attempts and no processed_at", () => {
    const columns = getTableConfig(outboxEvents).columns;
    const status = columns.find((column) => column.name === "status");
    const attempts = columns.find((column) => column.name === "attempts");
    const processedAt = columns.find((column) => column.name === "processed_at");

    expect(status?.default).toBe("PENDING");
    expect(status?.notNull).toBe(true);
    expect(attempts?.default).toBe(0);
    expect(attempts?.notNull).toBe(true);
    // Nullable: an unprocessed event has no processing timestamp.
    expect(processedAt?.notNull).toBe(false);
  });
});

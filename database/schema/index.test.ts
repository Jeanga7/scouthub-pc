import { describe, expect, it } from "vitest";
import { outboxEvent } from "./index";

describe("phase 0 database schema", () => {
  it("exposes the outbox_event technical table", () => {
    expect(outboxEvent).toBeDefined();
  });
});

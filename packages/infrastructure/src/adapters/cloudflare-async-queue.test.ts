import { describe, expect, it, vi } from "vitest";
import { createCloudflareAsyncQueueAdapter } from "./cloudflare-async-queue";
import type { CloudflareAsyncQueueBinding } from "./cloudflare-async-queue";

describe("createCloudflareAsyncQueueAdapter", () => {
  it("forwards the message and supported delay option only", async () => {
    const send = vi.fn<CloudflareAsyncQueueBinding["send"]>();
    const queue = createCloudflareAsyncQueueAdapter({ send });

    const message = {
      id: "msg_phase0",
      type: "phase0.test",
      payload: { ok: true }
    };

    await queue.enqueue(message, { delaySeconds: 30 });

    expect(send).toHaveBeenCalledWith(message, { delaySeconds: 30 });
  });
});

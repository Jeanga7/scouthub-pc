import type { AsyncQueue, QueueMessage } from "@scouthub/application";

export interface CloudflareAsyncQueueBinding {
  send(message: QueueMessage, options?: { delaySeconds?: number }): Promise<void>;
}

export function createCloudflareAsyncQueueAdapter(
  queue: CloudflareAsyncQueueBinding
): AsyncQueue {
  return {
    async enqueue(message, options) {
      await queue.send(message, {
        delaySeconds: options?.delaySeconds
      });
    }
  };
}

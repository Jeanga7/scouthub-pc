export interface QueueMessage<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
}

export interface EnqueueOptions {
  readonly delaySeconds?: number;
}

export interface AsyncQueue {
  enqueue<TPayload>(
    message: QueueMessage<TPayload>,
    options?: EnqueueOptions
  ): Promise<void>;
}

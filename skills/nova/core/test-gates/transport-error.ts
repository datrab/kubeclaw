export class RemotePlanTransportError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'RemotePlanTransportError'; this.retryable = retryable;
  }
}

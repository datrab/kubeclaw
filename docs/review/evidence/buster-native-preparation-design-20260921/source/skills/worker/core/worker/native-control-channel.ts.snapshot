import { Duplex } from 'node:stream';

export interface NativeWorkerControlLimits {
  readonly maximumMessageBytes: number;
  readonly maximumSessionBytes: number;
}

export function validateNativeWorkerControlLimits(limits: NativeWorkerControlLimits): void {
  if ([limits.maximumMessageBytes, limits.maximumSessionBytes].some(value => !Number.isSafeInteger(value) || value < 1)
    || limits.maximumMessageBytes > 0xffffffff || limits.maximumMessageBytes > limits.maximumSessionBytes) {
    throw new Error('WORKER_NATIVE_CONTROL_CONFIG_INVALID');
  }
}

/** Bounded binary framing only. Roles own message meaning and durable phase acknowledgment. */
export class NativeWorkerControlChannel {
  readonly #stream: Duplex;
  readonly #limits: NativeWorkerControlLimits;
  #sent = 0;
  #received = 0;
  #reading = false;
  #closed = false;
  #writes: Promise<void> = Promise.resolve();

  constructor(stream: unknown, limits: NativeWorkerControlLimits) {
    validateNativeWorkerControlLimits(limits);
    if (!(stream instanceof Duplex)) throw new Error('WORKER_NATIVE_CONTROL_CONFIG_INVALID');
    this.#stream = stream; this.#limits = { ...limits };
    // Read/write operations retain the failure; a closed pipe must not become an uncaught event.
    stream.on('error', () => {});
  }

  send(input: Uint8Array): Promise<void> {
    if (this.#closed) return Promise.reject(new Error('WORKER_NATIVE_CONTROL_CLOSED'));
    if (!input.byteLength || input.byteLength > this.#limits.maximumMessageBytes
      || this.#sent + input.byteLength + 4 > this.#limits.maximumSessionBytes) return Promise.reject(new Error('WORKER_NATIVE_CONTROL_OUTPUT_LIMIT'));
    const bytes = Buffer.from(input);
    this.#sent += bytes.byteLength + 4;
    const header = Buffer.alloc(4); header.writeUInt32BE(bytes.byteLength);
    const operation = this.#writes.then(() => new Promise<void>((resolve, reject) => {
      this.#stream.write(Buffer.concat([header, bytes]), error => { if (error) reject(error); else resolve(); });
    }));
    this.#writes = operation; void operation.catch(() => {}); return operation;
  }

  async *messages(): AsyncGenerator<Buffer> {
    if (this.#reading) throw new Error('WORKER_NATIVE_CONTROL_READER_ALREADY_USED');
    this.#reading = true;
    let pending = Buffer.alloc(0);
    for await (const raw of this.#stream) {
      const bytes = Buffer.from(raw); this.#received += bytes.byteLength;
      if (this.#received > this.#limits.maximumSessionBytes) throw new Error('WORKER_NATIVE_CONTROL_INPUT_LIMIT');
      pending = Buffer.concat([pending, bytes]);
      while (pending.byteLength >= 4) {
        const length = pending.readUInt32BE();
        if (!length || length > this.#limits.maximumMessageBytes) throw new Error('WORKER_NATIVE_CONTROL_MESSAGE_LIMIT');
        if (pending.byteLength < length + 4) break;
        yield Buffer.from(pending.subarray(4, length + 4));
        pending = pending.subarray(length + 4);
      }
    }
    if (pending.byteLength) throw new Error('WORKER_NATIVE_CONTROL_TRUNCATED');
  }

  async end(): Promise<void> {
    this.#closed = true;
    await this.#writes;
    await new Promise<void>((resolve, reject) => {
      this.#stream.end((error?: Error | null) => { if (error) reject(error); else resolve(); });
    });
  }

  destroy(): void { this.#closed = true; this.#stream.destroy(); }
}

/** Byte accounting precedes streaming UTF-8 decoding, independently per log stream. */
export class WorkerLogDecoder {
  readonly #decoders = new Map<string, TextDecoder>();
  #bytes = 0;
  readonly maximumBytes: number;
  constructor(maximumBytes: number) { this.maximumBytes = maximumBytes; }
  decode(stream: string, value: string | Uint8Array): string {
    this.#bytes += typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
    if (this.#bytes > this.maximumBytes) throw new Error('WORKER_LOG_LIMIT');
    let decoder = this.#decoders.get(stream);
    if (!decoder) { decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); this.#decoders.set(stream, decoder); }
    try {
      return typeof value === 'string' ? decoder.decode() + value.toWellFormed() : decoder.decode(value, { stream: true });
    } catch (cause) { throw new Error('WORKER_LOG_UTF8_INVALID', { cause }); }
  }
  finish(): void {
    try { for (const decoder of this.#decoders.values()) decoder.decode(); }
    catch (cause) { throw new Error('WORKER_LOG_UTF8_INVALID', { cause }); }
  }
}

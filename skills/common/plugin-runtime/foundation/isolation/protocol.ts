const MAX_PROTOCOL_LINE_BYTES = 256 * 1024;
const MAX_PROTOCOL_BUFFER_BYTES = 1024 * 1024;

/** Frame bytes first: a transport chunk may end inside a UTF-8 codepoint. */
export class ProtocolLines {
  #pending: Buffer = Buffer.alloc(0);
  readonly #decoder = new TextDecoder('utf-8', { fatal: true });
  push(chunk: Buffer, consume: (message: Record<string, unknown>) => void): void {
    if (this.#pending.length + chunk.length > MAX_PROTOCOL_BUFFER_BYTES) throw new Error('ISOLATION_PROTOCOL_OUTPUT_LIMIT');
    this.#pending = Buffer.concat([this.#pending, chunk]);
    for (;;) {
      const newline = this.#pending.indexOf(10);
      if (newline < 0) {
        if (this.#pending.length > MAX_PROTOCOL_LINE_BYTES) throw new Error('ISOLATION_PROTOCOL_LINE_LIMIT');
        return;
      }
      if (newline > MAX_PROTOCOL_LINE_BYTES) throw new Error('ISOLATION_PROTOCOL_LINE_LIMIT');
      const bytes = this.#pending.subarray(0, newline);
      this.#pending = this.#pending.subarray(newline + 1);
      let line: string;
      try { line = this.#decoder.decode(bytes); }
      catch (cause) { throw new Error('ISOLATION_PROTOCOL_INVALID_UTF8', { cause }); }
      let message: unknown;
      try { message = JSON.parse(line); }
      catch (cause) { throw new Error('ISOLATION_PROTOCOL_INVALID_JSON', { cause }); }
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('ISOLATION_PROTOCOL_INVALID_MESSAGE');
      consume(message as Record<string, unknown>);
    }
  }
  finish(): void {
    if (this.#pending.length) {
      try { this.#decoder.decode(this.#pending); }
      catch (cause) { throw new Error('ISOLATION_PROTOCOL_INVALID_UTF8', { cause }); }
      throw new Error('ISOLATION_PROTOCOL_TRUNCATED');
    }
  }
}

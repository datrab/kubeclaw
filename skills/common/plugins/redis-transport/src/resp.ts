export interface ReplyLimits { readonly maximumReplyBulkBytes: number; readonly maximumReplyHeaderBytes: number; }
export function captureReplyLimits(value: ReplyLimits): ReplyLimits {
  for (const key of ['maximumReplyBulkBytes', 'maximumReplyHeaderBytes'] as const) {
    if (!Number.isSafeInteger(value?.[key]) || value[key] < 1 || value[key] > 16_777_216) throw new Error(`REDIS_CONFIG_INVALID:${key}`);
  }
  return Object.freeze({maximumReplyBulkBytes: value.maximumReplyBulkBytes, maximumReplyHeaderBytes: value.maximumReplyHeaderBytes});
}
type Reply = string | number | null;

function text(buffer: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch (cause) { throw new Error('REDIS_RESPONSE_UTF8_INVALID', { cause }); }
}

function parseReply(buffer: Buffer, limits: ReplyLimits): { value: Reply; bytes: number } | undefined {
  const lineEnd = buffer.indexOf('\r\n');
  if (lineEnd < 0) {
    if (buffer.length > limits.maximumReplyHeaderBytes + 1) throw new Error('REDIS_RESPONSE_HEADER_LIMIT');
    return undefined;
  }
  if (lineEnd > limits.maximumReplyHeaderBytes) throw new Error('REDIS_RESPONSE_HEADER_LIMIT');
  const prefix = buffer[0];
  const header = text(buffer.subarray(1, lineEnd));
  if (/[\u0000-\u001f\u007f]/u.test(header)) throw new Error('REDIS_RESPONSE_INVALID');
  if (prefix === 43) return { value: header, bytes: lineEnd + 2 };
  if (prefix === 45) throw new Error(`REDIS_ERROR:${header}`);
  if (prefix === 58) {
    if (!/^-?(?:0|[1-9][0-9]*)$/u.test(header) || !Number.isSafeInteger(Number(header))) throw new Error('REDIS_RESPONSE_INVALID');
    return { value: Number(header), bytes: lineEnd + 2 };
  }
  if (prefix !== 36) throw new Error('REDIS_RESPONSE_INVALID');
  return parseBulk(buffer, header, lineEnd, limits);
}

function parseBulk(buffer: Buffer, header: string, lineEnd: number, limits: ReplyLimits): { value: Reply; bytes: number } | undefined {
  if (!/^(?:-1|0|[1-9][0-9]*)$/u.test(header)) throw new Error('REDIS_RESPONSE_INVALID');
  const length = Number(header);
  if (length === -1) return { value: null, bytes: lineEnd + 2 };
  if (!Number.isSafeInteger(length) || length > limits.maximumReplyBulkBytes) throw new Error('REDIS_RESPONSE_INVALID');
  const end = lineEnd + 2 + length;
  if (buffer.length < end + 2) return undefined;
  if (buffer[end] !== 13 || buffer[end + 1] !== 10) throw new Error('REDIS_RESPONSE_INVALID');
  return { value: text(buffer.subarray(lineEnd + 2, end)), bytes: end + 2 };
}

/** Two replies only: AUTH and command. Growth and lifetime bytes are bounded. */
export class ReplyDecoder {
  readonly #limits: ReplyLimits;
  readonly #maximumExchangeBytes: number;
  #buffer: Buffer;
  constructor(limits: ReplyLimits) {
    this.#limits = captureReplyLimits(limits);
    this.#maximumExchangeBytes = this.#limits.maximumReplyBulkBytes + 2 * this.#limits.maximumReplyHeaderBytes + 6;
    this.#buffer = Buffer.alloc(Math.min(1024, this.#maximumExchangeBytes));
  }
  #length = 0;
  #received = 0;
  #replies = 0;
  push(chunk: Buffer): { value: Reply } | undefined {
    if (chunk.length > this.#maximumExchangeBytes - this.#received) throw new Error('REDIS_RESPONSE_SIZE_EXCEEDED');
    this.#received += chunk.length;
    const required = this.#length + chunk.length;
    if (required > this.#buffer.length) {
      const grown = Buffer.alloc(Math.min(this.#maximumExchangeBytes, Math.max(required, this.#buffer.length * 2)));
      this.#buffer.copy(grown, 0, 0, this.#length); this.#buffer = grown;
    }
    chunk.copy(this.#buffer, this.#length); this.#length = required;
    let consumed = 0;
    for (;;) {
      const parsed = parseReply(this.#buffer.subarray(consumed, this.#length), this.#limits);
      if (!parsed) break;
      consumed += parsed.bytes; this.#replies += 1;
      if (this.#replies === 1 && parsed.value !== 'OK') throw new Error('REDIS_AUTH_RESPONSE_INVALID');
      if (this.#replies === 2) {
        if (consumed !== this.#length) throw new Error('REDIS_RESPONSE_TRAILING_DATA');
        return { value: parsed.value };
      }
    }
    if (consumed) { this.#buffer.copyWithin(0, consumed, this.#length); this.#length -= consumed; }
    return undefined;
  }
}

export function command(parts: readonly string[]): Buffer {
  return Buffer.from(`*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`);
}

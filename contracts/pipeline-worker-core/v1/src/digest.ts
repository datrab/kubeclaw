import crypto from 'node:crypto';

function compareText(left: string, right: string): number {
  // RFC 8785 section 3.2.3 requires raw UTF-16 code-unit ordering.
  return left < right ? -1 : left > right ? 1 : 0;
}

function encodeString(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('RFC8785_INVALID_UNICODE');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('RFC8785_INVALID_UNICODE');
    }
  }
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return encodeString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('RFC8785_INVALID_NUMBER');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('RFC8785_INVALID_TYPE');
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError('RFC8785_INVALID_ARRAY');
      items.push(canonicalJson(value[index]));
    }
    return `[${items.join(',')}]`;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('RFC8785_INVALID_OBJECT');
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, child]) => `${encodeString(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

export function sha256Digest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function sha256Text(value: string): string {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function workerProfileDigest(profile: Readonly<object>): string {
  const { profileDigest: _profileDigest, ...unsigned } = profile as Readonly<Record<string, unknown>>;
  return sha256Digest(unsigned);
}

export function workerAttemptSpecDigest(envelope: Readonly<object>): string {
  const { attemptSpecDigest: _attemptSpecDigest, claim: _claim, ...unsigned }
    = envelope as Readonly<Record<string, unknown>>;
  return sha256Digest(unsigned);
}

export function workerAttemptResultDigest(result: Readonly<object>): string {
  const { resultDigest: _resultDigest, receipt: _receipt, ...unsigned }
    = result as Readonly<Record<string, unknown>>;
  return sha256Digest(unsigned);
}

function requireRelation(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`PIPELINE_V10_RECOVERY_RELATION_INVALID:${reason}`);
}
const I64 = 9223372036854775807n;
interface Quantity { digits: string; exponent: bigint }
/** Exact positive source quantity domain, without exponentiation by untrusted
 * decimal exponents. Large exponents are compared by order, never allocated.
 */
function quantity(raw: string): Quantity {
  const match = /^([+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+))([eE][+-]?[0-9]+|[numkMGTPE]|[KMGTPE]i)?$/.exec(raw);
  requireRelation(match, 'QUANTITY_DOMAIN');
  const [whole = '', fraction = ''] = match[1]!.replace(/^\+/, '').split('.');
  let coefficient = BigInt((whole || '0') + fraction), exponent = -BigInt(fraction.length);
  requireRelation(coefficient > 0n, 'QUANTITY_POSITIVE');
  const suffix = match[2] ?? '';
  if (/^[eE][+-]?[0-9]+$/.test(suffix)) exponent += BigInt(suffix.slice(1));
  else if (suffix.endsWith('i')) coefficient *= 1024n ** BigInt('KMGTPE'.indexOf(suffix[0]!) + 1);
  else if (suffix) exponent += BigInt(({ n: -9, u: -6, m: -3, k: 3, M: 6, G: 9, T: 12, P: 15, E: 18 } as Record<string, number>)[suffix]!);
  const result = { digits: coefficient.toString(), exponent };
  requireRelation(compare(result, { digits: I64.toString(), exponent: 0n }) <= 0, 'QUANTITY_I64');
  return result;
}
function compare(a: Quantity, b: Quantity): number {
  const orderA = BigInt(a.digits.length) + a.exponent, orderB = BigInt(b.digits.length) + b.exponent;
  if (orderA !== orderB) return orderA < orderB ? -1 : 1;
  const width = Math.max(a.digits.length, b.digits.length);
  const left = a.digits.padEnd(width, '0'), right = b.digits.padEnd(width, '0');
  return left === right ? 0 : left < right ? -1 : 1;
}
export function recoveryQuantityAtMost(request: string, limit: string): boolean {
  return compare(quantity(request), quantity(limit)) <= 0;
}

/** Intrinsic relations only. Actual original metadata source/credential/image
 * revisions, PVC identity/capacity/accounting and native task authority remain
 * separate mandatory gates, never derived from reviewed public fixture values.
 */
export function validatePipelineV10Recovery(document: any): void {
  for (const p of Object.values(document.profiles) as any[]) {
    const s = p.settings, b = (key: string) => BigInt(s[key]);
    requireRelation(s.verificationIntervalMinutes <= s.backupIntervalMinutes, 'INTERVAL');
    requireRelation(2n * b('maximumDurationSeconds') + 60n * b('verificationIntervalMinutes')
      + b('verificationDeadlineSeconds') + b('cronJobDeadlineOverheadSeconds') < b('maximumAgeSeconds'), 'AGE_WINDOW');
    requireRelation(b('maximumBackupBytes') + b('reserveBytes') <= b('maximumRetainedBytes'), 'RETAINED_RESERVE');
    const pv = /^([1-9][0-9]*)(Gi|Ti)$/.exec(s.persistence.size);
    requireRelation(pv, 'PVC_SIZE_DOMAIN');
    const capacity = BigInt(pv[1]!) * 1024n ** (pv[2] === 'Gi' ? 3n : 4n);
    requireRelation(capacity <= I64 && capacity >= b('maximumRetainedBytes'), 'PVC_CAPACITY');
    requireRelation(b('reserveBytes') >= b('tocMaximumBytes') / 1024n * 1024n
      + b('metadataMaximumBytesExclusive') - 1n + b('checksumIndexMaximumBytesExclusive') - 1n, 'RECORD_RESERVE');
    // Exact original three-record checksum index representation, not a new cap.
    const indexBytes = ['database.dump', 'archive-toc.txt', 'metadata.env'].reduce((sum, name) => sum + 64 + 2 + name.length + 1, 0);
    requireRelation(s.checksumIndexMaximumBytesExclusive > indexBytes, 'CHECKSUM_INDEX');
    requireRelation(Math.max(2, s.connectionTimeoutSeconds) <= s.maximumDurationSeconds
      && Math.max(2, s.connectionTimeoutSeconds) <= s.cronJobDeadlineOverheadSeconds, 'CONNECTION_WINDOW');
    requireRelation(s.killAfterSeconds <= s.cronJobDeadlineOverheadSeconds, 'KILL_WINDOW');
    requireRelation(b('maximumDurationSeconds') + b('cronJobDeadlineOverheadSeconds') <= 9999999999999n, 'DURATION_MAX');
    for (const unit of ['cpu', 'memory']) requireRelation(recoveryQuantityAtMost(s.resources.requests[unit], s.resources.limits[unit]), 'RESOURCE_REQUEST_LIMIT');
    quantity(s.temporaryDirectorySize);
  }
}

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { t as parseDurationMs } from './parse-duration-DBWI377R.mjs';

const sources = JSON.parse(fs.readFileSync(new URL('./gateway-native-duration-sources.json', import.meta.url), 'utf8')) as
  Record<string, { sha256: string }>;
let verified = false;
function verifyParserClosure(): void {
  if (verified) return;
  for (const name of ['parse-duration-DBWI377R.mjs', 'string-coerce-CIXf7egm.mjs', 'ms']) {
    const location = name === 'ms' ? import.meta.resolve('ms') : new URL(name, import.meta.url);
    const raw = fs.readFileSync(typeof location === 'string' ? new URL(location) : location);
    if (createHash('sha256').update(raw).digest('hex') !== sources[name]!.sha256) {
      throw new Error('PIPELINE_V10_GATEWAY_DURATION_SOURCE_MISMATCH');
    }
  }
  verified = true;
}

/** Exact archived OpenClaw2026.9.5 pure parser+ms2.1.3, not whole native
 * schema/image/host admission. Reader/package receipts retain actual bytes.
 * Do not silently catch invalid policy and select native fallback300000ms.
 */
export function readNativeGatewayPruningDurationMs(raw: string): number {
  verifyParserClosure();
  let milliseconds: number;
  try { milliseconds = parseDurationMs(raw, { defaultUnit: 'm' }); }
  catch { throw new Error('PIPELINE_V10_GATEWAY_DURATION_INVALID'); }
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error('PIPELINE_V10_GATEWAY_DURATION_INVALID');
  return milliseconds;
}

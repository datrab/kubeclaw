import {type CoreRuntimePolicy} from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
// Required selected projection; no local defaults and no current-owner recovery read.
export function gateLimits(value:unknown):CoreRuntimePolicy['remoteTestGate'] {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('REMOTE_TEST_GATE_LIMITS_REQUIRED');
  const raw=value as Record<string,unknown>;
  const maxima:Record<string,number>={pollMilliseconds:500,maximumResponseBytes:67108864,maximumResultBytes:67108864,maximumArchiveBytes:67108864,maximumArchiveStoreBytes:1073741824,maximumEvidenceBytes:67108864,maximumEvidenceStoreBytes:1073741824};
  if(Object.keys(raw).some(key=>key!=='recordLimits'&&!Object.hasOwn(maxima,key)))throw new Error('REMOTE_TEST_GATE_LIMITS_INVALID');
  for(const [key,maximum] of Object.entries(maxima))if(!Number.isSafeInteger(raw[key])||Number(raw[key])<1||Number(raw[key])>maximum)throw new Error('REMOTE_TEST_GATE_LIMITS_INVALID');
  const records=raw.recordLimits as Record<string,unknown>;
  if(!records||typeof records!=='object'||Array.isArray(records)||Object.keys(records).some(key=>!['maximumRecords','maximumBytes','maximumRecordBytes'].includes(key)))throw new Error('REMOTE_TEST_GATE_LIMITS_INVALID');
  for(const [key,maximum] of Object.entries({maximumRecords:10000,maximumBytes:1073741824,maximumRecordBytes:67108864}))if(!Number.isSafeInteger(records[key])||Number(records[key])<1||Number(records[key])>maximum)throw new Error('REMOTE_TEST_GATE_LIMITS_INVALID');
  return Object.freeze({...raw,recordLimits:Object.freeze({...records})}) as unknown as CoreRuntimePolicy['remoteTestGate'];
}

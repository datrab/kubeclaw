import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const schema = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url), 'utf8'));
const validateShape = new Ajv({ strict: true }).compile(schema);
type Policy = {
  authenticatedProject: string;
  authorizedDigest: string;
  sourceRevision: string;
  maxOutputBytes: number;
  maxTtlSeconds: number;
};
// Inactive admission foundation. The policy MUST originate outside caller input.
// Do not log the input or AJV errors: future profiles may contain private literals.
export function admitProjectProfile(raw: string, policy: Policy) {
  const reject = (code: string): never => { throw new Error(`PROJECT_PROFILE_${code}`); };
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) reject('DOCUMENT_SIZE');
  const digest = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  if (!policy || !Number.isSafeInteger(policy.maxOutputBytes) || policy.maxOutputBytes < 1 ||
      policy.maxOutputBytes > 65536 || !Number.isSafeInteger(policy.maxTtlSeconds) ||
      policy.maxTtlSeconds < 60 || policy.maxTtlSeconds > 3600) reject('POLICY');
  if (digest !== policy.authorizedDigest) reject('DIGEST');
  let profile;
  try { profile = JSON.parse(raw); } catch { reject('JSON'); }
  if (!validateShape(profile)) reject('SHAPE');
  if (profile.project !== policy.authenticatedProject || profile.sourceRevision !== policy.sourceRevision) reject('IDENTITY');
  if (profile.ttlSeconds > policy.maxTtlSeconds) reject('TTL');
  const lengths = new Map<string, number>();
  let generatedBytes = 0;
  for (const value of profile.values) {
    if (lengths.has(value.id)) reject('DUPLICATE_VALUE');
    let length = 0;
    if (value.kind === 'random') {
      length = value.encoding === 'hex' ? value.bytes * 2 : 4 * Math.ceil(value.bytes / 3);
    } else {
      for (const part of value.parts) {
        if ('ref' in part) {
          if (!lengths.has(part.ref)) reject('REFERENCE');
          length += lengths.get(part.ref)!;
        } else length += Buffer.byteLength(part.literal);
      }
    }
    generatedBytes += length;
    if (generatedBytes > policy.maxOutputBytes) reject('GENERATED_BYTES');
    lengths.set(value.id, length);
  }
  const names = new Set<string>();
  let outputBytes = 0;
  for (const secret of profile.secrets) {
    // Reserve a platform-owned prefix, including all private journal identities.
    if (secret.name.startsWith('buster-')) reject('RESERVED_NAME');
    if (names.has(secret.name)) reject('DUPLICATE_SECRET');
    names.add(secret.name);
    const keys = new Set<string>();
    for (const key of secret.keys) {
      if (keys.has(key.key)) reject('DUPLICATE_KEY');
      keys.add(key.key);
      if (!lengths.has(key.value)) reject('REFERENCE');
      outputBytes += lengths.get(key.value)!;
      if (outputBytes > policy.maxOutputBytes) reject('OUTPUT_BYTES');
      const consumers = new Set<string>();
      for (const consumer of key.consumers) {
        const identity = `${consumer.workload}/${consumer.container}`;
        if (consumers.has(identity)) reject('DUPLICATE_CONSUMER');
        consumers.add(identity);
      }
    }
  }
  return { profile, digest, generatedBytes, outputBytes };
}

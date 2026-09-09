import fs from 'node:fs';
import path from 'node:path';
import { FileBusterPlanJobStore } from '../skills/buster/engine/test-gates/remote-plan-service.ts';
import { assertCompactionIntent } from '../skills/buster/engine/test-gates/remote-plan-compaction.ts';

function readRegularFile(file, maximumBytes, kind) {
  const handle = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(handle);
    if (!stat.isFile()) throw new Error(`BUSTER_COMPACTION_${kind}_FILE_INVALID`);
    if (!Number.isSafeInteger(stat.size) || stat.size > maximumBytes) throw new Error(`BUSTER_COMPACTION_${kind}_SIZE_INVALID`);
    // One extra byte detects growth; allocation follows the bounded opened file, not an arbitrary budget allocation.
    const bytes = Buffer.alloc(stat.size + 1);
    let total = 0;
    while (total < bytes.byteLength) {
      const count = fs.readSync(handle, bytes, total, bytes.byteLength - total, total);
      if (count === 0) break;
      total += count;
    }
    if (total !== stat.size) throw new Error(`BUSTER_COMPACTION_${kind}_FILE_CHANGED`);
    return bytes.subarray(0, total);
  } finally { fs.closeSync(handle); }
}

// Local manual operator command. No timer, HTTP route, or broad run deletion.
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--apply' || !path.isAbsolute(process.argv[3])) {
    throw new Error('BUSTER_COMPACTION_USAGE: node scripts/compact-buster-job.mjs --apply /absolute/operator-scope.json');
  }
  const bytes = readRegularFile(process.argv[3], 65536, 'SCOPE');
  let input;
  try { input = JSON.parse(bytes.toString()); }
  catch { throw new Error('BUSTER_COMPACTION_SCOPE_JSON_INVALID'); }
  if (!input || Object.keys(input).sort().join(',') !== 'intent,maximumSourcePublicKeyBytes,runtimeRoot,schemaVersion,sourcePublicKeyFile,storeOptions,storeRoot'
    || input.schemaVersion !== 'buster-job-compaction-scope.v1'
    || !Number.isSafeInteger(input.maximumSourcePublicKeyBytes) || input.maximumSourcePublicKeyBytes < 1
    || ![input.storeRoot, input.runtimeRoot, input.sourcePublicKeyFile].every(value => typeof value === 'string' && path.isAbsolute(value))
    || !input.storeOptions || Object.keys(input.storeOptions).sort().join(',') !== 'maximumArchiveBytes,maximumResultBytes,maximumResultStoreBytes,recordLimits,trustedSourceAuthority') {
    throw new Error('BUSTER_COMPACTION_SCOPE_INVALID');
  }
  assertCompactionIntent(input.intent);
  // Refuse a typo that would otherwise create an empty record store.
  if (!fs.statSync(path.join(input.storeRoot, 'records/store.json')).isFile()) throw new Error('BUSTER_COMPACTION_STORE_REQUIRED');
  const publicKey = readRegularFile(input.sourcePublicKeyFile, input.maximumSourcePublicKeyBytes, 'PUBLIC_KEY');
  const store = new FileBusterPlanJobStore(input.storeRoot, { ...input.storeOptions, sourceAttestationPublicKey: publicKey });
  const result = await store.compactCompletedArchive(input.intent, input.runtimeRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
main().catch(error => {
  const code = typeof error?.message === 'string' && /^(BUSTER_[A-Z_]+|DURABLE_[A-Z_]+)(: node scripts\/compact-buster-job.mjs --apply \/absolute\/operator-scope.json)?$/u.test(error.message)
    ? error.message : ['ENOENT', 'EACCES', 'ELOOP'].includes(error?.code) ? `FILESYSTEM_${error.code}` : 'BUSTER_COMPACTION_OPERATION_FAILED';
  process.stderr.write(`${JSON.stringify({ code, operation: 'compact-completed-job-archive' })}\n`);
  process.exitCode = 1;
});

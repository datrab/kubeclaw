import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inputDigest, isImageInput } from './runtime-inputs.mjs';

export function validateCodeReceipt(code) {
  if (code?.schemaVersion !== 1 || !/^[a-f0-9]{40}$/u.test(code.commit)
    || !Number.isSafeInteger(code.sourceRunId) || code.sourceRunId < 1
    || !Number.isSafeInteger(code.sourceRunAttempt) || code.sourceRunAttempt < 1
    || JSON.stringify(Object.keys(code.bundles ?? {}).sort()) !== JSON.stringify(['buster', 'nova', 'prism'])) throw new Error('CODE_RELEASE_INVALID');
  for (const [role, bundle] of Object.entries(code.bundles)) {
    const suffix = `/releases/download/code-bundles-${code.sourceRunId}-${code.sourceRunAttempt}/${role}-${code.commit}.tgz`;
    if (bundle.contractVersion !== 'v2' || !/^[a-f0-9]{64}$/u.test(bundle.sha256)
      || !/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/releases\/download\//u.test(bundle.url)
      || !bundle.url.endsWith(suffix)) throw new Error(`CODE_BUNDLE_INVALID:${role}`);
  }
  return code;
}
export function selectedCode(root, imageReceipt) {
  const file = path.join(root, 'releases/runtime-code.json');
  if (!fs.existsSync(file)) return undefined; // Existing image-only selections remain readable.
  const code = validateCodeReceipt(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (inputDigest(root, imageReceipt.commit, isImageInput) !== inputDigest(root, code.commit, isImageInput)) {
    throw new Error('CODE_RELEASE_REQUIRES_NEW_IMAGES: image inputs differ from the selected build');
  }
  return code;
}
if (process.argv[1] === import.meta.filename) {
  const [directory, commit, repository] = process.argv.slice(2);
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u.test(repository ?? '')) throw new Error('CODE_REPOSITORY_INVALID');
  const code = { schemaVersion: 1, commit, sourceRunId: Number(process.env.GITHUB_RUN_ID),
    sourceRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), bundles: {} };
  for (const role of ['nova', 'buster', 'prism']) {
    const file = `${role}-${commit}.tgz`;
    code.bundles[role] = { url: `https://github.com/${repository}/releases/download/code-bundles-${code.sourceRunId}-${code.sourceRunAttempt}/${file}`,
      sha256: createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'), contractVersion: 'v2' };
  }
  validateCodeReceipt(code);
  fs.writeFileSync(path.join(directory, 'runtime-code.json'), JSON.stringify(code, null, 2) + '\n');
}

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inputDigest, isImageInput, changedBundles, runtimeRefresh } from './runtime-inputs.mjs';
import { componentSource, validSource, imageInput, runtimeImages } from './runtime-components.mjs';

export function validateCodeReceipt(code) {
  if (code?.schemaVersion !== 1 || !/^[a-f0-9]{40}$/u.test(code.commit)
    || !Number.isSafeInteger(code.sourceRunId) || code.sourceRunId < 1
    || !Number.isSafeInteger(code.sourceRunAttempt) || code.sourceRunAttempt < 1
    || JSON.stringify(Object.keys(code.bundles ?? {}).sort()) !== JSON.stringify(['buster', 'nova', 'prism'])) throw new Error('CODE_RELEASE_INVALID');
  for (const [role, bundle] of Object.entries(code.bundles)) {
    const source = componentSource(code, role, 'bundle');
    if (!validSource(source)) throw new Error(`CODE_BUNDLE_SOURCE_INVALID:${role}`);
    const suffix = `/releases/download/code-bundles-${source.sourceRunId}-${source.sourceRunAttempt}/${role}-${source.commit}.tgz`;
    if (bundle.contractVersion !== 'v2' || !/^[a-f0-9]{64}$/u.test(bundle.sha256)
      || !/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/releases\/download\//u.test(bundle.url)
      || !bundle.url.endsWith(suffix)) throw new Error(`CODE_BUNDLE_INVALID:${role}`);
  }
  return code;
}
export function selectedCode(root, imageReceipt) {
  const file = path.join(root, 'releases/runtime-code.json');
  if (!fs.existsSync(file)) return undefined; // Existing image-only selections remain readable.
  return compatibleCode(root, imageReceipt, JSON.parse(fs.readFileSync(file, 'utf8')));
}
export function compatibleCode(root, imageReceipt, candidate) {
  const code = validateCodeReceipt(candidate);
  const imageCodeCommit = name => {
    const role = name === 'nova' ? 'nova' : name.startsWith('prism-') ? 'prism'
      : ['buster-gateway', 'buster-runtime', 'namespace-controller'].includes(name) ? 'buster' : undefined;
    return role ? componentSource(code, role, 'bundle').commit : code.commit;
  };
  const compatible = imageReceipt.imageSources
    ? runtimeImages.every(name => inputDigest(root, componentSource(imageReceipt, name, 'image').commit, file => imageInput(name, file))
      === inputDigest(root, imageCodeCommit(name), file => imageInput(name, file)))
    : inputDigest(root, imageReceipt.commit, isImageInput) === inputDigest(root, code.commit, isImageInput);
  if (Object.values(code.bundles).some(bundle => bundle.source) && changedBundles(root, code, code.commit).length > 0) {
    throw new Error('CODE_BUNDLE_INPUTS_CHANGED: retained bundle is incompatible with selected sources');
  }
  if (!compatible) {
    throw new Error('CODE_RELEASE_REQUIRES_NEW_IMAGES: image inputs differ from the selected build');
  }
  return code;
}
if (process.argv[1] === import.meta.filename) {
  const [directory, commit, repository] = process.argv.slice(2);
  const priorFile = path.join(process.cwd(), 'releases/runtime-code.json');
  const prior = fs.existsSync(priorFile) ? validateCodeReceipt(JSON.parse(fs.readFileSync(priorFile, 'utf8'))) : undefined;
  const roles = changedBundles(process.cwd(), prior, process.env.GITHUB_SHA ?? commit, runtimeRefresh().bundles);
  if (directory === '--roles') { process.stdout.write(JSON.stringify(roles)); process.exit(0); }
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u.test(repository ?? '')) throw new Error('CODE_REPOSITORY_INVALID');
  const code = { schemaVersion: 1, commit, sourceRunId: Number(process.env.GITHUB_RUN_ID),
    sourceRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), bundles: {} };
  for (const role of ['nova', 'buster', 'prism']) {
    if (!roles.includes(role)) {
      code.bundles[role] = { ...prior.bundles[role], source: componentSource(prior, role, 'bundle') };
      continue;
    }
    const file = `${role}-${commit}.tgz`;
    code.bundles[role] = { url: `https://github.com/${repository}/releases/download/code-bundles-${code.sourceRunId}-${code.sourceRunAttempt}/${file}`,
      sha256: createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'), contractVersion: 'v2' };
  }
  validateCodeReceipt(code);
  fs.writeFileSync(path.join(directory, 'runtime-code.json'), JSON.stringify(code, null, 2) + '\n');
}

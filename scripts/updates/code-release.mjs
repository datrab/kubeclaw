import { retainedBaseline } from './retained-baseline.mjs';
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
  // This path is authenticated by publication before compatibility is checked.
  // Only the independently deployed archviewer may use its exact baseline image;
  // role images must still match their selected bundle's inputs.
  const baselineDirectory = code.retainedBaseline;
  if (baselineDirectory !== imageReceipt.retainedBaseline) throw new Error('RETAINED_BASELINE_MISMATCH');
  const baseline = retainedBaseline(root, baselineDirectory);
  const imageCodeCommit = name => {
    if (name === 'archviewer' && baseline) {
      const source = componentSource(imageReceipt, name, 'image');
      const priorSource = componentSource(baseline.runtime, name, 'image');
      if (imageReceipt.images?.[name] !== baseline.runtime.images?.[name]
        || !validSource(source) || !validSource(priorSource)
        || ['commit', 'sourceRunId', 'sourceRunAttempt'].some(key => source[key] !== priorSource[key])) {
        throw new Error('RETAINED_ARCHVIEWER_MISMATCH');
      }
      return priorSource.commit;
    }
    const role = name === 'nova' ? 'nova' : name.startsWith('prism-') ? 'prism'
      : ['buster-gateway', 'buster-runtime', 'namespace-controller'].includes(name) ? 'buster' : undefined;
    return role ? componentSource(code, role, 'bundle').commit : code.commit;
  };
  const compatible = imageReceipt.imageSources
    ? runtimeImages.every(name => inputDigest(root, componentSource(imageReceipt, name, 'image').commit, file => imageInput(name, file))
      === inputDigest(root, imageCodeCommit(name), file => imageInput(name, file)))
    : inputDigest(root, imageReceipt.commit, isImageInput) === inputDigest(root, code.commit, isImageInput);
  const retainedRoles = new Set();
  if (baseline) {
    validateCodeReceipt(baseline.code);
    for (const role of ['nova', 'prism']) {
      const bundle = code.bundles[role], prior = baseline.code.bundles[role];
      const source = componentSource(code, role, 'bundle');
      const priorSource = componentSource(baseline.code, role, 'bundle');
      if (source.commit === code.commit) continue;
      if (['url', 'sha256', 'contractVersion'].some(key => bundle[key] !== prior[key])
        || ['commit', 'sourceRunId', 'sourceRunAttempt'].some(key => source[key] !== priorSource[key])) {
        throw new Error(`RETAINED_CODE_BUNDLE_MISMATCH:${role}`);
      }
      retainedRoles.add(role);
    }
  }
  // Publication authenticates the exact immutable baseline before this call.
  // Retained roles target that baseline, not the new Buster source tree.
  if (Object.values(code.bundles).some(bundle => bundle.source)
    && changedBundles(root, code, code.commit).some(role => !retainedRoles.has(role))) {
    throw new Error('CODE_BUNDLE_INPUTS_CHANGED: retained bundle is incompatible with selected sources');
  }
  if (!compatible) {
    throw new Error('CODE_RELEASE_REQUIRES_NEW_IMAGES: image inputs differ from the selected build');
  }
  return code;
}
// Retain the original producer identities, not just bundle URLs/digests.
export function selectRuntimeCodeReceipt(built, prior, scope) {
  validateCodeReceipt(built);
  if (scope === 'all') return built;
  if (scope !== 'buster') throw new Error('RUNTIME_PUBLICATION_SCOPE_REQUIRED');
  validateCodeReceipt(prior);
  return { ...built, bundles: { ...built.bundles,
    ...Object.fromEntries(['nova', 'prism'].map(role => [role,
      { ...prior.bundles[role], source: componentSource(prior, role, 'bundle') }])) } };
}
if (process.argv[1] === import.meta.filename) {
  const receiptScope = process.env.RUNTIME_RECEIPT_SCOPE ?? 'all';
  if (!['all', 'buster'].includes(receiptScope)) throw new Error('RUNTIME_PUBLICATION_SCOPE_REQUIRED');
  if (receiptScope === 'buster' && !process.env.GITOPS_RETAINED_BASELINE) throw new Error('RETAINED_BASELINE_REQUIRED');
  const [directory, commit, repository] = process.argv.slice(2);
  const priorFile = path.join(process.cwd(), 'releases/runtime-code.json');
  const candidate = retainedBaseline(process.cwd(), process.env.GITOPS_RETAINED_BASELINE)?.code
    ?? (fs.existsSync(priorFile) ? JSON.parse(fs.readFileSync(priorFile, 'utf8')) : undefined);
  const prior = candidate ? validateCodeReceipt(candidate) : undefined;
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
  const selected = selectRuntimeCodeReceipt(code, prior, receiptScope);
  if (receiptScope === 'buster') selected.retainedBaseline = process.env.GITOPS_RETAINED_BASELINE;
  validateCodeReceipt(selected);
  fs.writeFileSync(path.join(directory, 'runtime-code.json'), JSON.stringify(selected, null, 2) + '\n');
}

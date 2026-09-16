#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readCommittedBundle } from './gitops.mjs';
import { renderContinuousEnvironment } from './gitops-continuous.mjs';

const selectionFile = 'gitops/production/selection.json';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const read = (root, revision, file) => git(root, ['show', `${revision}:${file}`]);
const selection = (root, revision) => JSON.parse(read(root, revision, selectionFile));

export function rollbackRevision(root, requested = 'previous') {
  const current = selection(root, 'HEAD').directory;
  if (requested !== 'previous') {
    if (!/^[a-f0-9]{40}$/u.test(requested)) throw new Error('ROLLBACK_TARGET_MUST_BE_FULL_COMMIT');
    git(root, ['merge-base', '--is-ancestor', requested, 'HEAD']);
    if (selection(root, requested).directory === current) throw new Error('ROLLBACK_ALREADY_SELECTED');
    return requested;
  }
  // First-parent history represents merged deployment choices, not intermediate
  // commits inside a PR. Never call the previous choice "known healthy".
  const revisions = git(root, ['log', '--first-parent', '--format=%H', 'HEAD', '--', selectionFile]).trim().split('\n').filter(Boolean);
  for (const revision of revisions) {
    if (selection(root, revision).directory !== current) return revision;
  }
  throw new Error('ROLLBACK_NO_PREVIOUS_SELECTION');
}

export function planGitOpsRollback(root, url, requested = 'previous') {
  const revision = rollbackRevision(root, requested);
  const directory = selection(root, revision).directory;
  const current = readCommittedBundle(root, selection(root, 'HEAD').directory, git(root, ['rev-parse', 'HEAD']).trim());
  const config = JSON.parse(fs.readFileSync(path.join(root, 'gitops/production/config.json'), 'utf8'));
  const { result, files: generated } = renderContinuousEnvironment(root, directory, url, revision, config);
  const scope = bundle => bundle.groups.map(group => ({ name: group.name, namespace: group.namespace, helmReleases: group.helmReleases }));
  if (JSON.stringify(scope(current)) !== JSON.stringify(scope(result.bundle))) throw new Error('ROLLBACK_DEPLOYMENT_SCOPE_CHANGED');
  // main is the Argo source. Historical manifests must still exist there with
  // their original bytes, even when the selected receipt has since changed.
  for (const file of [`${directory}/bundle.receipt`, ...result.bundle.groups.map(group => `${group.path}/resources.yaml`)]) {
    if (read(root, 'HEAD', file) !== read(root, revision, file)) throw new Error(`ROLLBACK_BUNDLE_CHANGED:${file}`);
  }
  const files = { 'releases/runtime-images.json': read(root, revision, 'releases/runtime-images.json') };
  const remove = [];
  if (result.bundle.receipt.code) files['releases/runtime-code.json'] = read(root, revision, 'releases/runtime-code.json');
  else if (current.receipt.code) remove.push('releases/runtime-code.json');
  for (const role of ['buster', 'prism', 'prism-agent', 'nova']) files[`releases/values/${role}.yaml`] = read(root, revision, `releases/values/${role}.yaml`);
  for (const [name, bytes] of Object.entries(generated)) files[`gitops/production/${name}`] = bytes;
  return { revision, directory, files, remove };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [url, requested = 'previous'] = process.argv.slice(2);
    const root = path.resolve(import.meta.dirname, '..');
    const plan = planGitOpsRollback(root, url, requested);
    // Build and validate the entire plan before changing any file. Only the
    // explicit deployment selection is restored; source and data stay intact.
    for (const [relative, bytes] of Object.entries(plan.files)) {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
    }
    for (const relative of plan.remove) fs.rmSync(path.join(root, relative), { force: true });
    process.stdout.write(JSON.stringify({ revision: plan.revision, directory: plan.directory }) + '\n');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

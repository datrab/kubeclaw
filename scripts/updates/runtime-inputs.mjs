import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Agent packages are delivered by bundles. These inputs still produce native
// tools, dependencies, gateway extensions or services embedded in images.
export function isImageInput(file) {
  return /^(?:docker\/|cmd\/|contracts\/|go\.(?:mod|sum)$|\.dockerignore$|package(?:-lock)?\.json$|tsconfig\.base\.json$)/u.test(file)
    || /^skills\/(?:prism\/|worker\/core\/|common\/plugin-runtime\/|common\/plugins\/openclaw-agent-observer\/)/u.test(file)
    || /^skills\/.*\/(?:package(?:-lock)?\.json|.*\.(?:c|h))$/u.test(file)
    || /^(?:scripts\/(?:versions|build-plugin-sandbox|registry-client-config)\.mjs|versions\.json)$/u.test(file);
}
export function isDeploymentInput(file) {
  return isImageInput(file) || /^(?:skills\/|contracts\/|packaging\/runtime\/|charts\/(?:kubeclaw|prism)\/|my-values\/(?:nova|buster|prism-agent|prism)-values\.yaml$|gitops\/production\/(?:config\.json|overlays\/)|scripts\/(?:package-agent-skill-bundle\.sh|build-runtime-role-bundle\.mjs|deploy\.sh|gitops[^/]*\.mjs|updates\/)|\.github\/workflows\/(?:build-images|auto-promote-runtime)\.yaml$)/u.test(file);
}
export function inputDigest(root, revision, predicate) {
  if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error('INPUT_REVISION_REQUIRED');
  const entries = execFileSync('git', ['-C', root, 'ls-tree', '-rz', revision], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\0').filter(Boolean).filter(entry => predicate(entry.slice(entry.indexOf('\t') + 1))).map(entry => {
      if (!entry.endsWith('\tversions.json')) return entry;
      const versions = JSON.parse(execFileSync('git', ['-C', root, 'show', `${revision}:versions.json`], { encoding: 'utf8' }));
      // Infra-only chart bumps do not change the agent environment.
      return `versions.json\t${JSON.stringify({ openclaw: versions.openclaw, buildArgs: versions.buildArgs, imageOverrides: versions.imageOverrides })}`;
    }).sort();
  return createHash('sha256').update(entries.join('\0')).digest('hex');
}
if (process.argv[1] === import.meta.filename) {
  const root = process.cwd(), head = process.env.GITHUB_SHA;
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const before = event.pull_request?.base.sha ?? event.before;
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  const changed = predicate => manual || !before || /^0+$/u.test(before)
    || inputDigest(root, before, predicate) !== inputDigest(root, head, predicate);
  const deployment = changed(isDeploymentInput);
  const selection = 'releases/runtime-images.json';
  // Compare production builds with the selected image, not just the last push:
  // a preceding build may have failed or been superseded before selection.
  const selectedCommit = fs.existsSync(selection) ? JSON.parse(fs.readFileSync(selection, 'utf8')).commit : undefined;
  const images = deployment && (changed(isImageInput) || (process.env.GITHUB_EVENT_NAME !== 'pull_request'
    && (!selectedCommit || inputDigest(root, selectedCommit, isImageInput) !== inputDigest(root, head, isImageInput))));
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `image_inputs=${images}\ndeployment_inputs=${deployment}\n`);
}

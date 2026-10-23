import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runtimeImages, runtimeRoles, imageInput, bundleInput, componentSource } from './runtime-components.mjs';

// This is the union of actual image consumers, including the Buster runtime's
// current COPY skills payload. It is also used by stale-rollout checks.
export function isImageInput(file) {
  return runtimeImages.some(name => imageInput(name, file));
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
// Compare both dependency graphs so removed packages/plugins cannot be missed.
export function bundleDigest(root, revision, role, dependencyRevision = revision) {
  return inputDigest(root, revision, bundleInput(root, dependencyRevision, role));
}
export function changedBundles(root, prior, head, force = false) {
  return runtimeRoles.filter(role => {
    if (force || !prior?.bundles?.[role]) return true;
    const source = componentSource(prior, role, 'bundle').commit;
    return bundleDigest(root, source, role) !== bundleDigest(root, head, role)
      || bundleDigest(root, source, role, head) !== bundleDigest(root, head, role, head);
  });
}
export function changedImages(root, prior, head, force = false) {
  return runtimeImages.filter(name => force || !prior?.images?.[name]
    || inputDigest(root, componentSource(prior, name, 'image').commit, file => imageInput(name, file))
      !== inputDigest(root, head, file => imageInput(name, file)));
}
if (process.argv[1] === import.meta.filename) {
  const root = process.cwd(), head = process.env.GITHUB_SHA;
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const before = event.pull_request?.base.sha ?? event.before;
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  const changed = predicate => manual || !before || /^0+$/u.test(before)
    || inputDigest(root, before, predicate) !== inputDigest(root, head, predicate);
  const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  const pr = process.env.GITHUB_EVENT_NAME === 'pull_request';
  const prior = pr && before && !/^0+$/u.test(before)
    ? { commit: before, images: Object.fromEntries(runtimeImages.map(name => [name, true])) }
    : read('releases/runtime-images.json');
  // Compare against selected component sources, including changes from failed or
  // superseded builds. A manual dispatch deliberately refreshes every component.
  const images = changedImages(root, prior, head, manual);
  const deployment = changed(isDeploymentInput) || images.length > 0;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `image_inputs=${images.length > 0}\ndeployment_inputs=${deployment}\nimage_matrix=${JSON.stringify(images)}\n`);
}

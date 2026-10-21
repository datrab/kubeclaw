import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const requireObservation = (condition, code) => {
  if (!condition) throw new Error(`ACTIVE_BUNDLE_${code}`);
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function observeActiveRoleBundle({ selection, role, archive, kubeconfig,
  context, namespace, podName, containerName, expectedUid, kubectl = 'kubectl' }) {
  const slot = new Map([['nova', 'nova'], ['buster', 'buster-gateway'], ['prism', 'prism-agent']]).get(role);
  requireObservation(slot && selection?.images?.[slot], 'ROLE_IMAGE_SELECTION_REQUIRED');
  const code = selection.code, bundle = code?.bundles?.[role];
  requireObservation(/^[a-f0-9]{40}$/u.test(code?.commit ?? '')
    && /^[a-f0-9]{64}$/u.test(bundle?.sha256 ?? '')
    && bundle?.contractVersion === 'v2', 'CODE_SELECTION_REQUIRED');
  requireObservation(kubeconfig && context && expectedUid, 'EXPLICIT_AUTHORITY_REQUIRED');
  for (const value of [namespace, podName, containerName]) {
    requireObservation(typeof value === 'string' && /^[a-z0-9][a-z0-9.-]*$/u.test(value), 'EXPLICIT_TARGET_REQUIRED');
  }
  // Hash and inspect the same in-memory archive, not two mutable file reads.
  requireObservation(fs.statSync(archive).size <= 256 * 1024 * 1024, 'LOCAL_ARCHIVE_READER_LIMIT');
  const archiveBytes = fs.readFileSync(archive);
  requireObservation(sha256(archiveBytes) === bundle.sha256, 'ACCEPTED_ARCHIVE_HASH_MISMATCH');
  const expectedBytes = execFileSync('tar', ['-xOzf', '-', `${role}-${code.commit}/manifest.json`],
    { input: archiveBytes, maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const expected = JSON.parse(expectedBytes.toString('utf8'));
  requireObservation(expected.schemaVersion === 'pipeline-runtime-bundle.v1'
    && expected.bundleKind === 'app-skills-package-set'
    && expected.role === role && expected.commit === code.commit
    && expected.contractVersion === bundle.contractVersion, 'ACCEPTED_MANIFEST_MISMATCH');

  const prefix = [`--kubeconfig=${path.resolve(kubeconfig)}`, `--context=${context}`, `--namespace=${namespace}`];
  const read = args => execFileSync(kubectl, [...prefix, ...args],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const literalEnvironment = (container, name) => {
    const entries = (container.env ?? []).filter(entry => entry.name === name);
    requireObservation(entries.length === 1 && typeof entries[0].value === 'string'
      && !entries[0].valueFrom, 'LITERAL_PROFILE_ENV_REQUIRED');
    return entries[0].value;
  };
  const snapshot = () => {
    const pod = JSON.parse(read(['get', 'pod', podName, '-o', 'json']));
    requireObservation(pod.metadata?.uid === expectedUid && pod.metadata?.name === podName
      && pod.metadata?.namespace === namespace && !pod.metadata.deletionTimestamp, 'POD_IDENTITY_CHANGED');
    const mains = (pod.spec?.containers ?? []).filter(item => item.name === containerName);
    const inits = (pod.spec?.initContainers ?? []).filter(item => item.name === 'init-setup');
    const statuses = (pod.status?.containerStatuses ?? []).filter(item => item.name === containerName);
    const initStatuses = (pod.status?.initContainerStatuses ?? []).filter(item => item.name === 'init-setup');
    requireObservation(mains.length === 1 && inits.length === 1
      && statuses.length === 1 && initStatuses.length === 1, 'EXACT_CONTAINERS_REQUIRED');
    const main = mains[0], init = inits[0], status = statuses[0], initStatus = initStatuses[0];
    requireObservation(main.image === selection.images[slot] && init.image === selection.images[slot], 'REQUESTED_IMAGE_MISMATCH');
    requireObservation(status.state?.running && status.containerID && status.imageID
      && Number.isSafeInteger(status.restartCount) && initStatus.state?.terminated?.exitCode === 0
      && initStatus.containerID && initStatus.imageID, 'RUNNING_CONTAINER_AND_COMPLETED_INIT_REQUIRED');
    for (const [name, value] of Object.entries({ KUBECLAW_CODE_BUNDLE_ENABLED: 'true',
      KUBECLAW_CODE_BUNDLE_AGENT: role, KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT: code.commit,
      KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION: bundle.contractVersion,
      KUBECLAW_CODE_BUNDLE_MANIFEST: '/runtime-config/code-bundle-manifest.json' })) {
      requireObservation(literalEnvironment(main, name) === value, 'MAIN_PROFILE_MISMATCH');
    }
    for (const [name, value] of Object.entries({ CODE_BUNDLE_ENABLED: 'true', CODE_BUNDLE_ARCHIVE_URL: bundle.url,
      CODE_BUNDLE_SHA256: bundle.sha256, CODE_BUNDLE_EXPECTED_COMMIT: code.commit,
      CODE_BUNDLE_CONTRACT_VERSION: bundle.contractVersion, AGENT_NAME: role })) {
      requireObservation(literalEnvironment(init, name) === value, 'INIT_PROFILE_MISMATCH');
    }
    const manifestMount = (main.volumeMounts ?? []).filter(item => item.mountPath === '/runtime-config');
    const initMount = (init.volumeMounts ?? []).filter(item => item.mountPath === '/runtime-config');
    requireObservation(manifestMount.length === 1 && initMount.length === 1
      && manifestMount[0].readOnly === true && manifestMount[0].name === initMount[0].name
      && !manifestMount[0].subPath && !initMount[0].subPath, 'READONLY_SHARED_MANIFEST_PROFILE_REQUIRED');
    const volume = (pod.spec.volumes ?? []).filter(item => item.name === manifestMount[0].name);
    requireObservation(volume.length === 1 && volume[0].emptyDir, 'INIT_MANIFEST_VOLUME_REQUIRED');
    return { uid: pod.metadata.uid, podName, namespace, containerName, requestedImage: main.image,
      imageID: status.imageID, containerID: status.containerID, restartCount: status.restartCount,
      startedAt: status.state.running.startedAt ?? null, initContainerID: initStatus.containerID, initImageID: initStatus.imageID,
      initFinishedAt: initStatus.state.terminated.finishedAt ?? null };
  };
  const before = snapshot();
  const remoteProgram = `
    const fs = require('node:fs'), crypto = require('node:crypto');
    try {
      const file = process.argv[1];
      if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()
        || fs.statSync(file).size > 2 * 1024 * 1024) throw new Error();
      const bytes = fs.readFileSync(file), manifest = JSON.parse(bytes.toString('utf8'));
      process.stdout.write(JSON.stringify({ schemaVersion: manifest.schemaVersion,
        bundleKind: manifest.bundleKind, role: manifest.role, commit: manifest.commit,
        contractVersion: manifest.contractVersion,
        manifestSha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
    } catch { process.stderr.write('ACTIVE_BUNDLE_MANIFEST_READ_FAILED'); process.exitCode = 1; }
  `;
  const observed = JSON.parse(read(['exec', podName, '-c', containerName, '--', 'node', '-e', remoteProgram,
    '/runtime-config/code-bundle-manifest.json']));
  requireObservation(observed.schemaVersion === expected.schemaVersion && observed.bundleKind === expected.bundleKind
    && observed.role === role && observed.commit === code.commit && observed.contractVersion === bundle.contractVersion
    && observed.manifestSha256 === sha256(expectedBytes), 'OBSERVED_MANIFEST_MISMATCH');
  const after = snapshot();
  requireObservation(JSON.stringify(before) === JSON.stringify(after), 'CONTAINER_CHANGED_DURING_OBSERVATION');
  return { schemaVersion: 'kubeclaw-active-bundle-manifest-observation.v1', context, ...after,
    role, codeCommit: code.commit, contractVersion: bundle.contractVersion,
    sourceRunId: code.sourceRunId, sourceRunAttempt: code.sourceRunAttempt,
    acceptedArchiveSha256: bundle.sha256, localArchiveHashVerified: true,
    initConfiguredArchiveHashMatches: true, observedManifestSha256: observed.manifestSha256,
    manifestMatchesAcceptedArchive: true, liveArchiveBytesObserved: false,
    fullActivePayloadVerified: false, loadedModuleIdentityProven: false };
}

if (process.argv[1] === '-') {
  try {
    const [role, archive, kubeconfig, context, namespace, podName, containerName, expectedUid] = process.argv.slice(2);
    const { selectedRelease } = await import(pathToFileURL(path.resolve('scripts/updates/deployment-release.mjs')).href);
    const selection = selectedRelease(process.cwd(), 'runtime');
    const observation = observeActiveRoleBundle({ selection, role, archive, kubeconfig,
      context, namespace, podName, containerName, expectedUid });
    console.log(JSON.stringify(observation, null, 2));
  } catch (error) {
    const message = typeof error?.message === 'string' && /^ACTIVE_BUNDLE_[A-Z_]+$/u.test(error.message)
      ? error.message : 'ACTIVE_BUNDLE_SELECTION_OR_READER_FAILED';
    console.error(message); process.exitCode = 1;
  }
}

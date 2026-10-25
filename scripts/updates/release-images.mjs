import fs from 'node:fs';
import path from 'node:path';
import { changedImages } from './runtime-inputs.mjs';
import { runtimeImages, componentSource, validSource } from './runtime-components.mjs';

// Production build receipts are downloaded from one successful, verified workflow run.
export function collectReceipts(directory, commit, expected) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Full source commit required');
  const receipts = fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
  const images = {};
  for (const receipt of receipts) {
    if (receipt.commit !== commit || !expected.includes(receipt.name) || images[receipt.name]
      || !/^ghcr\.io\/[a-z0-9_-]+\/kubeclaw-[a-z0-9-]+@sha256:[a-f0-9]{64}$/.test(receipt.image)
      || !receipt.image.includes(`/kubeclaw-${receipt.name}@`)) throw new Error('Invalid, duplicate or cross-commit image receipt');
    images[receipt.name] = receipt.image;
  }
  if (Object.keys(images).length !== expected.length) throw new Error('Release is missing required images');
  return { schemaVersion: 1, commit, images };
}
export function collectRuntimeReceipts(directory, commit, prior, source, root = process.cwd(), force = false) {
  if (!source || Object.keys(source).some(key => !['sourceRunId', 'sourceRunAttempt'].includes(key))
    || !validSource({ commit, ...source })) throw new Error('Verified runtime source identity required');
  const expected = changedImages(root, prior, commit, force);
  for (const name of runtimeImages.filter(name => !expected.includes(name))) {
    if (!validSource(componentSource(prior, name, 'image'))) throw new Error(`Invalid retained image source:${name}`);
  }
  const built = collectReceipts(directory, commit, expected);
  return { ...built, ...source,
    images: Object.fromEntries(runtimeImages.map(name => [name, built.images[name] ?? prior?.images[name]])),
    imageSources: Object.fromEntries(runtimeImages.map(name => [name, built.images[name] ? { commit, ...source } : componentSource(prior, name, 'image')])) };
}
if (process.argv[1] === import.meta.filename) {
  const [directory, commit, output, family = "runtime"] = process.argv.slice(2);
  if (!["runtime", "ops"].includes(family)) throw new Error("Unknown release family");
  const names = family === 'ops' ? ['codex-ops', 'ops-mcp'] : ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
  const priorFile = 'releases/runtime-images.json';
  const prior = family === 'runtime' && fs.existsSync(priorFile) ? JSON.parse(fs.readFileSync(priorFile, 'utf8')) : undefined;
  const source = { sourceRunId: Number(process.env.SOURCE_RUN_ID), sourceRunAttempt: Number(process.env.SOURCE_RUN_ATTEMPT) };
  const release = family === 'runtime' ? collectRuntimeReceipts(directory, commit, prior, source, process.cwd(), process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') : collectReceipts(directory, commit, names);
  release.sourceRunId = Number(process.env.SOURCE_RUN_ID);
  if (!Number.isSafeInteger(release.sourceRunId) || release.sourceRunId < 1) throw new Error("Verified source run ID required");
  release.sourceRunAttempt = Number(process.env.SOURCE_RUN_ATTEMPT);
  if (!Number.isSafeInteger(release.sourceRunAttempt) || release.sourceRunAttempt < 1) throw new Error("Verified source run attempt required");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(release, null, 2) + '\n');
}

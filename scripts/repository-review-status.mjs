#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function argumentsMap(values) {
  const output = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('usage: repository-review-status --platform <file> --run-id <id>');
    output.set(key.slice(2), value);
  }
  return output;
}

function jsonFile(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function blobFile(root, digest) {
  const value = String(digest).replace(/^sha256:/u, '');
  return path.join(root, 'blobs', 'sha256', value.slice(0, 2), value.slice(2));
}
function artifactValue(root, artifact) { return jsonFile(blobFile(root, artifact.digest)); }
function lastLines(file, maximumBytes = 1024 * 1024) {
  const size = fs.statSync(file).size, start = Math.max(0, size - maximumBytes);
  const descriptor = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(size - start);
    fs.readSync(descriptor, bytes, 0, bytes.length, start);
    const text = bytes.toString('utf8');
    return text.slice(start === 0 ? 0 : Math.max(0, text.indexOf('\n') + 1)).trim().split('\n').filter(Boolean);
  } finally { fs.closeSync(descriptor); }
}

// eslint-disable-next-line max-lines-per-function, complexity -- One bounded read produces a complete machine-readable snapshot.
function status(values) {
const args = argumentsMap(values);
const platformFile = path.resolve(args.get('platform') ?? '');
const runId = args.get('run-id');
if (!runId) throw new Error('run id is required');
const platform = jsonFile(platformFile);
const artifactRoot = path.resolve(platform.adapters['kubeclaw.artifact-store:artifact-store'].artifactRoot);
const recordFile = path.join(artifactRoot, 'records', 'store.json');
const records = (fs.existsSync(recordFile) ? jsonFile(recordFile).records : [])
  .map(({ payload }) => payload).filter((artifact) => artifact.producer.runId === runId);
const unique = new Map(records.map((artifact) => [`${artifact.artifactId}:${artifact.digest}`, artifact]));
let plannedPrimary = 0, estimatedInputTokens = 0, finalReport = false, planReport = false;
const initialDigests = new Set(), review = new Set(), expansion = new Set(), verification = new Set();
for (const artifact of unique.values()) if (artifact.artifactId.startsWith('repository-review-prepared:')) {
  const prepared = artifactValue(artifactRoot, artifact);
  plannedPrimary = prepared.compilation?.jobs?.length ?? plannedPrimary;
  estimatedInputTokens = prepared.compilation?.accounting?.estimatedInputTokens ?? estimatedInputTokens;
  for (const job of prepared.compilation?.jobs ?? []) initialDigests.add(job.digest);
}
for (const artifact of unique.values()) {
  if (artifact.artifactId.startsWith('repository-review-cache:')) {
    const cached = artifactValue(artifactRoot, artifact);
    const protocol = cached.identity?.reviewerProtocol;
    if (protocol === 'kubeclaw.echo-review-scale-verification.v1') verification.add(cached.unitId);
    else if (protocol === 'kubeclaw.echo-review-scale.v1') {
      (initialDigests.has(cached.unitDigest) ? review : expansion).add(cached.unitId);
    }
  } else if (artifact.artifactId.startsWith('repository-review:')) {
    const report = artifactValue(artifactRoot, artifact);
    if (report.schemaVersion === 'repository-review-report.v1') finalReport = true;
    if (report.schemaVersion === 'repository-review-plan.v1') planReport = true;
  }
}
const eventFile = path.join(path.resolve(platform.storageRoot), 'runs', runId, 'events.jsonl');
const stages = {}, terminal = { status: 'running', occurredAt: undefined };
if (fs.existsSync(eventFile)) for (const line of lastLines(eventFile)) {
  const event = JSON.parse(line).entry;
  if (['stage.succeeded', 'stage.blocked', 'stage.cancelled', 'stage.failed'].includes(event.type)) {
    stages[event.identity.stageId] = event.type.slice('stage.'.length);
  }
  if (['run.succeeded', 'run.blocked', 'run.cancelled', 'run.failed'].includes(event.type)) {
    terminal.status = event.type.slice('run.'.length); terminal.occurredAt = event.occurredAt;
  }
}
return { schemaVersion: 'repository-review-status.v1', runId,
  status: terminal.status, terminalAt: terminal.occurredAt, stages,
  plannedPrimary, completedReviewCheckpoints: review.size,
  remainingPrimary: Math.max(0, plannedPrimary - review.size),
  completedContextExpansionCheckpoints: expansion.size,
  completedVerificationCheckpoints: verification.size,
  estimatedInputTokens, actualTokenUsage: 'unavailable_until_imported_results_expose_usage',
  planReport, finalReport, artifactRecords: records.length };
}

process.stdout.write(`${JSON.stringify(status(process.argv.slice(2)))}\n`);

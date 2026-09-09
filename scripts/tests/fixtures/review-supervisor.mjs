import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repositoryReviewRunRoot } from '../../lib/repository-review-run-root.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
export function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-status-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const platform = path.join(root, 'platform.json');
  const storageRoot = path.join(root, 'state');
  const artifactRoot = path.join(root, 'artifacts');
  const runId = 'supervisor-status-regression';
  const lease = path.join(root, 'lease.json');
  const writePlatform = () => fs.writeFileSync(platform, JSON.stringify({ storageRoot,
    adapters: { 'kubeclaw.artifact-store:artifact-store': { artifactRoot } } }));
  const terminal = status => {
    const events = path.join(repositoryReviewRunRoot(storageRoot, runId), 'events.jsonl');
    fs.mkdirSync(path.dirname(events), { recursive: true });
    fs.writeFileSync(events, JSON.stringify({ entry: { type: `run.${status}`,
      occurredAt: new Date().toISOString(), identity: { runId } } }) + '\n');
  };
  const invoke = () => spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/supervise-repository-review.mjs'),
    '--workdir', repositoryRoot, '--platform', platform, '--graph', path.join(root, 'graph.json'),
    '--run-id', runId, '--heartbeat', path.join(root, 'heartbeat.json'),
    '--resource-log', path.join(root, 'resources.jsonl'), '--diagnostic-dir', path.join(root, 'diagnostics'),
    '--log', path.join(root, 'pipeline.log'), '--lease', lease, '--max-recoveries', '0'],
  { encoding: 'utf8', timeout: 10_000 });
  return { root, platform, artifactRoot, lease, writePlatform, terminal, invoke };
}


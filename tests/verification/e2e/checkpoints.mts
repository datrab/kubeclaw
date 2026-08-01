import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CHECKPOINT_SCHEMA_VERSION = 'real-e2e-checkpoint.v2';
export const CHECKPOINT_NAMES = Object.freeze([
  'fresh',
  'pre-forge',
  'post-forge',
  'pre-module-buster',
  'during-module-buster-wait',
  'pre-module-review',
  'post-module-review',
  'post-approval',
  'pre-final-buster',
  'pre-final-review',
  'post-final-review',
  'pre-terminal-delivery',
  'during-cleanup',
] as const);

export type CheckpointName = typeof CHECKPOINT_NAMES[number];

interface CheckpointManifest {
  readonly schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION;
  readonly checkpoint: CheckpointName;
  readonly sourceRunId: string;
  readonly graphDigest: string;
  readonly registryDigest: string;
  readonly sourceDigest: string;
  readonly capturedAt: string;
}

function digestTree(root: string): string {
  const hash = crypto.createHash('sha256');
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        hash.update(relative);
        hash.update('\0');
        hash.update(fs.readFileSync(absolute));
        hash.update('\0');
      } else {
        throw new Error(`CHECKPOINT_UNSAFE_ENTRY:${relative}`);
      }
    }
  };
  visit(root);
  return hash.digest('hex');
}

function requiredSnapshot(runRoot: string, name: string): Record<string, unknown> {
  const file = path.join(runRoot, name);
  if (!fs.existsSync(file)) throw new Error(`CHECKPOINT_SNAPSHOT_MISSING:${name}`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

export function captureCheckpoint(input: {
  readonly checkpointRoot: string;
  readonly checkpoint: CheckpointName;
  readonly runRoot: string;
  readonly sourceRunId: string;
}): CheckpointManifest {
  if (!CHECKPOINT_NAMES.includes(input.checkpoint)) {
    throw new Error(`CHECKPOINT_NAME_INVALID:${input.checkpoint}`);
  }
  const graph = requiredSnapshot(input.runRoot, 'graph-snapshot.json');
  const registry = requiredSnapshot(input.runRoot, 'registry-snapshot.json');
  const target = path.join(input.checkpointRoot, input.checkpoint);
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(input.runRoot, temporary, { recursive: true, errorOnExist: true });
  const sourceDigest = digestTree(temporary);
  const manifest: CheckpointManifest = Object.freeze({
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    checkpoint: input.checkpoint,
    sourceRunId: input.sourceRunId,
    graphDigest: String(graph.digest ?? ''),
    registryDigest: crypto.createHash('sha256').update(JSON.stringify(registry)).digest('hex'),
    sourceDigest,
    capturedAt: new Date().toISOString(),
  });
  fs.writeFileSync(path.join(temporary, 'checkpoint.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(temporary, target);
  return manifest;
}

export function restoreCheckpoint(input: {
  readonly checkpointRoot: string;
  readonly checkpoint: CheckpointName;
  readonly targetRunRoot: string;
}): CheckpointManifest {
  const source = path.join(input.checkpointRoot, input.checkpoint);
  const manifestPath = path.join(source, 'checkpoint.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`CHECKPOINT_NOT_FOUND:${input.checkpoint}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CheckpointManifest;
  if (manifest.schemaVersion !== CHECKPOINT_SCHEMA_VERSION || manifest.checkpoint !== input.checkpoint) {
    throw new Error(`CHECKPOINT_MANIFEST_INVALID:${input.checkpoint}`);
  }
  const verificationRoot = fs.mkdtempSync(path.join(path.dirname(input.targetRunRoot), '.checkpoint-verify-'));
  try {
    for (const entry of fs.readdirSync(source)) {
      if (entry === 'checkpoint.json') continue;
      fs.cpSync(path.join(source, entry), path.join(verificationRoot, entry), { recursive: true });
    }
    if (digestTree(verificationRoot) !== manifest.sourceDigest) {
      throw new Error(`CHECKPOINT_DIGEST_MISMATCH:${input.checkpoint}`);
    }
    fs.rmSync(input.targetRunRoot, { recursive: true, force: true });
    fs.renameSync(verificationRoot, input.targetRunRoot);
  } catch (error) {
    fs.rmSync(verificationRoot, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze(manifest);
}

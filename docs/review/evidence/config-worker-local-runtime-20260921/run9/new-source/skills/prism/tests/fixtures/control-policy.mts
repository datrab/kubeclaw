import { readTestBundle, writeTestBundle } from '../../../../tests/fixtures/config/swarm-bundle.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

/** Real complete authored file; no loader or production consumer is replaced. */
export function writeControlPolicy(root: string, changes: Record<string, unknown>) {
  const value = readTestBundle(new URL('../../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
  Object.assign(value['prism-control'].settings, changes);
  const file = path.join(root, 'swarm.config.json');
  writeTestBundle(file, value);
  return { SWARM_CONFIG: file };
}

export function controlPolicyFixture(t: TestContext, changes: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-control-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ...writeControlPolicy(root, changes) };
}

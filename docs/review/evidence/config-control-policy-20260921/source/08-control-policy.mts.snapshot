import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

/** Real complete authored file; no loader or production consumer is replaced. */
export function writeControlPolicy(root: string, changes: Record<string, unknown>) {
  const value = JSON.parse(fs.readFileSync(new URL('../../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url), 'utf8'));
  Object.assign(value.operator.prism.control, changes);
  const file = path.join(root, 'swarm.config.json');
  fs.writeFileSync(file, JSON.stringify(value));
  return { SWARM_CONFIG: file };
}

export function controlPolicyFixture(t: TestContext, changes: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-control-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ...writeControlPolicy(root, changes) };
}

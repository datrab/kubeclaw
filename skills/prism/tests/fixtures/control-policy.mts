import { readTestPipeline, writeTestPipeline } from '../../../../tests/fixtures/config/pipeline-components.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

/** Complete current source authors only. Not an authenticated process boot receipt. */
export function writeControlPolicy(root: string, changes: Record<string, unknown>) {
  const documents = readTestPipeline();
  const bindings = documents.entry.bindings.filter((row: {role: string; owner: string; instanceId: string}) =>
    row.role === 'prism' && row.owner === 'prism-control' && row.instanceId === 'kubeclaw/prism/prism-control');
  if (bindings.length !== 1) throw new Error('CONTROL_POLICY_BINDING_REQUIRED');
  Object.assign(documents['prism-control'].profiles[bindings[0].profileId].settings, changes);
  const file = path.join(root, 'pipeline.config.json');
  writeTestPipeline(file, documents);
  return { SWARM_CONFIG: file };
}

export function controlPolicyFixture(t: Pick<TestContext, 'after'>, changes: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-control-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ...writeControlPolicy(root, changes) };
}

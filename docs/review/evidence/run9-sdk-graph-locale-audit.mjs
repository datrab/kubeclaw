// Bounded original contract/snapshot audit, not an all-provider execution test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateContractValue } from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import { graphSnapshot, readRunSnapshot, writeRunSnapshots, verifyPinnedGraph } from '../../../skills/nova/core/execution/engine-snapshots.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const self = fileURLToPath(import.meta.url);
const definition = { schemaVersion: 'pipeline-definition.v2', id: 'audit:aa-az', maxConcurrency: 1,
  stages: ['aa', 'az'].map(id => ({ id, type: 'kubeclaw.prism-design', dependsOn: [], config: {}, input: {}, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 1000 } })) };
// Canonical graph contract admission only; no claim these empty plugin inputs execute.
validateContractValue('pipelineDefinition', definition);
if (process.argv[2] === 'write') {
  writeRunSnapshots(process.argv[3], graphSnapshot(definition), { policy: { aa: 1, az: 2 } });
  const snapshot = readRunSnapshot(process.argv[3]);
  console.log(JSON.stringify({ locale: new Intl.Collator().resolvedOptions().locale, digest: snapshot.digest, graphDigest: snapshot.graph.digest, schema: snapshot.graph.schemaVersion }));
} else if (process.argv[2] === 'read') {
  const snapshot = readRunSnapshot(process.argv[3]), graph = verifyPinnedGraph(process.argv[3], definition);
  console.log(JSON.stringify({ locale: new Intl.Collator().resolvedOptions().locale, digest: snapshot.digest, graphDigest: graph.digest, schema: graph.schemaVersion }));
} else if (process.argv[2] === 'legacy') {
  const graph = graphSnapshot(definition, 'execution-graph-snapshot.v2');
  console.log(JSON.stringify({ locale: new Intl.Collator().resolvedOptions().locale, digest: graph.digest, nodes: graph.nodes.map(node => node.id) }));
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-sdk-graph-audit-'));
  const run = (mode, locale) => {
    const r = spawnSync(process.execPath, [self, mode, directory], { cwd: root, env: { ...process.env, LANG: locale, LC_ALL: locale }, encoding: 'utf8' });
    process.stdout.write(r.stdout); process.stderr.write(r.stderr); assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim());
  };
  try {
    const writer = run('write', 'en_US.UTF-8'), reader = run('read', 'da_DK.UTF-8');
    assert.equal(writer.digest, reader.digest); assert.equal(writer.graphDigest, reader.graphDigest);
    const oldEn = run('legacy', 'en_US.UTF-8'), oldDa = run('legacy', 'da_DK.UTF-8');
    assert.notEqual(oldEn.digest, oldDa.digest);
    console.log(JSON.stringify({ originalContractAccepted: true, currentVersionReopens: true, legacyVersionLocaleDependent: true, controlledVersioningAlreadyPresent: true, allProviderExecution: false, productionFix: false }));
  } finally { fs.rmSync(directory, { recursive: true }); }
}

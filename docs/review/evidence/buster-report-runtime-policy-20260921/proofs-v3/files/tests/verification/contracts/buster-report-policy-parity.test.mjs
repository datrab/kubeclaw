import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { validateBusterReportSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { bundleNames } from '../../fixtures/config/swarm-bundle.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-policy-parity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const chart = path.join(root, 'prism');
  fs.cpSync('charts/prism', chart, { recursive: true, dereference: true });
  for (const relative of [...bundleNames, 'swarm.schema.json', 'swarm-components.schema.json'].map(name => `files/config/${name}`)
    .concat('templates/_swarm-bundle.tpl')) {
    const source = path.resolve('charts/prism', relative), target = path.join(chart, relative);
    fs.unlinkSync(target); fs.copyFileSync(source, target);
    const original = fs.statSync(source), copied = fs.lstatSync(target);
    assert(copied.isFile() && !copied.isSymbolicLink() && copied.nlink === 1);
    assert(fs.realpathSync(target).startsWith(`${fs.realpathSync(root)}${path.sep}`));
    assert(original.dev !== copied.dev || original.ino !== copied.ino);
  }
  const file = path.join(chart, 'files/config/buster-engine.config.json');
  const original = JSON.parse(fs.readFileSync(file, 'utf8'));
  return reports => {
    fs.writeFileSync(file, JSON.stringify({ ...original, settings: { ...original.settings,
      execution: { ...original.settings.execution, reports } } }));
    return spawnSync('helm', ['template', 'report-policy', chart, '--namespace', 'default', '-f', path.join(chart, 'ci-values.yaml')],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  };
}
const maxima = { minimumOpenFiles: 256, minimumHeapMiB: 8589934591, heapFraction: 1, runtimeMemoryReserveBytes: 2147483648 };
for (const [field, maximum] of Object.entries(maxima)) test(`raw schema/Helm reject invalid report ${field}`, t => {
  const render = fixture(t);
  for (const value of [undefined, null, false, true, '1', 0, -1, maximum + 1,
    ...(field === 'heapFraction' ? [1.01] : [1.5])]) {
    const reports = structuredClone(runnerExecutionPolicy.reports);
    if (value === undefined) delete reports[field]; else reports[field] = value;
    assert.throws(() => validateBusterReportSettings(reports), /SWARM_CONFIG_BUSTER_REPORT_POLICY_INVALID/);
    const result = render(reports); assert.notEqual(result.status, 0);
    assert.match(result.stderr, /buster execution reports/);
  }
});
test('schema and Helm preserve exact valid report profiles and coherent bounds', t => {
  const render = fixture(t);
  const profiles = [runnerExecutionPolicy.reports,
    { ...runnerExecutionPolicy.reports, minimumOpenFiles: 1, maximumOpenFiles: 1,
      minimumHeapMiB: 1, heapFraction: 1, runtimeMemoryReserveBytes: 1 },
    { ...runnerExecutionPolicy.reports, minimumOpenFiles: 256, maximumOpenFiles: 256,
      minimumHeapMiB: 8589934591, heapFraction: 0.1, runtimeMemoryReserveBytes: 128 * 1024 * 1024 }];
  for (const reports of profiles) {
    assert.deepEqual(validateBusterReportSettings(reports), reports);
    const result = render(reports); assert.equal(result.status, 0, result.stderr);
    const documents = yaml.loadAll(result.stdout);
    const config = documents.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['buster-engine.config.json']);
    assert(config); assert.deepEqual(JSON.parse(config.data['buster-engine.config.json']).settings.execution.reports, reports);
  }
  // Schema-valid extreme reserve is rejected by actual profile coherence, not
  // advertised as a runnable process profile just because each field is valid.
  for (const reports of [
    { ...runnerExecutionPolicy.reports, minimumOpenFiles: 65, maximumOpenFiles: 64 },
    { ...runnerExecutionPolicy.reports, runtimeMemoryReserveBytes: 2147483648 },
  ]) {
    assert.throws(() => validateBusterReportSettings(reports), /SWARM_CONFIG_BUSTER_(?:REPORT_DESCRIPTOR_RANGE|EXECUTION_REPORT_MEMORY)_INVALID/);
    const result = render(reports); assert.notEqual(result.status, 0);
    assert.match(result.stderr, /buster execution report (?:minimumOpenFiles|memory)/);
  }
});

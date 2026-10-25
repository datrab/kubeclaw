#!/usr/bin/env node
// Registered read-only family gate: semantic comparisons precede native boundary controls.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const children = [
  'check-capability-vocabulary-drift.mjs',
  'check-capability-policy-drift.mjs',
  'check-capability-registrations-drift.mjs',
  'check-capability-swarm-boundary.mjs',
];
if (process.argv.includes('--describe-discovery')) {
  const descriptors = children.map(script => {
    const result = spawnSync(process.execPath, [`scripts/${script}`, '--describe-discovery'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.signal || result.status !== 0) throw new Error(`Capability discovery input/tool error: ${script}: ${result.error ?? result.signal ?? result.stderr}`);
    return JSON.parse(result.stdout);
  });
  console.log(JSON.stringify({ owner: 'scripts/check-capability-drift.mjs', mode: 'delegated-documentation-discovery', children: descriptors, qualification: 'Not effective grants, deployment or independent acceptance' }));
  process.exit(0);
}
for (const script of children) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.signal) {
    console.error(`Capability gate input/tool error: ${result.error ?? result.signal}`);
    process.exit(2);
  }
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    // Only an explicit semantic comparison can prove documentation drift.
    if (result.status === 1 && /DOC_DRIFT_CAPABILITY: docs\/site\/reference\/capabilities\.md:/u.test(result.stderr)) process.exit(1);
    process.exit(2);
  }
}
console.log('Capability vocabulary, all discovered registration declarations, example policy and native swarm/grant/provider/denial boundaries PASS; canonical page exact. No effective deployment or independent acceptance claimed.');

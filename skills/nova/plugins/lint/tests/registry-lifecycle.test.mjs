import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildToolRegistry, TOOL_ADAPTERS } from '../src/engine/tool-registry.ts';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const canonical = JSON.parse(fs.readFileSync(path.join(repository, 'charts/kubeclaw/files/config/lint-policy.json'), 'utf8'));
const projectTypes = new Set(canonical.projects[0].languages);

assert.equal(buildToolRegistry(canonical, projectTypes).length, TOOL_ADAPTERS.length);

const policyOnly = structuredClone(canonical);
policyOnly.tools.push({
  id: 'fixture-policy-only', required: false, category: 'lint', scope: 'repository', tier: 'full', timeout_ms: 1000,
  blocking_severity: 'error', languages: [], config_path: null, arguments: [], targets: ['.'], include: ['**/*'], exclude: [],
});
assert.throws(() => buildToolRegistry(policyOnly, projectTypes), (error) => error?.code === 'LINT_POLICY_ADAPTER_MISSING');

const adapterOnly = structuredClone(canonical);
adapterOnly.tools = adapterOnly.tools.filter((tool) => tool.id !== TOOL_ADAPTERS[0].id);
assert.throws(() => buildToolRegistry(adapterOnly, projectTypes), (error) => error?.code === 'LINT_POLICY_TOOL_MISSING');

console.log(JSON.stringify({ ok: true, suite: 'lint-registry-lifecycle', policyOnly: 'rejected', adapterOnly: 'rejected' }));

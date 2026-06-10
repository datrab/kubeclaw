import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { aggregateUsage, isBudgetExceeded } from '../../../../../skills/nova/pipeline/services/observability.ts';

function tempConfig() {
  const dir = fs.mkdtempSync(path.join('/home', 'observability-budget-test-'));
  return {
    project: 'fixture',
    paths: {
      swarm_dir: path.join(dir, '.swarm'),
    },
    observability: {
      budget: {
        hard_limit_cost_usd: 1,
      },
    },
  };
}

test('isBudgetExceeded fails closed when usage snapshots JSONL is corrupt', () => {
  const config = tempConfig();
  const costDir = path.join(config.paths.swarm_dir, 'logs', 'cost');
  fs.mkdirSync(costDir, { recursive: true });
  fs.writeFileSync(
    path.join(costDir, 'usage-snapshots.jsonl'),
    JSON.stringify({
      agent_type: 'forge',
      input_tokens: 10,
      output_tokens: 20,
      estimated_cost_usd: 2,
    }) + '\n{bad json\n',
  );

  assert.equal(isBudgetExceeded(config), true);
});

test('aggregateUsage preserves valid snapshots when later JSONL lines are corrupt', () => {
  const config = tempConfig();
  const costDir = path.join(config.paths.swarm_dir, 'logs', 'cost');
  fs.mkdirSync(costDir, { recursive: true });
  fs.writeFileSync(
    path.join(costDir, 'usage-snapshots.jsonl'),
    JSON.stringify({
      agent_type: 'forge',
      input_tokens: 10,
      output_tokens: 20,
      estimated_cost_usd: 2,
    }) + '\n{bad json\n',
  );

  const usage = aggregateUsage(config);

  assert.equal(usage.run.estimated_cost_usd, 2);
  assert.equal(usage.run.input_tokens, 10);
  assert.equal(usage.run.output_tokens, 20);
  assert.equal(usage.run.partial, true);
  assert.equal(usage.corrupt, true);
});

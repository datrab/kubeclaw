import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { aggregateUsage, appendStructuredEvent, isBudgetExceeded, writeCostReport } from '../../../../../skills/nova/pipeline/services/observability.ts';

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

test('appendStructuredEvent writes durable event ids to global and run-scoped streams', () => {
  const config = tempConfig();
  config._runId = 'run-observability-event-id';
  config.run_id = config._runId;
  config.telemetry = { stream_max_len: 100 };

  const result = appendStructuredEvent(config, 'pipeline.started', {
    modules: [],
    gates: [],
    execution_order: [],
    resume: false,
  });

  assert.equal(result.ok, true);
  assert.match(result.event.event_id, /^event-/);

  const globalPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'pipeline.jsonl');
  const runPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'pipeline.jsonl');
  for (const filePath of [globalPath, runPath]) {
    const line = fs.readFileSync(filePath, 'utf8').trim();
    const event = JSON.parse(line);
    assert.equal(event.event_id, result.event.event_id);
    assert.equal(event.run_id, config._runId);
    assert.equal(event.project, config.project);
  }
});

test('writeCostReport uses canonical run facts for module and gate counts', () => {
  const config = tempConfig();
  config._runId = 'run-cost-report-facts';
  config.run_id = config._runId;
  const progress = {
    modules: {
      '01-nginx': { title: 'Nginx', dir: 'modules/01-nginx' },
    },
    gates: {
      'final-buster': { type: 'buster', title: 'Final Buster' },
    },
  };

  const report = writeCostReport(config, { progress });

  assert.equal(report.run_facts.modules.total, 1);
  assert.equal(report.run_facts.gates.total, 1);
  assert.equal(report.run_facts.source.modules, 'progress_config');
  assert.equal(report.run_facts.source.gates, 'progress_config');
});

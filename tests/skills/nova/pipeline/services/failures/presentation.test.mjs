import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { injectNeedsNova } from '../../../../../../skills/nova/pipeline/services/failures/presentation.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-injection-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'nova-injection-test',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(swarmDir, 'modules'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
    gateway: {
      invoke: {
        retry: {
          max_attempts: 1,
          retry_delay_ms: 0,
        },
        session_send: {
          timeout_ms: 100,
        },
      },
    },
  };
}

test('Nova handoff records delivered Gateway session prompt as the only successful path', async () => {
  const config = makeConfig();
  const sends = [];

  await injectNeedsNova(config, {
    exit: 10,
    module: 'alpha',
    reason: 'needs operator input',
    fail_count: 1,
    max_fails: 2,
    terminal_decision: { action: 'request_handoff' },
  }, 'nova-channel', 'module', 'alpha', {
    sendGatewaySessionMessage: async (sessionKey, message, timeoutMs, policy) => {
      sends.push({ sessionKey, message, timeoutMs, policy });
      return {
        result: {
          delivery: {
            status: 'sent',
            sessionKey: 'agent:main:discord:channel:nova-channel',
            turnId: 'turn-1',
          },
        },
      };
    },
  });

  const runLogPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', 'run-test', 'nova-injections.jsonl');
  const entries = fs.readFileSync(runLogPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const entry = entries.at(-1);

  assert.equal(sends.length, 1);
  assert.equal(sends[0].sessionKey, 'agent:main:discord:channel:nova-channel');
  assert.match(sends[0].message, /Nova handoff required: alpha/);
  assert.equal(sends[0].timeoutMs, 100);
  assert.equal(entry.status, 'ok');
  assert.equal(entry.delivery_surface, 'gateway_sessions_send');
  assert.equal(entry.delivery_status, 'gateway_sessions_send_delivered');
  assert.equal(entry.delivery_acknowledged, true);
  assert.equal(entry.session_key, 'agent:main:discord:channel:nova-channel');
  assert.equal(entry.delivery_session_key, 'agent:main:discord:channel:nova-channel');
  assert.equal(entry.turn_id, 'turn-1');
});

test('Nova handoff fails when Gateway session prompt receipt is missing', async () => {
  const config = makeConfig();
  const sends = [];

  await injectNeedsNova(config, {
    exit: 10,
    reason: 'needs operator input',
    terminal_decision: { action: 'request_handoff' },
  }, 'nova-channel', 'validator', 'validator:full_lint', {
    sendGatewaySessionMessage: async (sessionKey, message) => {
      sends.push({ sessionKey, message });
      return { result: { delivery: { status: 'unknown' } } };
    },
  });

  const runLogPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', 'run-test', 'nova-injections.jsonl');
  const entries = fs.readFileSync(runLogPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const entry = entries.at(-1);

  assert.equal(entry.status, 'failed');
  assert.equal(entry.delivery_surface, 'gateway_sessions_send');
  assert.equal(entry.delivery_status, 'gateway_sessions_send_receipt_missing');
  assert.equal(entry.intent_status, 'recorded');
  assert.equal(entry.delivery_content_known, true);
  assert.equal(entry.delivery_acknowledged, false);
  assert.equal(entry.error, 'gateway sessions_send delivery receipt missing');
  assert.equal(sends.length, 1);
  assert.match(sends[0].message, /Project: nova-injection-test/);
  assert.doesNotMatch(sends[0].message, /Cronjob/i);
});

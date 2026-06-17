#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  buildNotificationEventInput,
  validateNotificationEventInput,
  validateDiscordOperatorPresentation,
} from '../../../skills/nova/pipeline/services/notification-contract.ts';
import {
  buildTelemetrySinkInput,
  validateTelemetrySinkInput,
} from '../../../skills/nova/pipeline/services/telemetry-sink-contract.ts';

const ctx = {
  runId: 'run-notify-contract',
  config: {
    project: 'notification-contract',
    run_id: 'run-notify-contract',
  },
};

const pathOnlyInput = buildNotificationEventInput(ctx, 'module.completed', {
  ids: {
    moduleId: 'module-a',
    attempt: 1,
  },
  presentation: {
    discord: {
      critical: true,
      title: 'Module completed',
      fields: [
        { name: 'Evidence', value: '.swarm/logs/pipeline/runs/run-notify-contract/summary.json', inline: false },
      ],
    },
  },
  occurredAt: '2026-06-16T00:00:00.000Z',
});
const pathOnlyErrors = validateNotificationEventInput(pathOnlyInput);
assert(pathOnlyErrors.includes('critical Discord notification must include verdict/status/outcome'));
assert(pathOnlyErrors.includes('critical Discord notification must include next action/action'));

const validModuleInput = buildNotificationEventInput(ctx, 'module.completed', {
  ids: {
    moduleId: 'module-a',
    attempt: 1,
  },
  presentation: {
    discord: {
      critical: true,
      title: 'Module completed',
      fields: [
        { name: 'Verdict', value: 'FAIL', inline: true },
        { name: 'Next Action', value: 'request_fix', inline: true },
        { name: 'Evidence', value: 'run-scoped module output and summary', inline: false },
      ],
    },
  },
  occurredAt: '2026-06-16T00:00:00.000Z',
});
assert.deepEqual(validateNotificationEventInput(validModuleInput), []);

const missingGateIdentityInput = buildNotificationEventInput(ctx, 'gate.completed', {
  presentation: {
    discord: {
      level: 'CRITICAL',
      status: 'BLOCKED',
      action: 'request_handoff',
      fields: [
        { name: 'Evidence', value: 'gate output rejected', inline: false },
      ],
    },
  },
  occurredAt: '2026-06-16T00:00:00.000Z',
});
assert(validateNotificationEventInput(missingGateIdentityInput).includes('gate Discord notification must include ids.gateId'));

const placeholderOnlyErrors = validateDiscordOperatorPresentation({
  level: 'ERROR',
  critical: true,
  status: {},
  action: false,
  fields: [
    { name: 'Evidence', value: 'operator-visible artifact path', inline: false },
  ],
});
assert(placeholderOnlyErrors.includes('critical Discord notification must include verdict/status/outcome'));
assert(placeholderOnlyErrors.includes('critical Discord notification must include next action/action'));

assert.deepEqual(validateDiscordOperatorPresentation({
  critical: false,
  fields: [
    { name: 'Evidence', value: '.swarm/logs/pipeline/latest.json', inline: false },
  ],
}), [], 'non-critical informational Discord presentations are not forced into terminal verdict/action shape');

for (const level of ['WARN', 'ERROR', 'CRITICAL']) {
  const telemetryPathOnlyInput = buildTelemetrySinkInput(ctx, 'pipeline.operator_alert', {
    run_id: 'run-notify-contract',
  }, {
    presentation: {
      discord: {
        level,
        title: 'Path only',
        fields: [
          { name: 'Evidence', value: '.swarm/logs/pipeline/latest.json', inline: false },
        ],
      },
    },
    occurredAt: '2026-06-16T00:00:00.000Z',
  });
  const telemetryPathOnlyErrors = validateTelemetrySinkInput(telemetryPathOnlyInput);
  assert(telemetryPathOnlyErrors.includes('telemetry sink severe Discord alert must include verdict/status/outcome'));
  assert(telemetryPathOnlyErrors.includes('telemetry sink severe Discord alert must include next action/action'));
}

const telemetryValidInput = buildTelemetrySinkInput(ctx, 'pipeline.operator_alert', {
  run_id: 'run-notify-contract',
  terminal_status: 'BLOCKED',
  action: 'Fix the failed gate and resume',
}, {
  presentation: {
    discord: {
      level: 'CRITICAL',
      title: 'Pipeline blocked',
      fields: [
        { name: 'Status', value: 'BLOCKED', inline: true },
        { name: 'Next Action', value: 'Fix the failed gate and resume', inline: true },
        { name: 'Run ID', value: 'run-notify-contract', inline: true },
      ],
    },
  },
  occurredAt: '2026-06-16T00:00:00.000Z',
});
assert.deepEqual(validateTelemetrySinkInput(telemetryValidInput), []);

console.log(JSON.stringify({
  ok: true,
  contract: 'notification-operator-identity',
  rejected_path_only: true,
  rejected_telemetry_path_only: true,
  accepted_actionable: true,
}, null, 2));

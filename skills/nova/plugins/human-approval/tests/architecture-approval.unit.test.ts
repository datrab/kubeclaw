import assert from 'node:assert/strict';
import type { PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import { execute } from '../src/architecture-approval.ts';

function context(findings: readonly Readonly<Record<string, unknown>>[]) {
  const calls: Array<{ capability: string; request: Readonly<Record<string, unknown>> }> = [];
  const value = {
    contract: {
      config: { target: 'discord', issuerId: 'operator-1', timeoutMinutes: 10 },
      guidance: undefined,
      lease: {
        attempt: {
          runId: 'run:architecture-approval',
          stageId: 'architecture-approval',
          attemptId: 'attempt:1',
          attemptNumber: 1,
        },
      },
    },
    invoke: async (capability: string, request: Readonly<Record<string, unknown>>) => {
      calls.push({ capability, request });
      if (capability === 'artifacts.read') return { value: { findings } };
      if (capability === 'operator.request') return { accepted: true };
      if (capability === 'signal.wait') {
        const payload = request.payload as Readonly<Record<string, unknown>>;
        return {
          created: true,
          wait: {
            schemaVersion: 'wait-request.v2',
            waitId: 'wait:architecture-approval',
            kind: 'signal',
            signalType: payload.signalType,
            authorizedIssuer: payload.authorizedIssuer,
            expiresAt: payload.expiresAt,
            request: payload.request,
          },
        };
      }
      throw new Error(`unexpected capability: ${capability}`);
    },
  } as unknown as PluginInvocationContext;
  return { value, calls };
}

const input = {
  summary: 'Review architecture findings before Forge.',
  artifactId: 'architecture-validation',
  namespace: 'kubeclaw.architecture-validator',
};

const clean = context([]);
assert.equal((await execute(input, clean.value)).outcome, 'passed');
assert.deepEqual(clean.calls.map((call) => call.capability), ['artifacts.read']);

const warning = context([{
  id: 'ARCHITECTURE_BOUNDARY_RISK',
  severity: 'warn',
  explanation: 'The integration boundary is unclear.',
  remediation: 'Declare the API owner.',
}]);
const pending = await execute(input, warning.value);
assert.equal(pending.outcome, 'wait');
assert.deepEqual(
  warning.calls.map((call) => call.capability),
  ['artifacts.read', 'operator.request', 'signal.wait'],
);
const operatorPayload = warning.calls[1]!.request.payload as Readonly<Record<string, unknown>>;
assert.match(String(operatorPayload.summary), /ARCHITECTURE_BOUNDARY_RISK/);
assert.match(String(operatorPayload.summary), /Declare the API owner/);

const multiline = context([{
  id: 'MULTILINE_FINDING',
  severity: 'error',
  explanation: 'The boundary spans\nmultiple components.',
  remediation: 'Declare the owner.\nDocument the handoff.',
}]);
assert.equal((await execute(input, multiline.value)).outcome, 'wait');
const multilineSummary = String(
  (multiline.calls[1]!.request.payload as Readonly<Record<string, unknown>>).summary,
);
assert.doesNotMatch(multilineSummary, /[\r\n]/u);
assert.match(multilineSummary, /multiple components/);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.human-approval',
  suite: 'architecture-approval-unit',
}));

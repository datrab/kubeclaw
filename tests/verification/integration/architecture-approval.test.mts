import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AdapterActivationContext, AdapterInvocation, ArtifactRef, PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { execute } from '../../../skills/nova/plugins/human-approval/src/architecture-approval.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-approval-'));
const adapter = activate({ config: { artifactRoot: root } } as AdapterActivationContext);
const producer = { runId: 'architecture:run', stageId: 'architecture', attemptNumber: 1, attemptId: 'architecture:1' };
const input = { summary: 'Review architecture findings before Forge.', artifactId: 'architecture-validation', namespace: 'kubeclaw.architecture-validator' };
let sequence = 0;
const invoke = async (capability: string, request: any) => adapter.invoke({ confidential: true,
  signal: new AbortController().signal, request: { ...request, capability, attempt: producer, idempotencyKey: `artifact:${++sequence}` },
} as AdapterInvocation);
const context = (artifacts: ArtifactRef[]) => ({ contract: { artifacts, lease: { attempt: producer } }, invoke }) as unknown as PluginInvocationContext;
const write = async (value: unknown) => (await invoke('artifacts.write', { operation: 'put_json',
  resource: { type: 'artifact.object', canonicalId: input.artifactId },
  payload: { namespace: input.namespace, mediaType: 'application/json', value } })).artifact as ArtifactRef;
try {
  await adapter.ready();
  const clean = await write({ verdict: 'passed', findings: [], checkedFiles: ['design.md'], summary: 'Consistent.' });
  assert.equal((await execute(input, context([clean]))).outcome, 'passed');
  // A later stored report must not replace the exact artifact supplied by the core.
  const blocked = await write({ verdict: 'blocked', findings: [], summary: 'Invalid.' });
  assert.equal((await execute(input, context([clean]))).outcome, 'passed');
  await assert.rejects(() => execute(input, context([blocked])), /REPORT_NOT_PASSED/);
  await assert.rejects(() => execute(input, context([])), /REFERENCE_MISSING_OR_AMBIGUOUS/);
  await assert.rejects(() => execute(input, context([clean, blocked])), /REFERENCE_MISSING_OR_AMBIGUOUS/);
  await assert.rejects(() => execute(input, context([{ ...clean, producer: { ...producer, runId: 'another:run' } }])), /REFERENCE_MISSING_OR_AMBIGUOUS/);
  await assert.rejects(() => execute(input, context([{ ...clean, sizeBytes: clean.sizeBytes + 1 }])), /ARTIFACT_REFERENCE_CORRUPT/);
  const malformed = await write({ verdict: 'passed' });
  await assert.rejects(() => execute(input, context([malformed])), /FINDINGS_INVALID/);
  const finding = { id: 'risk-1', severity: 'warn', scope: 'integration_boundary', paths: ['design.md'],
    explanation: 'The operator must accept this documented tradeoff.', remediation: 'Record the decision.' };
  const risk = await write({ verdict: 'passed', findings: [finding], checkedFiles: ['design.md'], summary: 'Risk requires approval.' });
  const riskContext = (reason?: string, issuerId = 'operator:test') => ({ ...context([risk]), contract: {
    ...context([risk]).contract, config: { target: 'operators', issuerId: 'operator:test' },
    guidance: { decision: 'approved', issuer: { type: 'operator', id: issuerId }, ...(reason === undefined ? {} : { reason }) },
  } }) as unknown as PluginInvocationContext;
  await assert.rejects(() => execute(input, riskContext()), /ARCHITECTURE_APPROVAL_REASON_REQUIRED/);
  await assert.rejects(() => execute(input, riskContext('   ')), /ARCHITECTURE_APPROVAL_REASON_REQUIRED/);
  await assert.rejects(() => execute(input, riskContext('Accepted deliberately.', 'operator:foreign')), /APPROVAL_ISSUER_DENIED/);
  assert.equal((await execute(input, riskContext('Accepted this reviewed tradeoff.'))).outcome, 'passed');
  const contradictory = await write({ verdict: 'passed', findings: [{ ...finding, severity: 'blocking' }], summary: 'Must stay blocked.' });
  await assert.rejects(() => execute(input, context([contradictory])), /ARCHITECTURE_APPROVAL_BLOCKING_FINDING/);
} finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.human-approval', suite: 'architecture-durable-evidence' }));

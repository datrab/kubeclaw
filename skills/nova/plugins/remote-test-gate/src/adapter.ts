import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createProductionNovaTestGate } from '@kubeclaw/nova-core';
import { validatePipelineTestGateContract, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { AdapterActivationContext, AdapterInstance, AdapterInvocation } from '@kubeclaw/plugin-sdk';

function canonicalDirectory(value: unknown, code: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(code);
  const canonical = fs.realpathSync(value);
  if (!fs.statSync(canonical).isDirectory()) throw new Error(code);
  return canonical;
}

function string(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
  return value;
}

function positiveInteger(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) throw new Error(code);
  return Number(value);
}

async function secret(context: AdapterActivationContext, name: string): Promise<string> {
  const result = await context.invokeConfidential('secrets.read', {
    operation: 'resolve', resource: { type: 'secret.name', canonicalId: name }, payload: {},
  });
  return string(result.value, 'REMOTE_TEST_GATE_SECRET_UNAVAILABLE');
}

function grants(value: unknown, plan: ResolvedTestPlanV1): ReadonlyMap<string, readonly string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('REMOTE_TEST_GATE_GRANTS_INVALID');
  const source = value as Record<string, unknown>;
  const expected = [...plan.nodes.map((node) => node.id)].sort();
  if (JSON.stringify(Object.keys(source).sort()) !== JSON.stringify(expected)) throw new Error('REMOTE_TEST_GATE_GRANTS_INVALID');
  return new Map(expected.map((nodeId) => {
    const item = source[nodeId];
    if (!Array.isArray(item) || item.some((capability) => typeof capability !== 'string')) {
      throw new Error('REMOTE_TEST_GATE_GRANTS_INVALID');
    }
    return [nodeId, Object.freeze([...new Set(item)].sort())] as const;
  }));
}

function parseConfig(context: AdapterActivationContext) {
  const endpoint = new URL(string(context.config.endpoint, 'REMOTE_TEST_GATE_CONFIG_INVALID'));
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('REMOTE_TEST_GATE_PROTOCOL_INVALID');
  const stateRoot = path.resolve(string(context.config.stateRoot, 'REMOTE_TEST_GATE_CONFIG_INVALID'));
  const roots = (context.config.allowedRepositoryRoots as unknown[]).map((root) => canonicalDirectory(root,
    'REMOTE_TEST_GATE_CONFIG_INVALID'));
  const authentication = context.config.authentication === 'spiffe-proxy' ? 'spiffe-proxy' : 'bearer';
  if (authentication === 'spiffe-proxy' && !['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname)) {
    throw new Error('REMOTE_TEST_GATE_SPIFFE_PROXY_NOT_LOOPBACK');
  }
  return Object.freeze({ endpoint: endpoint.href, stateRoot, roots,
    authentication,
    tokenSecret: authentication === 'bearer'
      ? string(context.config.tokenSecret, 'REMOTE_TEST_GATE_CONFIG_INVALID') : undefined,
    privateKeySecret: string(context.config.sourcePrivateKeySecret, 'REMOTE_TEST_GATE_CONFIG_INVALID'),
    sourceAuthority: string(context.config.sourceAuthority, 'REMOTE_TEST_GATE_CONFIG_INVALID') });
}

async function execute(context: AdapterActivationContext, config: ReturnType<typeof parseConfig>, invocation: AdapterInvocation) {
  const { request, signal } = invocation;
  if (request.capability !== 'test.plan.execute' || request.operation !== 'run'
    || request.resource.type !== 'test.resolved-plan') throw new Error('REMOTE_TEST_GATE_OPERATION_UNSUPPORTED');
  const repositoryRoot = canonicalDirectory(request.payload.repositoryRoot, 'REMOTE_TEST_GATE_REPOSITORY_INVALID');
  if (!config.roots.some((root) => repositoryRoot === root || repositoryRoot.startsWith(`${root}${path.sep}`))) {
    throw new Error('REMOTE_TEST_GATE_REPOSITORY_DENIED');
  }
  validatePipelineTestGateContract('resolvedTestPlan', request.payload.plan);
  const plan = request.payload.plan as ResolvedTestPlanV1;
  const token = config.tokenSecret ? await secret(context, config.tokenSecret) : undefined;
  const privateKey = await secret(context, config.privateKeySecret);
  const gate = createProductionNovaTestGate({ stateRoot: config.stateRoot, endpoint: config.endpoint,
    ...(token ? { token } : {}), authentication: config.authentication,
    sourceAuthority: config.sourceAuthority, sourceAttestationPrivateKey: privateKey,
    pollMilliseconds: 500, maximumResponseBytes: 64 * 1024 * 1024,
    maximumResultBytes: 64 * 1024 * 1024, maximumArchiveBytes: 64 * 1024 * 1024,
    maximumArchiveStoreBytes: 1024 * 1024 * 1024, maximumEvidenceBytes: 64 * 1024 * 1024,
    maximumEvidenceStoreBytes: 1024 * 1024 * 1024,
    recordLimits: { maximumRecords: 10_000, maximumBytes: 1024 * 1024 * 1024,
      maximumRecordBytes: 64 * 1024 * 1024 } });
  const result = await gate.execute({ idempotencyKey: request.idempotencyKey,
    pipelineStageId: plan.planId, plan, repositoryRoot,
    repositoryId: string(request.payload.repositoryId, 'REMOTE_TEST_GATE_REPOSITORY_ID_INVALID'),
    grants: grants(request.payload.grants, plan),
    maximumConcurrency: positiveInteger(request.payload.maximumConcurrency, 64, 'REMOTE_TEST_GATE_CONCURRENCY_INVALID'),
    submittedAt: string(request.payload.submittedAt, 'REMOTE_TEST_GATE_SUBMITTED_AT_INVALID'),
    timeoutMs: positiveInteger(request.payload.timeoutMs, 7_200_000, 'REMOTE_TEST_GATE_TIMEOUT_INVALID'), signal });
  const reference = result.remote.status.result;
  if (!reference) throw new Error('REMOTE_TEST_GATE_RESULT_MISSING');
  return Object.freeze({ schemaVersion: 'test-plan-receipt.v1', provider: 'buster-plan-v1',
    jobId: result.remote.status.jobId, completedAt: result.remote.status.updatedAt,
    resultDigest: reference.contentDigest, decision: result.remote.decision,
    receiptDigest: crypto.createHash('sha256').update(JSON.stringify(result.remote.decision)).digest('hex') });
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const config = parseConfig(context);
  let stopping = false;
  return {
    async ready() { if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN'); },
    async invoke(invocation) {
      if (!invocation.confidential) invocation.fence.assertCurrent();
      if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (invocation.signal.aborted) throw new Error('ADAPTER_CANCELLED');
      return execute(context, config, invocation);
    },
    async shutdown() { stopping = true; },
  };
}

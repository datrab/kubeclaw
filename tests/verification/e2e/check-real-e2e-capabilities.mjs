#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { withRealE2ERedisClient } from './redis-test-client.mjs';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG || '/home/node/.openclaw/openclaw.json';
const DEFAULT_REAL_E2E_MODEL = 'openai/gpt-5.3-codex-spark';
const DEFAULT_CONFIG_PROBE_PROJECT = 'pipeline-smoke-landing';

function parseArgs(argv) {
  const args = { mode: 'full', json: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      args.mode = argv[++index] || '';
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!['fast', 'full'].includes(args.mode)) throw new Error('--mode must be fast or full');
  return args;
}

function usage() {
  return `Usage: node tests/verification/e2e/check-real-e2e-capabilities.mjs [--mode fast|full]\n`;
}

function commandExists(command) {
  const paths = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return paths.some((entry) => {
    try {
      fs.accessSync(path.join(entry, command), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function sanitizeOutput(value, max = 20000) {
  const text = String(value || '').trim();
  return text.length <= max ? text : `${text.slice(0, max)}...[${text.length - max} chars omitted]`;
}

async function execCapture(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd || REPO_ROOT,
      encoding: 'utf8',
      timeout: options.timeout || 30000,
      maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
      env: options.env || process.env,
    });
    return {
      ok: true,
      stdout: sanitizeOutput(result.stdout),
      stderr: sanitizeOutput(result.stderr),
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.code ?? null,
      signal: error?.signal ?? null,
      stdout: sanitizeOutput(error?.stdout),
      stderr: sanitizeOutput(error?.stderr),
      error: error?.message || String(error),
    };
  }
}

async function runCheck(checks, name, code, fn) {
  const startedAt = Date.now();
  try {
    const details = await fn();
    const ok = details?.ok !== false;
    checks.push({
      name,
      code,
      ok,
      duration_ms: Date.now() - startedAt,
      ...(details || {}),
    });
  } catch (error) {
    checks.push({
      name,
      code,
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: error?.message || String(error),
    });
  }
}

function readOpenClawConfig() {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
}

function resolveDiscordTarget(openclawConfig) {
  return process.env.REAL_E2E_DISCORD_TARGET
    || process.env.REAL_E2E_DISCORD_CHANNEL_ID
    || process.env.DISCORD_CHANNEL_ID
    || process.env.DISCORD_CHANNEL
    || openclawConfig?.verification?.real_e2e?.discord_target
    || null;
}

function resolveDiscordWebhook(openclawConfig) {
  return process.env.REAL_E2E_DISCORD_WEBHOOK
    || process.env.DISCORD_WEBHOOK
    || openclawConfig?.verification?.real_e2e?.discord_webhook_url
    || openclawConfig?.discord_webhook_url
    || null;
}

function withDiscordWebhookWait(url) {
  if (!url || typeof url !== 'string') return url || '';
  const parsed = new URL(url);
  parsed.searchParams.set('wait', 'true');
  return parsed.toString();
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function readReusedDiscordDeliveryResult(env = process.env) {
  const raw = env.REAL_E2E_DISCORD_DELIVERY_RESULT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        reason: 'INFRA_DISCORD_REUSED_RECEIPT_INVALID',
        error: 'REAL_E2E_DISCORD_DELIVERY_RESULT_JSON must be a JSON object',
      };
    }
    return {
      ...parsed,
      reused_from_matrix: true,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'INFRA_DISCORD_REUSED_RECEIPT_INVALID',
      error: error?.message || String(error),
    };
  }
}

export function readReusedCapabilityProbeResult(env = process.env) {
  const raw = env.REAL_E2E_CAPABILITY_PROBE_RESULT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        mode: env.REAL_E2E_MODE || 'unknown',
        source_root: REPO_ROOT,
        hostname: os.hostname(),
        checks: [],
        failures: [{
          ok: false,
          reason: 'REAL_E2E_REUSED_CAPABILITY_PROBE_INVALID',
          error: 'REAL_E2E_CAPABILITY_PROBE_RESULT_JSON must be a JSON object',
        }],
        reused_from_matrix: true,
      };
    }
    const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
    const failures = Array.isArray(parsed.failures)
      ? parsed.failures
      : checks.filter((check) => check?.ok === false);
    return {
      ...parsed,
      checks,
      failures,
      ok: failures.length === 0 && parsed.ok === true,
      reused_from_matrix: true,
    };
  } catch (error) {
    return {
      ok: false,
      mode: env.REAL_E2E_MODE || 'unknown',
      source_root: REPO_ROOT,
      hostname: os.hostname(),
      checks: [],
      failures: [{
        ok: false,
        reason: 'REAL_E2E_REUSED_CAPABILITY_PROBE_INVALID',
        error: error?.message || String(error),
      }],
      reused_from_matrix: true,
    };
  }
}

async function checkGatewayStatus() {
  if (!commandExists('openclaw')) {
    return { ok: false, reason: 'INFRA_MISSING_OPENCLAW_CLI', remediation: 'Install or expose the openclaw CLI in the verification pod PATH.' };
  }
  const result = await execCapture('openclaw', ['gateway', 'status', '--json'], { timeout: 20000 });
  if (!result.ok) {
    return { ok: false, reason: 'INFRA_GATEWAY_STATUS_FAILED', result };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, reason: 'INFRA_GATEWAY_STATUS_NON_JSON', result };
  }
  const ready = parsed?.ready === true
    || parsed?.status === 'ready'
    || parsed?.healthy === true
    || parsed?.ok === true
    || parsed?.rpc?.ok === true;
  return {
    ok: ready,
    reason: ready ? null : 'INFRA_GATEWAY_NOT_READY',
    status: parsed?.status || null,
    ready,
    parsed,
  };
}

async function checkConfiguredCodexSpawn() {
  const target = resolveProductionCodexLaunchTarget();
  const labelPrefix = `real-e2e-${target.runtime}-${Date.now()}`;
  const config = readOpenClawConfig();
  const token = process.env.OPENCLAW_GATEWAY_TOKEN || config?.gateway?.auth?.token;
  if (!token) return { ok: false, reason: 'INFRA_MISSING_OPENCLAW_GATEWAY_TOKEN', ...target };
  const endpoint = process.env.OPENCLAW_GATEWAY_TOOLS_URL || 'http://127.0.0.1:18789/tools/invoke';
  const invoke = async (tool, args) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tool, args }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OPENCLAW_TOOL_FAILED:${tool}:${response.status}`);
    const body = await response.json();
    return body?.output ?? body?.result ?? body;
  };
  let sessionKey = null;
  try {
    const spawned = await invoke('sessions_spawn', {
      runtime: target.runtime,
      model: target.model,
      agentId: target.agentId,
      cwd: REPO_ROOT,
      mode: 'run',
      cleanup: 'keep',
      thread: false,
      task: 'Reply with REAL_E2E_SPARK_OK and stop.',
      label: labelPrefix,
    });
    const source = spawned?.details ?? spawned?.output ?? spawned;
    sessionKey = source?.childSessionKey ?? source?.sessionKey ?? source?.session_key;
    if (!sessionKey) return { ok: false, reason: 'INFRA_CODEX_SPAWN_RESULT_INVALID', ...target };
    for (let attempt = 0; attempt < Number(process.env.REAL_E2E_ACP_POLL_ATTEMPTS || 30); attempt += 1) {
      const listed = await invoke('subagents', { action: 'list', recentMinutes: 10 });
      const listing = listed?.details ?? listed;
      const state = [...(listing?.active ?? []), ...(listing?.recent ?? [])]
        .find((entry) => entry?.sessionKey === sessionKey || entry?.session_key === sessionKey);
      const status = String(state?.status ?? state?.state ?? '').toLowerCase();
      if (['completed', 'done', 'succeeded', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        return {
          ok: status === 'completed' || status === 'done' || status === 'succeeded',
          reason: ['failed', 'error', 'cancelled', 'canceled'].includes(status)
            ? 'INFRA_CODEX_SPAWN_FAILED'
            : null,
          ...target,
          session_key: sessionKey,
          status,
        };
      }
      await new Promise((resolve) => setTimeout(
        resolve,
        Number(process.env.REAL_E2E_ACP_POLL_MS || 1_000),
      ));
    }
    return { ok: false, reason: 'INFRA_CODEX_SPAWN_TIMEOUT', ...target, session_key: sessionKey };
  } catch (error) {
    return {
      ok: false,
      reason: 'INFRA_CODEX_SPAWN_FAILED',
      ...target,
      error: error?.message || String(error),
    };
  } finally {
    if (sessionKey) {
      await invoke('subagents', { action: 'kill', target: sessionKey }).catch(() => {});
    }
  }
}

export function resolveProductionCodexLaunchTarget({
  env = process.env,
  project = env.REAL_E2E_CONFIG_PROBE_PROJECT || DEFAULT_CONFIG_PROBE_PROJECT,
} = {}) {
  const configPath = path.join(REPO_ROOT, 'Projects', project, 'src', '.swarm', 'progress.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const reviewer = Array.isArray(config?.defaults?.reviewers) ? config.defaults.reviewers[0] : null;
  const runtime = String(env.REAL_E2E_AGENT_RUNTIME || reviewer?.dispatch || '').trim();
  if (!['acp', 'subagent'].includes(runtime)) {
    throw new Error(`production codex runtime must be acp or subagent in ${configPath}`);
  }
  const requestedModel = env.REAL_E2E_MODEL || DEFAULT_REAL_E2E_MODEL;
  if (requestedModel !== DEFAULT_REAL_E2E_MODEL) {
    throw new Error(`REAL_E2E_MODEL_MUST_BE_SPARK:${requestedModel}`);
  }
  const model = DEFAULT_REAL_E2E_MODEL;
  const agentId = env.REAL_E2E_AGENT_ID
    || (runtime === 'subagent' ? 'main' : reviewer?.agent_id)
    || 'codex';
  return {
    runtime,
    model,
    agentId,
    project,
    config_path: configPath,
  };
}

async function checkProductionNovaConfig() {
  const result = await execCapture('npx', [
    'tsc',
    '-p',
    path.join(REPO_ROOT, 'tests', 'verification', 'e2e', 'tsconfig.json'),
    '--noEmit',
  ], {
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      REPO_ROOT,
    },
  });
  return {
    ok: result.ok,
    reason: result.ok ? null : 'PRODUCTION_CONFIG_CONTRACT_INVALID',
    result,
  };
}

async function checkRedisRoundTrip() {
  const host = process.env.REDIS_HOST;
  if (!host) {
    return { ok: false, reason: 'INFRA_MISSING_REDIS_HOST', remediation: 'Set REDIS_HOST for the real E2E verification pod.' };
  }
  const stream = `${process.env.REAL_E2E_REDIS_PREFIX || 'verification'}:capability:${Date.now()}:${process.pid}`;
  try {
    return await withRealE2ERedisClient(async (redis) => {
      await redis.ping();
      const id = await redis.xadd(stream, '*', 'run_id', stream, 'status', 'capability_probe');
      const read = await redis.xread('COUNT', 1, 'STREAMS', stream, '0-0');
      const record = Array.isArray(read)
        ? read.find(([readStream]) => readStream === stream)?.[1]?.find(([entryId]) => entryId === id)
        : null;
      const fields = Array.isArray(record?.[1]) ? record[1] : [];
      const decoded = {};
      for (let index = 0; index < fields.length; index += 2) decoded[String(fields[index])] = fields[index + 1];
      const found = Boolean(record) && decoded.run_id === stream && decoded.status === 'capability_probe';
      await redis.del(stream);
      return {
        ok: found,
        reason: found ? null : 'INFRA_REDIS_STREAM_ROUNDTRIP_FAILED',
        stream,
        id,
        decoded,
      };
    });
  } catch (error) {
    return { ok: false, reason: 'INFRA_REDIS_FAILED', error: error?.message || String(error), stream };
  }
}

async function checkGitBranchRoundTrip() {
  const branch = `verification/e2e-capability-${Date.now()}-${process.pid}`;
  const current = await execCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!current.ok) return { ok: false, reason: 'INFRA_GIT_CURRENT_BRANCH_FAILED', result: current };
  const create = await execCapture('git', ['branch', branch, 'HEAD']);
  if (!create.ok) return { ok: false, reason: 'INFRA_GIT_BRANCH_CREATE_FAILED', branch, result: create };
  const exists = await execCapture('git', ['rev-parse', '--verify', branch]);
  const del = await execCapture('git', ['branch', '-D', branch]);
  return {
    ok: exists.ok && del.ok,
    reason: exists.ok && del.ok ? null : 'INFRA_GIT_BRANCH_DELETE_FAILED',
    branch,
    current_branch: current.stdout,
    exists,
    delete: del,
  };
}

async function checkDiscordDelivery(openclawConfig) {
  const reused = readReusedDiscordDeliveryResult();
  if (reused) return reused;

  const target = resolveDiscordTarget(openclawConfig);
  if (!target) {
    return {
      ok: false,
      reason: 'INFRA_MISSING_DISCORD_TARGET',
      remediation: 'Set REAL_E2E_DISCORD_TARGET or verification.real_e2e.discord_target before strict E2E verification.',
    };
  }
  const webhook = resolveDiscordWebhook(openclawConfig);
  if (!webhook) {
    return {
      ok: false,
      reason: 'INFRA_MISSING_DISCORD_WEBHOOK',
      remediation: 'Set DISCORD_WEBHOOK or REAL_E2E_DISCORD_WEBHOOK so the real E2E can prove Discord delivery.',
      target,
    };
  }

  const runId = `real-e2e-discord-capability-${Date.now()}-${process.pid}`;
  try {
    const response = await fetch(withDiscordWebhookWait(webhook), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'KubeClaw E2E',
        embeds: [{
          title: '🔭 KubeClaw · Capability probe',
          description: `Production delivery proof for \`${runId}\`.`,
          color: 5_763_719,
          fields: [{ name: 'Model', value: `\`${DEFAULT_REAL_E2E_MODEL}\``, inline: true }],
        }],
      }),
      signal: AbortSignal.timeout(Number(process.env.REAL_E2E_DISCORD_TIMEOUT_MS || 10_000)),
    });
    const delivered = response.ok ? await response.json() : null;
    return delivered?.id && delivered?.channel_id
      ? {
        ok: true,
        configured_target: target,
        run_id: runId,
        message_id: delivered.id,
        channel_id: delivered.channel_id,
      }
      : {
        ok: false,
        reason: 'INFRA_DISCORD_DELIVERY_RECEIPT_MISSING',
        configured_target: target,
        run_id: runId,
        status: response.status,
      };
  } catch (error) {
    return {
      ok: false,
      reason: 'INFRA_DISCORD_DELIVERY_FAILED',
      configured_target: target,
      run_id: runId,
      error: error?.message || String(error),
    };
  }
}

async function checkKubectlAvailable() {
  if (!commandExists('kubectl')) {
    return { ok: false, reason: 'INFRA_MISSING_KUBECTL', remediation: 'Install kubectl in the verification pod; the Kubernetes fixture capability uses kubectl.' };
  }
  const version = await execCapture('kubectl', ['version', '--client=true', '-o', 'json'], { timeout: 20000 });
  return { ok: version.ok, reason: version.ok ? null : 'INFRA_KUBECTL_FAILED', result: version };
}

async function checkBusterV2Worker() {
  let endpoint;
  try {
    endpoint = resolveProviderCapability(
      parseCapabilityProviders(),
      'buster',
      'test.suite.execute',
    ).endpoint;
  } catch {
    return { ok: false, reason: 'INFRA_MISSING_TEST_SUITE_PROVIDER' };
  }
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/u, '')}/healthz`, {
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    const ok = response.ok
      && body?.schemaVersion === 'buster-suite-worker-health.v2'
      && body?.ready === true;
    return { ok, reason: ok ? null : 'INFRA_BUSTER_V2_WORKER_UNREADY', endpoint, body };
  } catch (error) {
    return {
      ok: false,
      reason: 'INFRA_BUSTER_V2_WORKER_UNREACHABLE',
      endpoint,
      error: error?.message || String(error),
    };
  }
}

async function checkBusterPlanRuntime() {
  let endpoint;
  try {
    endpoint = resolveProviderCapability(parseCapabilityProviders(), 'buster', 'test.plan.execute').endpoint;
  } catch {
    return { ok: false, reason: 'INFRA_MISSING_TEST_PLAN_PROVIDER' };
  }
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/u, '')}/healthz`, {
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    const ok = response.ok && body?.schemaVersion === 'buster-plan-health.v1' && body?.ready === true;
    return { ok, reason: ok ? null : 'INFRA_BUSTER_PLAN_RUNTIME_UNREADY', endpoint, body };
  } catch (error) {
    return { ok: false, reason: 'INFRA_BUSTER_PLAN_RUNTIME_UNREACHABLE', endpoint,
      error: error?.message || String(error) };
  }
}

async function checkNovaBuildkitProof() {
  const result = await execCapture(process.execPath, [
    path.join(REPO_ROOT, 'tests/verification/e2e/nova-buildkit-production-preflight.mts'),
  ], { timeout: 1_080_000, maxBuffer: 16 * 1024 * 1024 });
  if (!result.ok) return { ok: false, reason: 'INFRA_NOVA_BUILDKIT_PROOF_FAILED', result };
  try {
    const proof = JSON.parse(result.stdout);
    const ok = proof?.ok === true
      && proof?.schemaVersion === 'nova-container-build-preflight.v3'
      && proof?.status === 'completed'
      && proof?.decision === 'passed';
    return { ok, reason: ok ? null : 'INFRA_NOVA_BUILDKIT_PROOF_INVALID', proof };
  } catch (error) {
    return {
      ok: false,
      reason: 'INFRA_NOVA_BUILDKIT_PROOF_NON_JSON',
      error: error?.message || String(error),
      result,
    };
  }
}

async function checkKubernetesApi() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const result = await execCapture('kubectl', ['get', '--raw=/version'], { timeout: 20000 });
  return { ok: result.ok, reason: result.ok ? null : 'INFRA_KUBERNETES_API_UNREACHABLE', result };
}

async function checkBusterLeaseCrd() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const result = await execCapture('kubectl', ['api-resources', '--api-group=kubeclaw.forgestack.ai', '-o', 'name'], { timeout: 20000 });
  const resources = result.stdout.split(/\s+/).filter(Boolean);
  const ok = result.ok && resources.some((resource) => resource === 'busternamespaceleases' || resource.startsWith('busternamespaceleases.'));
  return { ok, reason: ok ? null : 'INFRA_MISSING_BUSTER_NAMESPACE_LEASE_CRD', result };
}

async function checkBusterNamespaceController() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const namespace = process.env.KUBECLAW_NAMESPACE || 'kubeclaw';
  const result = await execCapture('kubectl', ['-n', namespace, 'rollout', 'status', 'deployment/agent-buster-namespace-controller', '--timeout=10s'], { timeout: 20000 });
  return { ok: result.ok, reason: result.ok ? null : 'INFRA_MISSING_BUSTER_NAMESPACE_CONTROLLER', namespace, result };
}

async function checkLeaseRbac() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const namespace = process.env.KUBECLAW_NAMESPACE || 'kubeclaw';
  const result = await execCapture('kubectl', ['auth', 'can-i', 'create', 'busternamespaceleases.kubeclaw.forgestack.ai', '-n', namespace], { timeout: 20000 });
  const allowed = result.ok && result.stdout.trim() === 'yes';
  return {
    ok: allowed,
    reason: allowed ? null : 'INFRA_MISSING_BUSTER_NAMESPACE_LEASE_RBAC',
    namespace,
    result,
  };
}

async function checkLocalRegistry() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const namespace = process.env.KUBECLAW_NAMESPACE || 'kubeclaw';
  const result = await execCapture('kubectl', ['-n', namespace, 'get', 'svc', 'registry-local', '-o', 'jsonpath={.spec.ports[0].port}'], { timeout: 20000 });
  const ready = result.ok && result.stdout.trim() === '5001';
  return { ok: ready, reason: ready ? null : 'INFRA_LOCAL_REGISTRY_UNAVAILABLE', namespace, result };
}

export function tailscaleOperatorPodListArgs({
  namespace = process.env.TAILSCALE_OPERATOR_NAMESPACE || 'tailscale',
  selector = process.env.TAILSCALE_OPERATOR_POD_SELECTOR || 'app=operator',
} = {}) {
  return ['-n', namespace, 'get', 'pods', '-l', selector, '-o', 'json'];
}

export async function checkTailscaleOperator() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const namespace = process.env.TAILSCALE_OPERATOR_NAMESPACE || 'tailscale';
  const selector = process.env.TAILSCALE_OPERATOR_POD_SELECTOR || 'app=operator';
  const result = await execCapture('kubectl', tailscaleOperatorPodListArgs({ namespace, selector }), { timeout: 20000 });
  if (!result.ok) return { ok: false, reason: 'INFRA_MISSING_TAILSCALE_OPERATOR', namespace, selector, result };
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, reason: 'INFRA_TAILSCALE_OPERATOR_NON_JSON', namespace, selector, result };
  }
  const readyPod = (parsed.items || []).find((pod) => (pod.status?.conditions || []).some((condition) => condition.type === 'Ready' && condition.status === 'True'));
  return {
    ok: Boolean(readyPod),
    reason: readyPod ? null : 'INFRA_MISSING_TAILSCALE_OPERATOR',
    namespace,
    selector,
    pod: readyPod?.metadata?.name || null,
  };
}

async function checkTailscaleIngressClass() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const result = await execCapture('kubectl', ['get', 'ingressclass', 'tailscale', '-o', 'json'], { timeout: 20000 });
  return { ok: result.ok, reason: result.ok ? null : 'INFRA_MISSING_TAILSCALE_INGRESSCLASS', result };
}

async function checkTailscaleOauthSecret() {
  if (!commandExists('kubectl')) return { ok: false, reason: 'INFRA_MISSING_KUBECTL' };
  const namespace = process.env.TAILSCALE_OPERATOR_NAMESPACE || 'tailscale';
  const secret = process.env.TAILSCALE_OAUTH_SECRET_NAME || 'operator-oauth';
  const result = await execCapture('kubectl', ['-n', namespace, 'get', 'secret', secret, '-o', 'json'], { timeout: 20000 });
  return {
    ok: result.ok,
    reason: result.ok ? null : 'INFRA_MISSING_TAILSCALE_OAUTH_SECRET',
    namespace,
    secret,
    ...(result.ok ? {} : { result }),
  };
}

export async function runCapabilityProbe({ mode = 'full' } = {}) {
  const openclawConfig = readOpenClawConfig();
  const checks = [];

  await runCheck(checks, 'OpenClaw gateway status', 'gateway', checkGatewayStatus);
  await runCheck(checks, 'Production Nova config contract', 'production_nova_config', checkProductionNovaConfig);
  await runCheck(checks, 'Configured Codex spawn', 'configured_codex_spawn', checkConfiguredCodexSpawn);
  await runCheck(checks, 'Redis stream roundtrip', 'redis_roundtrip', checkRedisRoundTrip);
  await runCheck(checks, 'Git branch roundtrip', 'git_branch_roundtrip', checkGitBranchRoundTrip);
  await runCheck(checks, 'Discord production delivery receipt', 'discord_delivery', () => checkDiscordDelivery(openclawConfig));
  await runCheck(checks, 'kubectl available', 'kubectl', checkKubectlAvailable);
  await runCheck(checks, 'Buster v2 worker available', 'buster-v2', checkBusterV2Worker);
  await runCheck(checks, 'Buster plan runtime available', 'buster-plan', checkBusterPlanRuntime);
  await runCheck(checks, 'Nova → Buster real BuildKit image proof', 'nova_buildkit_proof', checkNovaBuildkitProof);
  await runCheck(checks, 'Kubernetes API reachable', 'kubernetes_api', checkKubernetesApi);
  await runCheck(checks, 'BusterNamespaceLease CRD', 'buster_lease_crd', checkBusterLeaseCrd);
  await runCheck(checks, 'Buster namespace controller ready', 'buster_namespace_controller', checkBusterNamespaceController);
  await runCheck(checks, 'BusterNamespaceLease RBAC', 'buster_lease_rbac', checkLeaseRbac);
  await runCheck(checks, 'local registry reachable', 'local_registry', checkLocalRegistry);
  await runCheck(checks, 'Tailscale operator ready', 'tailscale_operator', checkTailscaleOperator);
  await runCheck(checks, 'Tailscale IngressClass', 'tailscale_ingressclass', checkTailscaleIngressClass);
  await runCheck(checks, 'Tailscale OAuth Secret', 'tailscale_oauth_secret', checkTailscaleOauthSecret);

  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    mode,
    source_root: REPO_ROOT,
    hostname: os.hostname(),
    checks,
    failures,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(usage());
      process.exit(0);
    }
    const result = await runCapabilityProbe({ mode: args.mode });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

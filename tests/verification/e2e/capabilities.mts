import net, { isIP } from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';

export type Capability = 'gateway' | 'discord' | 'redis' | 'kubernetes' | 'buildkit';

export interface CapabilityResult {
  readonly capability: Capability;
  readonly ok: boolean;
  readonly reason: string | null;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

function redisCommand(parts: readonly string[]): Buffer {
  return Buffer.from(`*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`);
}

async function probeRedis(): Promise<CapabilityResult> {
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT);
  const password = process.env.REDIS_PASSWORD;
  if (!host || !Number.isSafeInteger(port) || port < 1 || !password) {
    return { capability: 'redis', ok: false, reason: 'INFRA_MISSING_REDIS_CONFIG' };
  }
  const secure = process.env.REDIS_TLS === '1' || process.env.REDIS_TLS_ENABLED === '1';
  return new Promise((resolve) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ capability: 'redis', ok: false, reason: 'INFRA_REDIS_TIMEOUT' });
    }, 5_000);
    socket.once('error', () => {
      clearTimeout(timeout);
      resolve({ capability: 'redis', ok: false, reason: 'INFRA_REDIS_UNAVAILABLE' });
    });
    socket.on('data', (chunk) => {
      if (!chunk.toString('utf8').includes('PONG')) return;
      clearTimeout(timeout);
      socket.destroy();
      resolve({ capability: 'redis', ok: true, reason: null, evidence: { transport: secure ? 'tls' : 'tcp' } });
    });
    socket.once('connect', () => socket.write(Buffer.concat([
      redisCommand(['AUTH', password]),
      redisCommand(['PING']),
    ])));
  });
}

async function probeDiscord(sendMessage: boolean): Promise<CapabilityResult> {
  const raw = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
  if (!raw) return { capability: 'discord', ok: false, reason: 'INFRA_MISSING_DISCORD_WEBHOOK' };
  let endpoint: URL;
  try {
    endpoint = new URL(raw);
  } catch {
    return { capability: 'discord', ok: false, reason: 'INFRA_DISCORD_WEBHOOK_INVALID' };
  }
  if (sendMessage) endpoint.searchParams.set('wait', 'true');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: sendMessage
            ? 'ℹ️ KubeClaw v2 E2E matrix started'
            : 'ℹ️ KubeClaw v2 E2E capability probe',
          description: sendMessage
            ? 'The real v2 failure matrix is running.'
            : 'Discord accepted the production E2E capability probe.',
          color: 0x3498db,
          fields: sendMessage
            ? [{ name: 'Started', value: new Date().toISOString(), inline: false }]
            : [],
          footer: { text: 'KubeClaw Pipeline · real E2E' },
          timestamp: new Date().toISOString(),
        }],
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (!response.ok) return { capability: 'discord', ok: false, reason: `INFRA_DISCORD_HTTP_${response.status}` };
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(body) as { id?: unknown };
      if (typeof parsed.id === 'string') messageId = parsed.id;
    } catch {
      // A no-content webhook response still proves acceptance when wait=false.
    }
    return {
      capability: 'discord',
      ok: true,
      reason: null,
      evidence: { accepted: true, ...(messageId ? { messageId } : {}) },
    };
  } catch {
    return { capability: 'discord', ok: false, reason: 'INFRA_DISCORD_UNAVAILABLE' };
  }
}

function probeKubernetes(): CapabilityResult {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT;
  const serviceAccountRoot = '/var/run/secrets/kubernetes.io/serviceaccount';
  if (!host || !port || !fs.existsSync(`${serviceAccountRoot}/token`)) {
    return { capability: 'kubernetes', ok: false, reason: 'INFRA_MISSING_KUBERNETES_SERVICE_ACCOUNT' };
  }
  const namespace = fs.readFileSync(`${serviceAccountRoot}/namespace`, 'utf8').trim();
  const token = fs.readFileSync(`${serviceAccountRoot}/token`, 'utf8').trim();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-kubectl-'));
  const kubeconfig = path.join(temporary, 'config.json');
  fs.writeFileSync(kubeconfig, JSON.stringify({
    apiVersion: 'v1', kind: 'Config',
    clusters: [{ name: 'in-cluster', cluster: { server: `https://${host}:${port}`, 'certificate-authority': `${serviceAccountRoot}/ca.crt` } }],
    users: [{ name: 'service-account', user: { token } }],
    contexts: [{ name: 'probe', context: { cluster: 'in-cluster', user: 'service-account', namespace } }],
    'current-context': 'probe',
  }), { mode: 0o600 });
  let result;
  try {
    result = spawnSync('kubectl', [
      '--kubeconfig', kubeconfig,
      'get', 'pods',
      '--request-timeout=10s',
      '-o', 'name',
    ], { encoding: 'utf8', timeout: 15_000 });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return result.status === 0
    ? {
        capability: 'kubernetes',
        ok: true,
        reason: null,
        evidence: { namespace, visiblePods: result.stdout.trim().split('\n').filter(Boolean).length },
      }
    : { capability: 'kubernetes', ok: false, reason: 'INFRA_KUBERNETES_UNAVAILABLE' };
}

async function probeBuildkit(): Promise<CapabilityResult> {
  let endpoint: string;
  try {
    endpoint = resolveProviderCapability(
      parseCapabilityProviders(),
      'buster',
      'test.plan.execute',
    ).endpoint;
  } catch {
    return { capability: 'buildkit', ok: false, reason: 'INFRA_MISSING_TEST_PLAN_PROVIDER' };
  }
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/u, '')}/healthz`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json() as Record<string, unknown>;
    const ok = response.ok
      && body.schemaVersion === 'buster-plan-health.v1'
      && body.ready === true;
    return {
      capability: 'buildkit',
      ok,
      reason: ok ? null : 'INFRA_BUSTER_PLAN_RUNTIME_UNREADY',
      evidence: { endpoint, remoteWorker: true },
    };
  } catch {
    return { capability: 'buildkit', ok: false, reason: 'INFRA_BUSTER_PLAN_RUNTIME_UNAVAILABLE' };
  }
}

async function probeGateway(): Promise<CapabilityResult> {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token) return { capability: 'gateway', ok: false, reason: 'INFRA_MISSING_OPENCLAW_GATEWAY_TOKEN' };
  let endpoint: URL;
  try {
    const configured = process.env.OPENCLAW_GATEWAY_TOOLS_URL;
    if (configured) endpoint = new URL(configured);
    else {
      endpoint = new URL(process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789');
      if (endpoint.protocol === 'ws:') endpoint.protocol = 'http:';
      if (endpoint.protocol === 'wss:') endpoint.protocol = 'https:';
      endpoint.pathname = '/tools/invoke';
      endpoint.search = '';
      endpoint.hash = '';
    }
    const hostname = endpoint.hostname.replace(/^\[|\]$/gu, '');
    const loopback = hostname === 'localhost' || hostname === '::1'
      || (isIP(hostname) === 4 && hostname.split('.')[0] === '127');
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
      || (endpoint.protocol === 'http:' && !loopback)
      || endpoint.pathname !== '/tools/invoke') throw new Error('invalid endpoint');
  } catch {
    return { capability: 'gateway', ok: false, reason: 'INFRA_OPENCLAW_GATEWAY_ENDPOINT_INVALID' };
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tool: 'agents_list', action: 'json', args: {} }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) {
      return { capability: 'gateway', ok: false, reason: 'INFRA_OPENCLAW_GATEWAY_AUTH_FAILED' };
    }
    if (response.status === 403) {
      return { capability: 'gateway', ok: false, reason: 'INFRA_OPENCLAW_GATEWAY_POLICY_DENIED' };
    }
    if (!response.ok) {
      return { capability: 'gateway', ok: false, reason: `INFRA_OPENCLAW_GATEWAY_HTTP_${response.status}` };
    }
    const body = await response.json() as Record<string, unknown>;
    if (body.ok !== true) {
      return { capability: 'gateway', ok: false, reason: 'INFRA_OPENCLAW_GATEWAY_PROBE_FAILED' };
    }
    return { capability: 'gateway', ok: true, reason: null,
      evidence: { authenticated: true, tool: 'agents_list' } };
  } catch {
    return { capability: 'gateway', ok: false, reason: 'INFRA_OPENCLAW_GATEWAY_UNAVAILABLE' };
  }
}

export async function probeCapabilities(
  requested: readonly Capability[],
  options: { readonly announceDiscord?: boolean } = {},
): Promise<readonly CapabilityResult[]> {
  const unique = [...new Set(requested)];
  return Promise.all(unique.map(async (capability): Promise<CapabilityResult> => {
    if (capability === 'gateway') {
      return probeGateway();
    }
    if (capability === 'discord') return probeDiscord(options.announceDiscord === true);
    if (capability === 'redis') return probeRedis();
    if (capability === 'kubernetes') return probeKubernetes();
    return probeBuildkit();
  }));
}

export async function sendMatrixDiscordSummary(message: string): Promise<void> {
  const raw = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
  if (!raw) return;
  const endpoint = new URL(raw);
  endpoint.searchParams.set('wait', 'true');
  const failed = /\bfailed\b/iu.test(message);
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: `${failed ? '❌' : '✅'} KubeClaw v2 E2E ${failed ? 'failed' : 'passed'}`,
        description: message.slice(0, 4_096),
        color: failed ? 0xe74c3c : 0x2ecc71,
        footer: { text: 'KubeClaw Pipeline · real E2E' },
        timestamp: new Date().toISOString(),
      }],
      allowed_mentions: { parse: [] },
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

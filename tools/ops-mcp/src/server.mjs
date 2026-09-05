import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const execFileAsync = promisify(execFile);
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const KUBE_API = process.env.KUBERNETES_API_URL ?? 'https://kubernetes.default.svc';
const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
const DEFAULT_NAMESPACE = process.env.OPS_DEFAULT_NAMESPACE ?? 'kubeclaw';
const ARGO_NAMESPACE = process.env.ARGOCD_NAMESPACE ?? 'argocd';
const HUBBLE_BIN = process.env.HUBBLE_BIN ?? '/usr/local/bin/hubble';
const HUBBLE_SERVER = process.env.HUBBLE_SERVER ?? 'hubble-relay.cilium.svc.cluster.local:4245';
const MAX_LOG_BYTES = 64 * 1024;
const MAX_HUBBLE_BUFFER_BYTES = 2 * 1024 * 1024;
const LIST_PAGE_SIZE = 500;
const EVENT_PAGE_SIZE = 500;

const optionalBearerToken = process.env.OPS_MCP_BEARER_TOKEN?.trim() || null;
const allowedOrigins = new Set(
  (process.env.MCP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);

function jsonText(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function trimObjectMetadata(item) {
  return {
    name: item?.metadata?.name ?? null,
    namespace: item?.metadata?.namespace ?? null,
    creationTimestamp: item?.metadata?.creationTimestamp ?? null,
  };
}

function readServiceAccountToken() {
  return readFileSync(`${SERVICE_ACCOUNT_DIR}/token`, 'utf8').trim();
}

async function kubeRequest(path, { asText = false } = {}) {
  const response = await fetch(`${KUBE_API}${path}`, {
    headers: {
      Authorization: `Bearer ${readServiceAccountToken()}`,
      Accept: asText ? 'text/plain' : 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  const body = asText ? await response.text() : await response.json();
  if (!response.ok) {
    const detail = asText ? body : body?.message ?? JSON.stringify(body);
    throw new Error(`Kubernetes API ${response.status}: ${detail}`);
  }
  return body;
}

async function kubeList(path, { pageSize = LIST_PAGE_SIZE, params = {}, mapItem = item => item } = {}) {
  let continuation = null;
  const items = [];
  let pages = 0;

  do {
    const query = new URLSearchParams(params);
    query.set('limit', String(pageSize));
    if (continuation) query.set('continue', continuation);

    const page = await kubeRequest(`${path}?${query.toString()}`);
    items.push(...(page.items ?? []).map(mapItem));
    pages += 1;
    continuation = page?.metadata?.continue || null;
  } while (continuation);

  return { items, pages };
}

function deploymentSummary(item) {
  return {
    ...trimObjectMetadata(item),
    desired: item?.spec?.replicas ?? 0,
    ready: item?.status?.readyReplicas ?? 0,
    available: item?.status?.availableReplicas ?? 0,
    updated: item?.status?.updatedReplicas ?? 0,
  };
}

function statefulSetSummary(item) {
  return {
    ...trimObjectMetadata(item),
    desired: item?.spec?.replicas ?? 0,
    ready: item?.status?.readyReplicas ?? 0,
    current: item?.status?.currentReplicas ?? 0,
    updated: item?.status?.updatedReplicas ?? 0,
  };
}

function podSummary(item) {
  const statuses = item?.status?.containerStatuses ?? [];
  const readyCondition = (item?.status?.conditions ?? []).find(condition => condition?.type === 'Ready');
  return {
    ...trimObjectMetadata(item),
    phase: item?.status?.phase ?? null,
    node: item?.spec?.nodeName ?? null,
    podIP: item?.status?.podIP ?? null,
    ready: readyCondition?.status === 'True',
    restarts: statuses.reduce((sum, status) => sum + (status.restartCount ?? 0), 0),
    containers: statuses.map(status => ({
      name: status.name,
      ready: status.ready,
      restarts: status.restartCount ?? 0,
      state: status.state ?? null,
      lastState: status.lastState ?? null,
    })),
  };
}

function eventSummary(item) {
  return {
    type: item?.type ?? null,
    reason: item?.reason ?? null,
    message: item?.message ?? null,
    count: item?.series?.count ?? item?.count ?? 1,
    object: item?.involvedObject
      ? `${item.involvedObject.kind ?? 'Object'}/${item.involvedObject.name ?? '?'}`
      : null,
    firstTimestamp: item?.eventTime ?? item?.firstTimestamp ?? item?.metadata?.creationTimestamp ?? null,
    lastTimestamp:
      item?.series?.lastObservedTime ??
      item?.lastTimestamp ??
      item?.eventTime ??
      item?.metadata?.creationTimestamp ??
      null,
  };
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const at = Date.parse(a.lastTimestamp ?? '') || 0;
    const bt = Date.parse(b.lastTimestamp ?? '') || 0;
    return bt - at;
  });
}

async function recentEvents(namespace, objectName, limit) {
  let continuation = null;
  let events = [];
  let scanned = 0;
  let pages = 0;

  do {
    const params = new URLSearchParams({ limit: String(EVENT_PAGE_SIZE) });
    if (objectName) params.set('fieldSelector', `involvedObject.name=${objectName}`);
    if (continuation) params.set('continue', continuation);

    const page = await kubeRequest(
      `/api/v1/namespaces/${encodeURIComponent(namespace)}/events?${params.toString()}`,
    );
    const pageEvents = (page.items ?? []).map(eventSummary);
    scanned += pageEvents.length;
    pages += 1;

    // Keep only the newest requested events while still scanning every page.
    // This avoids materializing an unbounded namespace event history in memory.
    events = sortEvents([...events, ...pageEvents]).slice(0, limit);
    continuation = page?.metadata?.continue || null;
  } while (continuation);

  return { events, scanned, pages };
}

function endpointSummary(endpoint) {
  return {
    namespace: endpoint?.namespace ?? null,
    pod: endpoint?.pod_name ?? endpoint?.podName ?? null,
    identity: endpoint?.identity ?? null,
  };
}

function l4Summary(l4) {
  const tcp = l4?.TCP ?? l4?.tcp;
  if (tcp) {
    return {
      protocol: 'TCP',
      sourcePort: tcp.source_port ?? tcp.sourcePort ?? null,
      destinationPort: tcp.destination_port ?? tcp.destinationPort ?? null,
      flags: tcp.flags ?? null,
    };
  }

  const udp = l4?.UDP ?? l4?.udp;
  if (udp) {
    return {
      protocol: 'UDP',
      sourcePort: udp.source_port ?? udp.sourcePort ?? null,
      destinationPort: udp.destination_port ?? udp.destinationPort ?? null,
    };
  }

  const icmpv4 = l4?.ICMPv4 ?? l4?.icmpv4;
  if (icmpv4) return { protocol: 'ICMPv4', type: icmpv4.type ?? null, code: icmpv4.code ?? null };

  const icmpv6 = l4?.ICMPv6 ?? l4?.icmpv6;
  if (icmpv6) return { protocol: 'ICMPv6', type: icmpv6.type ?? null, code: icmpv6.code ?? null };

  return null;
}

function hubbleFlowSummary(response) {
  const flow = response?.flow ?? response;
  const ip = flow?.IP ?? flow?.ip ?? {};
  return {
    time: flow?.time ?? response?.time ?? null,
    verdict: flow?.verdict ?? null,
    dropReason: flow?.drop_reason_desc ?? flow?.dropReasonDesc ?? null,
    trafficDirection: flow?.traffic_direction ?? flow?.trafficDirection ?? null,
    node: flow?.node_name ?? flow?.nodeName ?? response?.node_name ?? response?.nodeName ?? null,
    source: endpointSummary(flow?.source),
    destination: endpointSummary(flow?.destination),
    sourceIP: ip?.source ?? null,
    destinationIP: ip?.destination ?? null,
    l4: l4Summary(flow?.l4),
    summary: flow?.Summary ?? flow?.summary ?? null,
  };
}

async function getHubbleFlows({ namespace, pod, verdict, since, limit }) {
  const args = [
    'observe',
    '--server', HUBBLE_SERVER,
    '--output', 'json',
    '--silent-errors',
    '--last', String(limit),
    '--since', since,
    '--namespace', namespace,
  ];
  if (pod) args.push('--pod', `${namespace}/${pod}`);
  if (verdict) args.push('--verdict', verdict);

  try {
    const { stdout } = await execFileAsync(HUBBLE_BIN, args, {
      encoding: 'utf8',
      timeout: 12_000,
      maxBuffer: MAX_HUBBLE_BUFFER_BYTES,
      env: {
        PATH: process.env.PATH,
        HOME: '/tmp',
      },
    });

    const flows = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .map(hubbleFlowSummary)
      .slice(-limit);

    return { flows, rawBytes: Buffer.byteLength(stdout, 'utf8') };
  } catch (error) {
    const code = error?.code ?? 'unknown';
    const stderr = String(error?.stderr ?? '').slice(-2048);
    if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      throw new Error(
        'Hubble flow query exceeded the bounded MCP buffer. Narrow namespace/pod/verdict or use a shorter since window.',
      );
    }
    throw new Error(`Hubble query failed (${code})${stderr ? `: ${stderr}` : ''}`);
  }
}

function buildServer() {
  const server = new McpServer(
    {
      name: 'kubeclaw-ops',
      version: '0.2.0',
    },
    {
      instructions:
        'Read-only operations interface for the kubeclaw Kubernetes cluster. ' +
        'Correlate Argo CD, Kubernetes workload state, events, bounded pod logs and bounded Hubble network flows. ' +
        'For connectivity or policy symptoms, inspect dropped Hubble flows before guessing at network causes. ' +
        'Never claim that a deployment or repair was performed: this server has no write capability.',
    },
  );

  server.registerTool(
    'list_argocd_applications',
    {
      title: 'List Argo CD applications',
      description: 'Read Argo CD Application sync and health state from the argocd namespace.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const data = await kubeList(
        `/apis/argoproj.io/v1alpha1/namespaces/${encodeURIComponent(ARGO_NAMESPACE)}/applications`,
        {
          mapItem: item => ({
            ...trimObjectMetadata(item),
            project: item?.spec?.project ?? null,
            destinationNamespace: item?.spec?.destination?.namespace ?? null,
            sync: item?.status?.sync?.status ?? 'Unknown',
            revision: item?.status?.sync?.revision ?? null,
            health: item?.status?.health?.status ?? 'Unknown',
            healthMessage: item?.status?.health?.message ?? null,
            operationPhase: item?.status?.operationState?.phase ?? null,
            operationMessage: item?.status?.operationState?.message ?? null,
          }),
        },
      );
      return jsonText({
        namespace: ARGO_NAMESPACE,
        applications: data.items,
        pagesScanned: data.pages,
      });
    },
  );

  server.registerTool(
    'namespace_overview',
    {
      title: 'Kubernetes namespace overview',
      description:
        'Summarize deployments, statefulsets, pods, jobs, services and ingresses in one namespace.',
      inputSchema: z.object({
        namespace: z.string().min(1).default(DEFAULT_NAMESPACE),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ namespace }) => {
      const ns = encodeURIComponent(namespace);
      const [deployments, statefulsets, pods, jobs, services, ingresses] = await Promise.all([
        kubeList(`/apis/apps/v1/namespaces/${ns}/deployments`, { mapItem: deploymentSummary }),
        kubeList(`/apis/apps/v1/namespaces/${ns}/statefulsets`, { mapItem: statefulSetSummary }),
        kubeList(`/api/v1/namespaces/${ns}/pods`, { mapItem: podSummary }),
        kubeList(`/apis/batch/v1/namespaces/${ns}/jobs`, {
          mapItem: item => ({
            ...trimObjectMetadata(item),
            succeeded: item?.status?.succeeded ?? 0,
            failed: item?.status?.failed ?? 0,
            active: item?.status?.active ?? 0,
            completionTime: item?.status?.completionTime ?? null,
          }),
        }),
        kubeList(`/api/v1/namespaces/${ns}/services`, {
          mapItem: item => ({
            ...trimObjectMetadata(item),
            type: item?.spec?.type ?? null,
            clusterIP: item?.spec?.clusterIP ?? null,
            ports: item?.spec?.ports ?? [],
          }),
        }),
        kubeList(`/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`, {
          mapItem: item => ({
            ...trimObjectMetadata(item),
            ingressClassName: item?.spec?.ingressClassName ?? null,
            hosts: (item?.spec?.rules ?? []).map(rule => rule.host).filter(Boolean),
            loadBalancer: item?.status?.loadBalancer ?? null,
          }),
        }),
      ]);

      return jsonText({
        namespace,
        deployments: deployments.items,
        statefulsets: statefulsets.items,
        pods: pods.items,
        jobs: jobs.items,
        services: services.items,
        ingresses: ingresses.items,
        pagesScanned: {
          deployments: deployments.pages,
          statefulsets: statefulsets.pages,
          pods: pods.pages,
          jobs: jobs.pages,
          services: services.pages,
          ingresses: ingresses.pages,
        },
      });
    },
  );

  server.registerTool(
    'get_pod',
    {
      title: 'Get pod status',
      description: 'Read detailed status for one pod without reading Secrets or executing commands.',
      inputSchema: z.object({
        namespace: z.string().min(1).default(DEFAULT_NAMESPACE),
        pod: z.string().min(1),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ namespace, pod }) => {
      const data = await kubeRequest(
        `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}`,
      );
      return jsonText({
        ...podSummary(data),
        conditions: data?.status?.conditions ?? [],
        initContainerStatuses: data?.status?.initContainerStatuses ?? [],
      });
    },
  );

  server.registerTool(
    'get_events',
    {
      title: 'Get Kubernetes events',
      description: 'Read recent Kubernetes events in a namespace, optionally filtered to one object name.',
      inputSchema: z.object({
        namespace: z.string().min(1).default(DEFAULT_NAMESPACE),
        objectName: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(100).default(40),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ namespace, objectName, limit }) => {
      const result = await recentEvents(namespace, objectName, limit);
      return jsonText({
        namespace,
        objectName: objectName ?? null,
        events: result.events,
        scannedEvents: result.scanned,
        pagesScanned: result.pages,
      });
    },
  );

  server.registerTool(
    'get_pod_logs',
    {
      title: 'Get bounded pod logs',
      description:
        'Read a bounded tail of pod logs for troubleshooting. Does not exec into containers and never returns more than 64 KiB.',
      inputSchema: z.object({
        namespace: z.string().min(1).default(DEFAULT_NAMESPACE),
        pod: z.string().min(1),
        container: z.string().min(1).optional(),
        tailLines: z.number().int().min(1).max(500).default(200),
        previous: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ namespace, pod, container, tailLines, previous }) => {
      const params = new URLSearchParams({
        tailLines: String(tailLines),
        timestamps: 'true',
        previous: String(previous),
        limitBytes: String(MAX_LOG_BYTES),
      });
      if (container) params.set('container', container);

      let logs = await kubeRequest(
        `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/log?${params.toString()}`,
        { asText: true },
      );
      const originalBytes = Buffer.byteLength(logs, 'utf8');
      let truncated = false;
      if (originalBytes > MAX_LOG_BYTES) {
        logs = Buffer.from(logs, 'utf8').subarray(originalBytes - MAX_LOG_BYTES).toString('utf8');
        truncated = true;
      }

      return jsonText({
        namespace,
        pod,
        container: container ?? null,
        previous,
        tailLines,
        limitBytes: MAX_LOG_BYTES,
        truncated,
        logs,
      });
    },
  );

  server.registerTool(
    'get_hubble_flows',
    {
      title: 'Get bounded Hubble network flows',
      description:
        'Read a small filtered set of Cilium Hubble flows for one namespace, optionally one pod and verdict. Returns normalized flow facts without endpoint label sets.',
      inputSchema: z.object({
        namespace: z.string().min(1).default(DEFAULT_NAMESPACE),
        pod: z.string().min(1).optional(),
        verdict: z.enum(['FORWARDED', 'DROPPED', 'AUDIT', 'REDIRECTED', 'ERROR', 'TRACED', 'TRANSLATED']).optional(),
        since: z.string().regex(/^[1-9][0-9]*(ms|s|m|h)$/).default('5m'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async args => {
      const result = await getHubbleFlows(args);
      return jsonText({
        namespace: args.namespace,
        pod: args.pod ?? null,
        verdict: args.verdict ?? null,
        since: args.since,
        limit: args.limit,
        relay: HUBBLE_SERVER,
        rawBytesRead: result.rawBytes,
        flows: result.flows,
      });
    },
  );

  return server;
}

const mcpHandler = createMcpHandler(buildServer, { responseMode: 'json' });
const nodeMcpHandler = toNodeHandler(mcpHandler);

function requestAuthorized(req) {
  if (!optionalBearerToken) return true;
  return req.headers.authorization === `Bearer ${optionalBearerToken}`;
}

function originAllowed(req) {
  if (allowedOrigins.size === 0) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'kubeclaw-ops-mcp' }));
    return;
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  if (!requestAuthorized(req)) {
    res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  if (!originAllowed(req)) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'origin_not_allowed' }));
    return;
  }

  void nodeMcpHandler(req, res);
});

httpServer.listen(PORT, HOST, () => {
  console.error(`kubeclaw-ops-mcp listening on http://${HOST}:${PORT}/mcp`);
});

async function shutdown(signal) {
  console.error(`received ${signal}, shutting down`);
  httpServer.close();
  await mcpHandler.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

import { boundedUtf8, logObservation } from './diagnostics.mjs';
import { getHubbleFlows } from './hubble.mjs';
import { createAccessPolicy, requestIdentity, authorizeTool, authorizeExec, audit, identityContext } from './access-policy.mjs';
import { createPodExec } from './exec.mjs';
import { loadOpsMcpConfig } from './config.mjs';
import { createKubeRequest, createKubeList } from './kubernetes.mjs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const config = loadOpsMcpConfig();
const PORT = config.port;
const HOST = config.host;
const kubeRequest = createKubeRequest();
const DEFAULT_NAMESPACE = config.defaultNamespace;
const ARGO_NAMESPACE = config.argoNamespace;
const MAX_LOG_BYTES = 64 * 1024;
const kubeList = createKubeList(kubeRequest);
const EVENT_PAGE_SIZE = 500;

const authentication = createAccessPolicy(config);
const execPod = createPodExec();
let activeExecs = 0;
const namespaceSchema = z.enum(config.namespaces).default(DEFAULT_NAMESPACE);
const allowedOrigins = config.allowedOrigins;

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
    const params = new URLSearchParams();
    if (objectName) params.set('fieldSelector', `involvedObject.name=${objectName}`);

    const page = await kubeList(
      `/api/v1/namespaces/${encodeURIComponent(namespace)}/events`,
      { pageSize: EVENT_PAGE_SIZE, params, maxPages: 1, continueToken: continuation },
    );
    const pageEvents = (page.items ?? []).map(eventSummary);
    scanned += pageEvents.length;
    pages += 1;

    // Keep only the newest requested events while still scanning every page.
    // This avoids materializing an unbounded namespace event history in memory.
    events = sortEvents([...events, ...pageEvents]).slice(0, limit);
    continuation = page.continuation;
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

function buildServer() {
  const server = new McpServer(
    {
      name: 'kubeclaw-ops',
      version: '0.2.0',
    },
    {
      instructions:
        'Centrally authorized operations interface for the kubeclaw Kubernetes cluster. ' +
        'Correlate Argo CD, Kubernetes workload state, events, bounded pod logs and bounded Hubble network flows. ' +
        'For connectivity or policy symptoms, inspect dropped Hubble flows before guessing at network causes. ' +
        'Exec can change target workloads and requires an explicit per-client grant. Never infer a successful repair from a diagnostic read.',
    },
  );

  const principal = requestIdentity.getStore()?.client;
  const register = server.registerTool.bind(server);
  server.registerTool = (name, definition, handler) => {
    if (!principal?.tools.includes(name)) return;
    return register(name, definition, async (args, extra) => {
      const start = Date.now();
      const safeName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9.-]{0,252}$/.test(value) ? value : undefined;
      const target = { tool: name, namespace: safeName(args.namespace), pod: safeName(args.pod), container: safeName(args.container) };
      try {
        authorizeTool(principal, name, args, ARGO_NAMESPACE);
        audit({ ...target, phase: 'started' });
        const result = await handler(args, extra);
        audit({ ...target, phase: 'completed', durationMs: Date.now() - start });
        return result;
      } catch (error) {
        audit({ ...target, phase: 'failed', durationMs: Date.now() - start });
        throw error;
      }
    });
  };

  {
    server.registerTool('platform_cluster_state', {
      title: 'Nodes and global Cilium policies',
      description: 'Read node health or global Cilium policies through the host API. Does not execute in nodes or Cilium pods.',
      inputSchema: z.object({ resource: z.enum(['nodes', 'ciliumclusterwidenetworkpolicies']), continueToken: z.string().max(16384).optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ resource, continueToken }) => {
      const path = resource === 'nodes' ? '/api/v1/nodes' : '/apis/cilium.io/v2/ciliumclusterwidenetworkpolicies';
      const page = await kubeList(path, { pageSize: 50, maxPages: 1, continueToken,
        mapItem: item => resource === 'nodes'
          ? { ...trimObjectMetadata(item), conditions: item.status?.conditions, nodeInfo: item.status?.nodeInfo, capacity: item.status?.capacity }
          : { ...trimObjectMetadata(item), spec: item.spec, specs: item.specs, status: item.status },
      });
      return jsonText({ ...page, nextContinueToken: page.continuation });
    });
    server.registerTool('platform_network_state', {
      title: 'Platform network state',
      description: 'Read Cilium workloads or namespaced policies through the direct Kubernetes API. Missing Cilium CRDs are reported as unavailable, not healthy.',
      inputSchema: z.object({
        namespace: namespaceSchema,
        resource: z.enum(['daemonsets', 'networkpolicies', 'ciliumnetworkpolicies']),
        continueToken: z.string().max(16384).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ namespace, resource, continueToken }) => {
      const groups = { daemonsets: 'apps/v1', networkpolicies: 'networking.k8s.io/v1', ciliumnetworkpolicies: 'cilium.io/v2' };
      const page = await kubeList(`/apis/${groups[resource]}/namespaces/${namespace}/${resource}`, {
        pageSize: 50, maxPages: 1, continueToken,
        mapItem: item => ({ ...trimObjectMetadata(item), spec: item.spec, status: item.status }),
      });
      return jsonText({ ...page, nextContinueToken: page.continuation });
    });
  }

  server.registerTool(
    'list_argocd_applications',
    {
      title: 'List Argo CD applications',
      description: 'Read Argo CD Application sync and health state from the argocd namespace.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(50),
        continueToken: z.string().max(16384).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, continueToken }) => {
      const data = await kubeList(
        `/apis/argoproj.io/v1alpha1/namespaces/${encodeURIComponent(ARGO_NAMESPACE)}/applications`,
        {
          pageSize: limit, maxPages: 1, continueToken,
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
        nextContinueToken: data.continuation,
        partial: data.partial,
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
        namespace: namespaceSchema,
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
        namespace: namespaceSchema,
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
        resources: (data?.spec?.containers ?? []).map(({ name, resources }) => ({ name, resources })),
      });
    },
  );

  server.registerTool(
    'get_events',
    {
      title: 'Get Kubernetes events',
      description: 'Read recent Kubernetes events in a namespace, optionally filtered to one object name.',
      inputSchema: z.object({
        namespace: namespaceSchema,
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
        'Read up to 64 KiB of log text (JSON metadata is additional). Default: recent tail. sinceTime reads from a chosen timestamp in still available logs; no historical cursor or until filter is available. Content is not redacted; inspect observation before drawing conclusions.',
      inputSchema: z.object({
        namespace: namespaceSchema,
        pod: z.string().min(1),
        container: z.string().min(1).optional(),
        tailLines: z.number().int().min(1).max(500).optional(),
        sinceTime: z.iso.datetime({ offset: true }).optional(),
        previous: z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ namespace, pod, container, tailLines, sinceTime, previous }) => {
      const effectiveTailLines = tailLines ?? (sinceTime ? undefined : 200);
      const params = new URLSearchParams({
        timestamps: 'true',
        previous: String(previous),
        // Ask Kubernetes for one sentinel byte beyond the public MCP limit so
        // server-side truncation is detectable without downloading unbounded logs.
        limitBytes: String(MAX_LOG_BYTES + 1),
      });
      if (effectiveTailLines !== undefined) params.set('tailLines', String(effectiveTailLines));
      if (sinceTime) params.set('sinceTime', sinceTime);
      if (container) params.set('container', container);

      let logs = await kubeRequest(
        `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/log?${params.toString()}`,
        { asText: true },
      );
      const observation = logObservation(logs, { sinceTime, tailLines: effectiveTailLines });
      logs = observation.text;

      return jsonText({
        namespace,
        pod,
        container: container ?? null,
        previous,
        tailLines: effectiveTailLines ?? null,
        sinceTime: sinceTime ?? null,
        observation: { ...observation, text: undefined },
        limitBytes: MAX_LOG_BYTES,
        truncated: observation.byteLimited,
        logs,
      });
    },
  );

  server.registerTool(
    'get_hubble_flows',
    {
      title: 'Get bounded Hubble network flows',
      description:
        'Read a small filtered set of Cilium Hubble flows for one namespace, optionally one pod and verdict. Choose any still available absolute time window, max 15 minutes per call. Inspect partial status and continue with smaller/older windows. Exact pod match. No content redaction; no endpoint label sets.',
      inputSchema: z.object({
        namespace: namespaceSchema,
        pod: z.string().max(253).regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/).optional(),
        verdict: z.enum(['FORWARDED', 'DROPPED', 'AUDIT', 'REDIRECTED', 'ERROR', 'TRACED', 'TRANSLATED']).optional(),
        startTime: z.iso.datetime({ offset: true }).optional(),
        endTime: z.iso.datetime({ offset: true }).optional(),
        node: z.string().max(253).regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/).optional(),
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
      return jsonText(await getHubbleFlows(args, hubbleFlowSummary));
    },
  );

  server.registerTool('get_pod_metrics', {
    title: 'Get pod resource usage',
    description: 'Read metrics-server container CPU and RAM usage with sample timestamp. Unavailable metrics are reported as an error.',
    inputSchema: z.object({ namespace: namespaceSchema, pod: z.string().min(1).max(253) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ namespace, pod }) => {
    const data = await kubeRequest(`/apis/metrics.k8s.io/v1beta1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}`);
    return jsonText({ namespace, pod, timestamp: data.timestamp, window: data.window,
      containers: (data.containers ?? []).map(({ name, usage }) => ({ name, usage })) });
  });

  server.registerTool('exec_pod', {
    title: 'Execute in an authorized pod container',
    description: 'Execute argv in a policy-selected container. May mutate workloads or read their credentials. No stdin or TTY. A timeout/disconnect does not prove remote process termination; do not automatically retry.',
    inputSchema: z.object({ namespace: namespaceSchema,
      pod: z.string().min(1).max(253).regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/),
      container: z.string().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
      command: z.array(z.string().max(4096).refine(s => !s.includes('\0'))).min(1).max(64)
        .refine(argv => argv[0].length > 0 && argv.reduce((n, s) => n + Buffer.byteLength(s), 0) <= 16384),
      timeoutSeconds: z.number().int().min(1).max(120).default(30),
      maxOutputBytes: z.number().int().min(1).max(65536).default(65536),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async (args, extra) => {
    // Fetch labels using the MCP identity; clients cannot assert target labels.
    const pod = await kubeRequest(`/api/v1/namespaces/${encodeURIComponent(args.namespace)}/pods/${encodeURIComponent(args.pod)}`);
    const authorized = authorizeExec(principal, args, pod);
    if (activeExecs >= 4) throw new Error('OPS_EXEC_BUSY');
    activeExecs++;
    try {
      audit({ phase: 'exec-authorized', namespace: args.namespace, pod: args.pod, container: args.container,
        commandSha256: createHash('sha256').update(JSON.stringify(args.command)).digest('hex'),
        timeoutSeconds: authorized.timeoutSeconds, maxOutputBytes: authorized.maxOutputBytes });
      const result = await execPod(authorized, extra?.signal);
      audit({ phase: 'exec-exited', exitCode: result.exitCode });
      return jsonText(result);
    }
    finally { activeExecs--; }
  });

  return server;
}

const mcpHandler = createMcpHandler(buildServer, { responseMode: 'json' });
const nodeMcpHandler = toNodeHandler(mcpHandler);


function originAllowed(req) {
  if (allowedOrigins.size === 0) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

const tlsCert = process.env.OPS_MCP_TLS_CERT_FILE;
const tlsKey = process.env.OPS_MCP_TLS_KEY_FILE;
if (Boolean(tlsCert) !== Boolean(tlsKey)) throw new Error('Both Ops MCP TLS key and certificate are required');
if (config.policyFile && !tlsCert && !config.localOnly) throw new Error('Network-accessible client policies require TLS');
const createServer = tlsCert ? handler => createHttpsServer({ cert: readFileSync(tlsCert), key: readFileSync(tlsKey) }, handler) : createHttpServer;
const httpServer = createServer((req, res) => {
  let url;
  try {
    // Never use the untrusted Host header to construct the parser base; only
    // request-target pathname/query parsing is required here.
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_request_target' }));
    return;
  }

  if (url.pathname === '/healthz') {
    const ready = authentication.ready();
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: ready, service: 'kubeclaw-ops-mcp' }));
    return;
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  const client = authentication.authenticate(req.headers.authorization);
  if (!client) {
    audit({ phase: 'authentication-denied' });
    res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  if (!originAllowed(req)) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'origin_not_allowed' }));
    return;
  }

  const context = identityContext(client);
  res.once('finish', () => requestIdentity.run(context, () => audit({ phase: 'http-completed', status: res.statusCode })));
  requestIdentity.run(context, () => Promise.resolve().then(() => nodeMcpHandler(req, res)).catch(() => {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'request_failed' }));
  }));
});

httpServer.listen(PORT, HOST, () => {
  console.error(`kubeclaw-ops-mcp listening on ${tlsCert ? 'https' : 'http'}://${HOST}:${httpServer.address().port}/mcp`);
});

async function shutdown(signal) {
  console.error(`received ${signal}, shutting down`);
  httpServer.close();
  await mcpHandler.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

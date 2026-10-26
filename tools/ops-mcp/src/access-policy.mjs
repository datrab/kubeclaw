import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createBearerAuthorization } from './authentication.mjs';

export const requestIdentity = new AsyncLocalStorage();
export const READ_ONLY_TOOLS = Object.freeze(['platform_cluster_state', 'platform_network_state', 'list_argocd_applications',
  'namespace_overview', 'get_pod', 'get_events', 'get_pod_logs', 'get_hubble_flows', 'get_pod_metrics',
  'get_resource_inventory', 'get_monitoring_metrics', 'get_monitoring_alerts']);
export const TOOL_NAMES = [...READ_ONLY_TOOLS, 'exec_pod'];
const dns = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const strings = (v, check) => Array.isArray(v) && v.every(x => typeof x === 'string' && check(x));
const positive = (v, max) => Number.isInteger(v) && v > 0 && v <= max;
const hash = v => createHash('sha256').update(v).digest();

export const validNamespace = value => typeof value === 'string' && dns.test(value.toLowerCase());

export const nonSystemNamespace = value => validNamespace(value) && !value.toLowerCase().startsWith('kube-');

export function namespaceAllowed(namespace, namespaces = [], prefixes = []) {
  // Kubernetes namespace names are lowercase DNS labels. Canonicalize at the
  // tool boundary; keep this helper safe for policy and controller callers too.
  return validNamespace(namespace) &&
    (namespaces.includes(namespace.toLowerCase()) || prefixes.some(prefix => prefix.length > 0 && namespace.toLowerCase().startsWith(prefix.toLowerCase())));
}

export function parsePolicy(text, allowedNamespaces, allowedPrefixes = [], readAllNamespaces = false, execAllNonSystemNamespaces = false) {
  const value = JSON.parse(text);
  if (!Array.isArray(value.clients) || !value.clients.length || value.clients.length > 64) throw new Error('Invalid Ops MCP client policy');
  const ids = new Set();
  for (const client of value.clients) {
    if (!dns.test(client.id) || ids.has(client.id) || typeof client.tokenFile !== 'string' || !client.tokenFile.startsWith('/') ||
        !strings(client.tools, x => TOOL_NAMES.includes(x)) ||
        !strings(client.namespaces, x => allowedNamespaces.includes(x)) ||
        (client.readAllNamespaces !== undefined && typeof client.readAllNamespaces !== 'boolean') ||
        (client.readAllNamespaces && !readAllNamespaces) ||
        !strings(client.namespacePrefixes ?? [], x => dns.test(x.toLowerCase()) && allowedPrefixes.includes(x.toLowerCase()))) throw new Error('Invalid Ops MCP client policy');
    ids.add(client.id);
    if (!Array.isArray(client.exec)) throw new Error('Explicit exec grants are required (use [] to deny)');
    if (client.readOnly !== undefined && typeof client.readOnly !== 'boolean') throw new Error('Invalid readOnly policy');
    if (client.readOnly && (client.exec.length || client.tools.some(tool => !READ_ONLY_TOOLS.includes(tool)))) throw new Error('Read-only client cannot have exec grants or write tools');
    for (const grant of client.exec) {
      const broadGrant = grant.allNonSystemNamespaces === true && execAllNonSystemNamespaces &&
        client.readAllNamespaces === true && grant.allPods === true && grant.allContainers === true &&
        !grant.namespacePrefix && !grant.namespace && !grant.podLabels && !grant.containers;
      const prefixGrant = grant.allNonSystemNamespaces === undefined && typeof grant.namespacePrefix === 'string' &&
        (client.namespacePrefixes ?? []).some(prefix => prefix.toLowerCase() === grant.namespacePrefix.toLowerCase()) &&
        grant.allPods === true && grant.allContainers === true && !grant.namespace && !grant.podLabels && !grant.containers;
      const exactGrant = grant.allNonSystemNamespaces === undefined && !grant.namespacePrefix && !grant.allPods && !grant.allContainers &&
        client.namespaces.includes(grant.namespace) && grant.podLabels && typeof grant.podLabels === 'object' && !Array.isArray(grant.podLabels) &&
        Object.keys(grant.podLabels).length > 0 && Object.entries(grant.podLabels).every(([k,v]) => typeof v === 'string' && k.length > 0 && v.length > 0) &&
        strings(grant.containers, x => dns.test(x)) && grant.containers.length > 0;
      if ((!broadGrant && !prefixGrant && !exactGrant) || !positive(grant.timeoutSeconds, 120) || !positive(grant.maxOutputBytes, 65536)) throw new Error('Invalid Ops MCP exec grant');
    }
  }
  return value.clients;
}

export function createAccessPolicy(config) {
  if (!config.policyFile) {
    // Compatibility for explicitly configured standalone observers. Exec is
    // never enabled by the old shared bearer configuration.
    const bearer = createBearerAuthorization(config.bearer);
    return { ready: () => bearer.ready(), authenticate: header => bearer.authorized(header)
      ? { id: 'legacy-observer', namespaces: config.namespaces, tools: TOOL_NAMES.filter(x => x !== 'exec_pod' && (config.localOnly || !x.startsWith('platform_'))), exec: [] } : null };
  }
  if (config.bearer.file || config.bearer.token) throw new Error('Do not combine a client policy with a shared bearer');
  const load = () => {
    const clients = parsePolicy(readFileSync(config.policyFile, 'utf8'), config.namespaces, config.namespacePrefixes, config.readAllNamespaces, config.execAllNonSystemNamespaces);
    const digests = new Set();
    return clients.map(client => {
      const token = readFileSync(client.tokenFile, 'utf8').trim();
      if (!/^[A-Za-z0-9._~-]{32,512}$/.test(token)) throw new Error('Invalid Ops MCP client credential');
      const digest = hash(`Bearer ${token}`);
      const hex = digest.toString('hex');
      if (digests.has(hex)) throw new Error('Ops MCP clients require distinct credentials');
      digests.add(hex);
      return { client, digest };
    });
  };
  load(); // Fail closed before listening. Reopen mounted files on each request.
  return {
    ready() { try { load(); return true; } catch { return false; } },
    authenticate(header) {
      if (typeof header !== 'string' || header.length > 519) return null;
      try {
        const supplied = hash(header);
        return load().find(({ digest }) => timingSafeEqual(supplied, digest))?.client ?? null;
      } catch { return null; }
    },
  };
}

export function authorizeTool(client, tool, args, argoNamespace) {
  if (client?.readOnly && !READ_ONLY_TOOLS.includes(tool)) throw new Error('OPS_TOOL_FORBIDDEN');
  if (tool === 'platform_cluster_state' && args.node && !client?.readAllNamespaces) throw new Error('OPS_TOOL_FORBIDDEN');
  if ((tool.startsWith('get_monitoring_') || (tool === 'get_resource_inventory' && ['persistentvolumes', 'storageclasses'].includes(args.resource))) && !client?.readAllNamespaces) throw new Error('OPS_TOOL_FORBIDDEN');
  if (!client?.tools.includes(tool) || (tool === 'platform_cluster_state' && args.resource === 'namespaces' && !client.readAllNamespaces)) throw new Error('OPS_TOOL_FORBIDDEN');
  const namespace = tool === 'list_argocd_applications' ? argoNamespace : args.namespace;
  const broadExec = tool === 'exec_pod' && nonSystemNamespace(namespace) && client.exec.some(grant => grant.allNonSystemNamespaces === true);
  if (namespace && !broadExec && !(tool !== 'exec_pod' && client.readAllNamespaces && validNamespace(namespace)) && !namespaceAllowed(namespace, client.namespaces, client.namespacePrefixes)) throw new Error('OPS_NAMESPACE_FORBIDDEN');
}

export function authorizeExec(client, args, pod) {
  if (client?.readOnly) throw new Error('OPS_EXEC_TARGET_FORBIDDEN');
  const systemPod = ['system-node-critical', 'system-cluster-critical'].includes(pod.spec?.priorityClassName) || pod.spec?.priority >= 2000000000;
  const grant = client.exec.find(grant => grant.allNonSystemNamespaces === true
    ? nonSystemNamespace(args.namespace) && !systemPod
    : grant.namespacePrefix
    ? namespaceAllowed(args.namespace, [], [grant.namespacePrefix]) && grant.allPods === true && grant.allContainers === true
    : grant.namespace === args.namespace && grant.containers.includes(args.container) &&
      Object.entries(grant.podLabels).every(([k, v]) => pod.metadata?.labels?.[k] === v));
  if (!grant || !pod.spec?.containers?.some(c => c.name === args.container)) throw new Error('OPS_EXEC_TARGET_FORBIDDEN');
  return { ...args, timeoutSeconds: Math.min(args.timeoutSeconds, grant.timeoutSeconds),
    maxOutputBytes: Math.min(args.maxOutputBytes, grant.maxOutputBytes) };
}

export function audit(event) {
  // Do not log bearer values, command arguments, output or Kubernetes bodies.
  const context = requestIdentity.getStore();
  console.error(JSON.stringify({ type: 'ops-mcp-audit', time: new Date().toISOString(),
    requestId: context?.requestId, client: context?.client.id ?? 'unauthenticated', ...event }));
}
export function identityContext(client) { return { client, requestId: randomUUID() }; }

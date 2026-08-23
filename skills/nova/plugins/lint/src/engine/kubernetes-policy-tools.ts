import path from 'node:path';

import { loadKubernetesResources, nodeLine } from './kubernetes-manifests.ts';

type AnyRecord = Record<string, any>;
const WORKLOAD_PATHS: Record<string, Array<string | number>> = {
  Deployment: ['spec', 'template', 'spec'], StatefulSet: ['spec', 'template', 'spec'], DaemonSet: ['spec', 'template', 'spec'], ReplicaSet: ['spec', 'template', 'spec'],
  Job: ['spec', 'template', 'spec'], CronJob: ['spec', 'jobTemplate', 'spec', 'template', 'spec'], Pod: ['spec'],
};

function resourceName(resource: AnyRecord): string {
  return `${resource.value.kind || 'Unknown'}/${resource.value.metadata?.name || '<unnamed>'}`;
}

function finding(resource: AnyRecord, rule: AnyRecord, message: string, keys: Array<string | number> = []): AnyRecord {
  return { file: resource.source, line: nodeLine(resource, keys), column: 1, severity: rule.severity, code: `kubernetes-policy/${rule.id}`, message };
}

function indexes(resources: AnyRecord[]) {
  const secrets = new Map<string, Set<string>>();
  const configMaps = new Map<string, Set<string>>();
  const serviceAccounts = new Map<string, string[]>();
  for (const resource of resources) {
    const namespace = resource.value.metadata?.namespace || 'default';
    const name = resource.value.metadata?.name;
    if (!name) continue;
    const key = `${namespace}/${name}`;
    if (resource.value.kind === 'Secret') secrets.set(key, new Set([...Object.keys(resource.value.data || {}), ...Object.keys(resource.value.stringData || {})]));
    if (resource.value.kind === 'ConfigMap') configMaps.set(key, new Set(Object.keys(resource.value.data || {})));
    if (resource.value.kind === 'ServiceAccount') serviceAccounts.set(key, (resource.value.imagePullSecrets || []).map((entry: AnyRecord) => entry?.name).filter(Boolean));
  }
  return { secrets, configMaps, serviceAccounts };
}

function availableEnvironment(container: AnyRecord, namespace: string, lookup: AnyRecord): { names: Set<string>; unresolved: string[] } {
  const names = new Set<string>((container.env || []).map((entry: AnyRecord) => entry?.name).filter((name: unknown): name is string => typeof name === 'string' && name.length > 0));
  const unresolved: string[] = [];
  for (const source of container.envFrom || []) {
    const secret = source?.secretRef?.name;
    const configMap = source?.configMapRef?.name;
    const values = secret ? lookup.secrets.get(`${namespace}/${secret}`) : configMap ? lookup.configMaps.get(`${namespace}/${configMap}`) : null;
    if (values) for (const name of values) names.add(`${source.prefix || ''}${name}`);
    else unresolved.push(secret ? `Secret/${secret}` : configMap ? `ConfigMap/${configMap}` : 'unknown envFrom source');
  }
  return { names, unresolved };
}

function pullSecrets(pod: AnyRecord, namespace: string, lookup: AnyRecord): string[] {
  const direct = (pod.imagePullSecrets || []).map((entry: AnyRecord) => entry?.name).filter(Boolean);
  const serviceAccount = pod.serviceAccountName || 'default';
  return [...new Set([...direct, ...(lookup.serviceAccounts.get(`${namespace}/${serviceAccount}`) || [])])];
}

function evaluateRule(resource: AnyRecord, podPath: Array<string | number>, rule: AnyRecord, lookup: AnyRecord): AnyRecord[] {
  const pod = podPath.reduce((value: AnyRecord, key) => value?.[key], resource.value);
  if (!pod || typeof pod !== 'object') return [];
  const namespace = resource.value.metadata?.namespace || 'default';
  const containerGroups = [
    { field: 'containers', values: Array.isArray(pod.containers) ? pod.containers : [], probes: true },
    { field: 'initContainers', values: Array.isArray(pod.initContainers) ? pod.initContainers : [], probes: false },
  ];
  const results: AnyRecord[] = [];
  for (const group of containerGroups) group.values.forEach((container: AnyRecord, index: number) => {
    const keys = [...podPath, group.field, index];
    const label = `${resourceName(resource)} ${group.field === 'initContainers' ? 'init container' : 'container'} '${container?.name || index}'`;
    if (rule.type === 'required-env') {
      const environment = availableEnvironment(container, namespace, lookup);
      for (const name of rule.parameters.names) if (!environment.names.has(name)) results.push(finding(resource, rule, `${label} does not declare required environment variable ${name}${environment.unresolved.length ? `; unresolved envFrom: ${environment.unresolved.join(', ')}` : ''}.`, keys));
    } else if (rule.type === 'secret-ref') {
      for (const [envIndex, env] of (container.env || []).entries()) {
        const ref = env?.valueFrom?.secretKeyRef;
        if (ref && ref.optional !== true && !lookup.secrets.get(`${namespace}/${ref.name}`)?.has(ref.key)) results.push(finding(resource, rule, `${label} references missing Secret key ${ref.name}/${ref.key}.`, [...keys, 'env', envIndex]));
      }
      for (const [sourceIndex, source] of (container.envFrom || []).entries()) {
        const ref = source?.secretRef;
        if (ref?.name && ref.optional !== true && !lookup.secrets.has(`${namespace}/${ref.name}`)) results.push(finding(resource, rule, `${label} references missing Secret ${ref.name}.`, [...keys, 'envFrom', sourceIndex]));
      }
    } else if (rule.type === 'private-registry-pull-secret') {
      const registry = rule.parameters.registries.find((prefix: string) => typeof container.image === 'string' && (container.image === prefix || container.image.startsWith(`${prefix}/`)));
      if (registry && pullSecrets(pod, namespace, lookup).length === 0) results.push(finding(resource, rule, `${label} uses private registry ${registry} without imagePullSecrets.`, keys));
    } else if (rule.type === 'readiness-probe' && group.probes && !container.readinessProbe) results.push(finding(resource, rule, `${label} has no readinessProbe.`, keys));
    else if (rule.type === 'liveness-probe' && group.probes && !container.livenessProbe) results.push(finding(resource, rule, `${label} has no livenessProbe.`, keys));
    else if (rule.type === 'resource-limits') {
      if (rule.parameters.cpu && !container.resources?.limits?.cpu) results.push(finding(resource, rule, `${label} has no CPU limit.`, keys));
      if (rule.parameters.memory && !container.resources?.limits?.memory) results.push(finding(resource, rule, `${label} has no memory limit.`, keys));
    }
  });
  return results;
}

function kubernetesPolicyTool() {
  return {
    id: 'kubernetes-policy', name: 'Kubernetes manifest policy', binary: 'node', tier: 'full',
    detect: (ctx: AnyRecord) => ctx.policyProject.kubernetes.policy_packs.length > 0,
    run: (ctx: AnyRecord) => {
      const { resources, sources } = loadKubernetesResources(ctx);
      const lookup = indexes(resources);
      const packs = ctx.policy.kubernetes_policy_packs.filter((pack: AnyRecord) => ctx.policyProject.kubernetes.policy_packs.includes(pack.id));
      const findings: AnyRecord[] = [];
      for (const resource of resources) {
        const podPath = WORKLOAD_PATHS[resource.value.kind];
        if (!podPath) continue;
        for (const pack of packs) for (const rule of pack.rules) findings.push(...evaluateRule(resource, podPath, rule, lookup));
      }
      return {
        errors: findings.filter((entry) => entry.severity === 'error').length,
        warnings: findings.filter((entry) => entry.severity === 'warning').length,
        findings,
        evidence: [...sources, ...packs.map((pack: AnyRecord) => ({ kind: 'policy-pack', source: path.basename(pack.path), sha256: pack.digest, bytes: pack.bytes }))],
      };
    },
  };
}

function registerKubernetesPolicyTools(registerTool: any): void { registerTool(kubernetesPolicyTool()); }

export { registerKubernetesPolicyTools };

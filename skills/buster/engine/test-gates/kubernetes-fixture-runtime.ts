import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from 'js-yaml';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const SECRET_NAME = /^[A-Za-z0-9._-]+$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const IMMUTABLE_IMAGE = /^([A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*)@(sha256:[a-f0-9]{64})$/u;
const MAX_TIMER_MS = 2_147_483_647;
const MAX_NAMESPACE_PREFIX_LENGTH = 42;
const CLUSTER_SCOPED_KINDS = new Set([
  'APIService', 'CertificateSigningRequest', 'ClusterRole', 'ClusterRoleBinding',
  'CSIDriver', 'CSINode', 'CustomResourceDefinition', 'FlowSchema', 'IngressClass',
  'MutatingWebhookConfiguration', 'Namespace', 'Node', 'PersistentVolume',
  'PriorityClass', 'PriorityLevelConfiguration', 'RuntimeClass', 'StorageClass',
  'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding',
  'ValidatingWebhookConfiguration', 'VolumeSnapshotClass',
]);
const ALLOWED_NAMESPACED_KINDS = new Set([
  'ConfigMap', 'CronJob', 'Deployment', 'Job', 'PersistentVolumeClaim', 'Pod', 'Service', 'StatefulSet',
]);

type Execute = (command: string, args: readonly string[], options: Readonly<Record<string, unknown>>)
  => Promise<{ stdout?: string; stderr?: string }>;
type JsonObject = Record<string, unknown>;

function executeProcess(command: string, args: readonly string[], options: Readonly<Record<string, unknown>>): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const maximum = Number(options.maxBuffer ?? 1024 * 1024);
    const input = options.input;
    const child = spawn(command, [...args], {
      env: options.env as NodeJS.ProcessEnv | undefined,
      signal: options.signal as AbortSignal | undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let errorBytes = 0;
    let limited = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), Number(options.timeout ?? 30_000));
    const collect = (target: Buffer[], chunk: Buffer, current: number): number => {
      const next = current + chunk.byteLength;
      if (next > maximum) { limited = true; child.kill('SIGKILL'); return next; }
      target.push(chunk); return next;
    };
    child.stdout.on('data', (chunk: Buffer) => { outputBytes = collect(output, chunk, outputBytes); });
    child.stderr.on('data', (chunk: Buffer) => { errorBytes = collect(errors, chunk, errorBytes); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(output).toString('utf8');
      const stderr = Buffer.concat(errors).toString('utf8');
      if (code === 0 && !limited) { resolve({ stdout, stderr }); return; }
      const error = new Error(limited ? 'KUBERNETES_FIXTURE_KUBECTL_OUTPUT_LIMIT'
        : `Command failed with code ${String(code)} and signal ${String(signal)}`) as Error & { stdout: string; stderr: string };
      error.stdout = stdout; error.stderr = stderr; reject(error);
    });
    if (input === null || input === undefined) child.stdin.end();
    else child.stdin.end(input as string | Buffer);
  });
}

export interface KubernetesFixtureCapabilityInvokerOptions {
  readonly workspaceRoot: string;
  readonly kubectlExecutable: string;
  readonly controllerNamespace: string;
  readonly leaseApiGroup: string;
  readonly leaseApiVersion: string;
  readonly allowedNamespacePrefixes: readonly string[];
  readonly allowedRegistryPrefixes: readonly string[];
  readonly allowedSecretReferences: readonly string[];
  readonly runnerSubject?: string;
  readonly credentialReaderSubject?: string;
  readonly maximumManifestBytes: number;
  readonly maximumResources: number;
  readonly maximumRetentionSeconds: number;
  readonly maximumExecutionMs: number;
  readonly pollIntervalMs?: number;
  readonly execute?: Execute;
  readonly now?: () => Date;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
  }
  return value as JsonObject;
}

function text(value: unknown, label: string, maximum = 1024): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) {
    throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
  }
  return Number(value);
}

function stringArray(value: unknown, label: string, maximum: number, pattern?: RegExp): string[] {
  if (!Array.isArray(value) || value.length > maximum
    || value.some((item) => typeof item !== 'string' || item.length < 1 || item.length > 253
      || item.includes('\0') || (pattern ? !pattern.test(item) : false))) {
    throw new Error(`KUBERNETES_FIXTURE_REQUEST_INVALID:${label}`);
  }
  return [...new Set(value as string[])];
}

function contained(root: string, value: unknown): string {
  const requested = text(value, 'manifestPath', 4096);
  if (!path.isAbsolute(requested)) throw new Error('KUBERNETES_FIXTURE_MANIFEST_PATH_INVALID');
  const canonical = fs.realpathSync(requested);
  if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) {
    throw new Error('KUBERNETES_FIXTURE_MANIFEST_PATH_DENIED');
  }
  if (!fs.statSync(canonical).isFile()) throw new Error('KUBERNETES_FIXTURE_MANIFEST_NOT_FILE');
  return canonical;
}

function manifestBytes(file: string, expectedDigest: string, maximumBytes: number): Buffer {
  const handle = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(handle);
    if (before.size < 1 || before.size > maximumBytes) throw new Error('KUBERNETES_FIXTURE_MANIFEST_SIZE_INVALID');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(handle, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error('KUBERNETES_FIXTURE_MANIFEST_READ_INCOMPLETE');
      offset += count;
    }
    const after = fs.fstatSync(handle);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error('KUBERNETES_FIXTURE_MANIFEST_CHANGED');
    }
    const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (digest !== expectedDigest) throw new Error('KUBERNETES_FIXTURE_MANIFEST_DIGEST_MISMATCH');
    return bytes;
  } finally {
    fs.closeSync(handle);
  }
}

function flattenDocuments(values: unknown[]): JsonObject[] {
  const out: JsonObject[] = [];
  const visit = (value: unknown): void => {
    const document = object(value, 'manifestDocument');
    if (document.kind === 'List') {
      if (!Array.isArray(document.items)) throw new Error('KUBERNETES_FIXTURE_MANIFEST_LIST_INVALID');
      for (const item of document.items) visit(item);
      return;
    }
    out.push(document);
  };
  for (const value of values) if (value !== null && value !== undefined) visit(value);
  return out;
}

function podSpecs(document: JsonObject): JsonObject[] {
  const spec = document.spec;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return [];
  const typed = spec as JsonObject;
  if (document.kind === 'Pod') return [typed];
  const template = typed.template;
  if (template && typeof template === 'object' && !Array.isArray(template)) {
    const templateSpec = (template as JsonObject).spec;
    if (templateSpec && typeof templateSpec === 'object' && !Array.isArray(templateSpec)) return [templateSpec as JsonObject];
  }
  const jobTemplate = typed.jobTemplate;
  if (jobTemplate && typeof jobTemplate === 'object' && !Array.isArray(jobTemplate)) {
    const jobSpec = (jobTemplate as JsonObject).spec;
    const jobTemplateValue = jobSpec && typeof jobSpec === 'object' && !Array.isArray(jobSpec)
      ? (jobSpec as JsonObject).template : null;
    const jobPodSpec = jobTemplateValue && typeof jobTemplateValue === 'object' && !Array.isArray(jobTemplateValue)
      ? (jobTemplateValue as JsonObject).spec : null;
    if (jobPodSpec && typeof jobPodSpec === 'object' && !Array.isArray(jobPodSpec)) return [jobPodSpec as JsonObject];
  }
  return [];
}

function validatePodSecurity(spec: JsonObject): void {
  if (spec.hostNetwork === true || spec.hostPID === true || spec.hostIPC === true) {
    throw new Error('KUBERNETES_FIXTURE_HOST_NAMESPACE_DENIED');
  }
  const podSecurity = object(spec.securityContext ?? {}, 'pod.securityContext');
  if (podSecurity.runAsNonRoot !== true) throw new Error('KUBERNETES_FIXTURE_RUN_AS_NON_ROOT_REQUIRED');
  const seccomp = object(podSecurity.seccompProfile ?? {}, 'pod.seccompProfile');
  if (seccomp.type !== 'RuntimeDefault' && seccomp.type !== 'Localhost') {
    throw new Error('KUBERNETES_FIXTURE_SECCOMP_REQUIRED');
  }
  const volumes = Array.isArray(spec.volumes) ? spec.volumes : [];
  if (volumes.some((volume) => object(volume, 'pod.volume').hostPath !== undefined)) {
    throw new Error('KUBERNETES_FIXTURE_HOST_PATH_DENIED');
  }
  for (const field of ['initContainers', 'containers']) {
    const containers = spec[field];
    if (containers === undefined) continue;
    if (!Array.isArray(containers) || (field === 'containers' && containers.length < 1)) {
      throw new Error('KUBERNETES_FIXTURE_CONTAINERS_INVALID');
    }
    for (const raw of containers) {
      const container = object(raw, 'container');
      const security = object(container.securityContext ?? {}, 'container.securityContext');
      if (security.privileged === true || security.allowPrivilegeEscalation !== false
        || (security.runAsNonRoot !== true && podSecurity.runAsNonRoot !== true)) {
        throw new Error('KUBERNETES_FIXTURE_CONTAINER_SECURITY_INVALID');
      }
      const capabilities = object(security.capabilities ?? {}, 'container.capabilities');
      if (!Array.isArray(capabilities.drop) || !capabilities.drop.includes('ALL')) {
        throw new Error('KUBERNETES_FIXTURE_CAPABILITY_DROP_REQUIRED');
      }
      const ports = Array.isArray(container.ports) ? container.ports : [];
      if (ports.some((port) => {
        const hostPort = object(port, 'container.port').hostPort;
        return hostPort !== undefined && hostPort !== 0;
      })) {
        throw new Error('KUBERNETES_FIXTURE_HOST_PORT_DENIED');
      }
    }
  }
}

function inspectManifest(bytes: Buffer, immutableImage: string, maximumResources: number,
  allowedRegistryPrefixes: readonly string[]): { resources: number; workloads: number } {
  let loaded: unknown[] = [];
  try { loadAll(bytes.toString('utf8'), (value) => { loaded.push(value); }); }
  catch (error) { throw new Error('KUBERNETES_FIXTURE_MANIFEST_PARSE_FAILED', { cause: error }); }
  const documents = flattenDocuments(loaded);
  if (documents.length < 1 || documents.length > maximumResources) throw new Error('KUBERNETES_FIXTURE_RESOURCE_COUNT_INVALID');
  let workloads = 0;
  let matchedImage = false;
  for (const document of documents) {
    const apiVersion = text(document.apiVersion, 'apiVersion', 128);
    const kind = text(document.kind, 'kind', 128);
    const metadata = object(document.metadata, 'metadata');
    text(metadata.name, 'metadata.name', 253);
    if (CLUSTER_SCOPED_KINDS.has(kind)) throw new Error(`KUBERNETES_FIXTURE_CLUSTER_SCOPE_DENIED:${kind}`);
    if (!ALLOWED_NAMESPACED_KINDS.has(kind)) throw new Error(`KUBERNETES_FIXTURE_RESOURCE_KIND_DENIED:${kind}`);
    if (metadata.namespace !== undefined) throw new Error(`KUBERNETES_FIXTURE_NAMESPACE_FIELD_DENIED:${kind}`);
    if (!apiVersion.includes('/') && apiVersion !== 'v1') throw new Error('KUBERNETES_FIXTURE_API_VERSION_INVALID');
    if (kind === 'Service') {
      const spec = object(document.spec, 'service.spec');
      const type = spec.type ?? 'ClusterIP';
      const annotations = object(metadata.annotations ?? {}, 'service.metadata.annotations');
      const externalIPs = spec.externalIPs;
      const hasExternalIPs = externalIPs !== undefined && (!Array.isArray(externalIPs) || externalIPs.length > 0);
      const externalName = spec.externalName;
      const hasExternalName = externalName !== undefined
        && (typeof externalName !== 'string' || externalName.trim().length > 0);
      if (type !== 'ClusterIP' || hasExternalIPs || hasExternalName) {
        throw new Error('KUBERNETES_FIXTURE_EXTERNAL_SERVICE_DENIED');
      }
      if (annotations['tailscale.com/expose'] !== undefined) {
        throw new Error('KUBERNETES_FIXTURE_EXTERNAL_SERVICE_DENIED');
      }
    }
    for (const spec of podSpecs(document)) {
      workloads += 1;
      validatePodSecurity(spec);
      for (const field of ['initContainers', 'containers']) {
        const containers = spec[field];
        if (containers === undefined) continue;
        if (!Array.isArray(containers)) throw new Error('KUBERNETES_FIXTURE_CONTAINERS_INVALID');
        for (const container of containers) {
          const image = text(object(container, 'container').image, 'container.image', 2048);
          const parsed = IMMUTABLE_IMAGE.exec(image);
          if (!parsed) throw new Error(`KUBERNETES_FIXTURE_MUTABLE_IMAGE_DENIED:${image}`);
          if (!allowedRegistryPrefixes.some((prefix) => parsed[1] === prefix || parsed[1]!.startsWith(`${prefix}/`))) {
            throw new Error(`KUBERNETES_FIXTURE_IMAGE_REGISTRY_DENIED:${image}`);
          }
          if (image === immutableImage) matchedImage = true;
        }
      }
    }
  }
  if (workloads < 1) throw new Error('KUBERNETES_FIXTURE_WORKLOAD_REQUIRED');
  if (!matchedImage) throw new Error('KUBERNETES_FIXTURE_IMAGE_NOT_USED');
  return { resources: documents.length, workloads };
}

function detail(error: unknown): string {
  if (error && typeof error === 'object') {
    const stderr = (error as Record<string, unknown>).stderr;
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim().slice(0, 4096);
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 4096);
}

function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new Error('KUBERNETES_FIXTURE_CANCELLED'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

export class KubernetesFixtureCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #root: string;
  readonly #kubectl: string;
  readonly #controllerNamespace: string;
  readonly #apiGroup: string;
  readonly #apiVersion: string;
  readonly #namespacePrefixes: ReadonlySet<string>;
  readonly #registryPrefixes: readonly string[];
  readonly #secretReferences: ReadonlySet<string>;
  readonly #runnerSubject: string;
  readonly #credentialReaderSubject: string;
  readonly #maximumManifestBytes: number;
  readonly #maximumResources: number;
  readonly #maximumRetentionSeconds: number;
  readonly #maximumExecutionMs: number;
  readonly #pollIntervalMs: number;
  readonly #execute: Execute;
  readonly #now: () => Date;

  constructor(options: KubernetesFixtureCapabilityInvokerOptions) {
    this.#root = fs.realpathSync(options.workspaceRoot);
    this.#kubectl = fs.realpathSync(options.kubectlExecutable);
    fs.accessSync(this.#kubectl, fs.constants.X_OK);
    if (!DNS_LABEL.test(options.controllerNamespace)) throw new Error('KUBERNETES_FIXTURE_CONTROLLER_NAMESPACE_INVALID');
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(options.leaseApiGroup)) throw new Error('KUBERNETES_FIXTURE_API_GROUP_INVALID');
    if (!/^v[0-9]+(?:alpha|beta)?[0-9]*$/u.test(options.leaseApiVersion)) throw new Error('KUBERNETES_FIXTURE_API_VERSION_INVALID');
    if (options.allowedNamespacePrefixes.length < 1
      || options.allowedNamespacePrefixes.some((item) => item.length > MAX_NAMESPACE_PREFIX_LENGTH || !DNS_LABEL.test(item))) {
      throw new Error('KUBERNETES_FIXTURE_NAMESPACE_PREFIXES_INVALID');
    }
    if (options.allowedRegistryPrefixes.length < 1
      || options.allowedRegistryPrefixes.some((item) => !/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*$/u.test(item))) {
      throw new Error('KUBERNETES_FIXTURE_REGISTRY_PREFIXES_INVALID');
    }
    if (options.allowedSecretReferences.some((item) => !SECRET_NAME.test(item))) {
      throw new Error('KUBERNETES_FIXTURE_SECRET_REFERENCES_INVALID');
    }
    const runnerSubject = options.runnerSubject ?? `${options.controllerNamespace}/agent-buster`;
    const credentialReaderSubject = options.credentialReaderSubject ?? `${options.controllerNamespace}/agent-nova`;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(runnerSubject)
      || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(credentialReaderSubject)) {
      throw new Error('KUBERNETES_FIXTURE_SUBJECT_INVALID');
    }
    for (const [value, label] of [[options.maximumManifestBytes, 'MANIFEST_SIZE'], [options.maximumResources, 'RESOURCE_COUNT'],
      [options.maximumRetentionSeconds, 'RETENTION'], [options.maximumExecutionMs, 'EXECUTION']] as const) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`KUBERNETES_FIXTURE_${label}_LIMIT_INVALID`);
    }
    this.#controllerNamespace = options.controllerNamespace;
    this.#apiGroup = options.leaseApiGroup;
    this.#apiVersion = options.leaseApiVersion;
    this.#namespacePrefixes = new Set(options.allowedNamespacePrefixes);
    this.#registryPrefixes = [...options.allowedRegistryPrefixes];
    this.#secretReferences = new Set(options.allowedSecretReferences);
    this.#runnerSubject = runnerSubject;
    this.#credentialReaderSubject = credentialReaderSubject;
    this.#maximumManifestBytes = options.maximumManifestBytes;
    this.#maximumResources = options.maximumResources;
    this.#maximumRetentionSeconds = options.maximumRetentionSeconds;
    this.#maximumExecutionMs = Math.min(options.maximumExecutionMs, MAX_TIMER_MS);
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    if (!Number.isSafeInteger(this.#pollIntervalMs) || this.#pollIntervalMs < 50 || this.#pollIntervalMs > 10_000) {
      throw new Error('KUBERNETES_FIXTURE_POLL_INTERVAL_INVALID');
    }
    this.#execute = options.execute ?? executeProcess;
    this.#now = options.now ?? (() => new Date());
  }

  async #kubectlRun(args: readonly string[], input: Buffer | string | null, signal: AbortSignal, timeout = this.#maximumExecutionMs): Promise<string> {
    try {
      const result = await this.#execute(this.#kubectl, args, {
        encoding: 'utf8', maxBuffer: this.#maximumManifestBytes * 2, timeout: Math.min(timeout, this.#maximumExecutionMs),
        signal, ...(input === null ? {} : { input }),
        env: { PATH: path.dirname(this.#kubectl), HOME: process.env.HOME, KUBECONFIG: process.env.KUBECONFIG,
          KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST,
          KUBERNETES_SERVICE_PORT: process.env.KUBERNETES_SERVICE_PORT },
      });
      return result.stdout ?? '';
    } catch (error) {
      if (signal.aborted) throw new Error('KUBERNETES_FIXTURE_CANCELLED', { cause: error });
      throw new Error(`KUBERNETES_FIXTURE_KUBECTL_FAILED:${detail(error)}`, { cause: error });
    }
  }

  async #waitLease(leaseName: string, signal: AbortSignal, timeoutMs: number): Promise<JsonObject> {
    const deadline = Date.now() + timeoutMs;
    let last = 'Pending';
    while (Date.now() < deadline) {
      const raw = await this.#kubectlRun(['get', 'busternamespacelease', leaseName, '-n', this.#controllerNamespace, '-o', 'json'], null, signal, 15_000);
      const value = object(JSON.parse(raw), 'lease');
      const status = object(value.status ?? {}, 'lease.status');
      const phase = typeof status.phase === 'string' ? status.phase : 'Pending';
      last = typeof status.message === 'string' ? status.message : phase;
      if (phase === 'Ready') return status;
      if (phase === 'Rejected') throw new Error(`KUBERNETES_FIXTURE_LEASE_REJECTED:${last}`);
      if (phase === 'Failed') throw new Error(`KUBERNETES_FIXTURE_LEASE_FAILED:${last}`);
      await waitForPoll(this.#pollIntervalMs, signal);
    }
    throw new Error(`KUBERNETES_FIXTURE_LEASE_TIMEOUT:${last}`);
  }

  async #waitPods(namespace: string, signal: AbortSignal, timeoutMs: number): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let last = 'No pods found.';
    while (Date.now() < deadline) {
      const raw = await this.#kubectlRun(['get', 'pods', '-n', namespace, '-o', 'json'], null, signal, 15_000);
      const value = object(JSON.parse(raw), 'pods');
      const items = Array.isArray(value.items) ? value.items : [];
      if (items.length > 0) {
        const pending: string[] = [];
        for (const rawPod of items) {
          const pod = object(rawPod, 'pod');
          const metadata = object(pod.metadata, 'pod.metadata');
          const status = object(pod.status ?? {}, 'pod.status');
          const conditions = Array.isArray(status.conditions) ? status.conditions : [];
          const ready = conditions.some((condition) => {
            const item = condition && typeof condition === 'object' && !Array.isArray(condition) ? condition as JsonObject : {};
            return item.type === 'Ready' && item.status === 'True';
          });
          if (!ready) pending.push(String(metadata.name ?? 'unknown'));
        }
        if (pending.length === 0) return items.length;
        last = `Pods not ready: ${pending.join(', ')}`;
      }
      await waitForPoll(this.#pollIntervalMs, signal);
    }
    throw new Error(`KUBERNETES_FIXTURE_READINESS_TIMEOUT:${last}`);
  }

  async #waitService(namespace: string, serviceName: string, servicePort: number,
    signal: AbortSignal, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = 'Service endpoints not ready.';
    while (Date.now() < deadline) {
      const serviceTimeoutMs = Math.max(1, Math.min(15_000, deadline - Date.now()));
      const serviceRaw = await this.#kubectlRun(['get', 'service', serviceName, '-n', namespace, '-o', 'json'], null, signal, serviceTimeoutMs);
      const service = object(JSON.parse(serviceRaw), 'service');
      const spec = object(service.spec, 'service.spec');
      const ports = Array.isArray(spec.ports) ? spec.ports : [];
      const servicePortEntry = ports.map((entry) => object(entry, 'service.port'))
        .find((entry) => entry.port === servicePort);
      if (!servicePortEntry) throw new Error('KUBERNETES_FIXTURE_SERVICE_PORT_MISMATCH');
      const servicePortName = typeof servicePortEntry.name === 'string' ? servicePortEntry.name : null;
      const targetPort = servicePortEntry.targetPort ?? servicePortEntry.port;
      if (Date.now() >= deadline) break;
      try {
        const endpointsTimeoutMs = Math.max(1, Math.min(15_000, deadline - Date.now()));
        const endpointsRaw = await this.#kubectlRun(['get', 'endpoints', serviceName, '-n', namespace, '-o', 'json'], null, signal, endpointsTimeoutMs);
        const endpoints = object(JSON.parse(endpointsRaw), 'endpoints');
        const subsets = Array.isArray(endpoints.subsets) ? endpoints.subsets : [];
        const ready = subsets.some((entry) => {
          const subset = object(entry, 'endpoints.subset');
          const endpointPorts = Array.isArray(subset.ports) ? subset.ports.map((port) => object(port, 'endpoints.port')) : [];
          const hasConfiguredPort = endpointPorts.some((port) => servicePortName
            ? port.name === servicePortName
            : (Number.isSafeInteger(targetPort) ? port.port === targetPort : ports.length === 1));
          return Array.isArray(subset.addresses) && subset.addresses.length > 0
            && hasConfiguredPort;
        });
        if (ready && Date.now() < deadline) return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/\bNotFound\b|\bnot found\b/iu.test(message)) throw error;
      }
      last = `Service ${serviceName} has no ready endpoints.`;
      const pollMs = Math.min(this.#pollIntervalMs, Math.max(0, deadline - Date.now()));
      if (pollMs > 0) await waitForPoll(pollMs, signal);
    }
    throw new Error(`KUBERNETES_FIXTURE_SERVICE_READINESS_TIMEOUT:${last}`);
  }

  async #releaseAfterPrepareFailure(leaseName: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#maximumExecutionMs);
    try {
      await this.#release(leaseName, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async #prepare(request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    const payload = object(request.payload, 'payload');
    const leaseName = text(payload.leaseName, 'leaseName', 63);
    if (!DNS_LABEL.test(leaseName)) throw new Error('KUBERNETES_FIXTURE_LEASE_NAME_INVALID');
    const namespacePrefix = text(payload.namespacePrefix, 'namespacePrefix', MAX_NAMESPACE_PREFIX_LENGTH);
    if (!this.#namespacePrefixes.has(namespacePrefix)) throw new Error('KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED');
    const namespaceName = text(payload.namespaceName, 'namespaceName', 63);
    if (!DNS_LABEL.test(namespaceName) || !namespaceName.startsWith(`${namespacePrefix}-`)) {
      throw new Error('KUBERNETES_FIXTURE_NAMESPACE_NAME_INVALID');
    }
    const immutableImage = text(payload.immutableImage, 'immutableImage', 2048);
    const image = IMMUTABLE_IMAGE.exec(immutableImage);
    if (!image || !this.#registryPrefixes.some((prefix) => image[1] === prefix || image[1]!.startsWith(`${prefix}/`))) {
      throw new Error('KUBERNETES_FIXTURE_IMAGE_DENIED');
    }
    if (payload.imageDigest !== image[2] || !DIGEST.test(String(payload.imageDigest))) {
      throw new Error('KUBERNETES_FIXTURE_IMAGE_DIGEST_INVALID');
    }
    const manifestDigest = text(payload.manifestDigest, 'manifestDigest', 71);
    if (!DIGEST.test(manifestDigest)) throw new Error('KUBERNETES_FIXTURE_MANIFEST_DIGEST_INVALID');
    const manifestPath = contained(this.#root, payload.manifestPath);
    const bytes = manifestBytes(manifestPath, manifestDigest, this.#maximumManifestBytes);
    const facts = inspectManifest(bytes, immutableImage, this.#maximumResources, this.#registryPrefixes);
    const serviceName = text(payload.serviceName, 'serviceName', 63);
    if (!DNS_LABEL.test(serviceName)) throw new Error('KUBERNETES_FIXTURE_SERVICE_NAME_INVALID');
    const servicePort = integer(payload.servicePort, 'servicePort', 1, 65_535);
    const retentionSeconds = integer(payload.retentionSeconds, 'retentionSeconds', 60, this.#maximumRetentionSeconds);
    const retentionMode = text(payload.retentionMode, 'retentionMode', 6);
    if (retentionMode !== 'delete' && retentionMode !== 'retain') {
      throw new Error('KUBERNETES_FIXTURE_RETENTION_MODE_INVALID');
    }
    const readinessTimeoutMs = integer(payload.readinessTimeoutMs, 'readinessTimeoutMs', 1_000, this.#maximumExecutionMs);
    const secretReferences = stringArray(payload.secretReferences ?? [], 'secretReferences', 32, SECRET_NAME);
    if (secretReferences.some((name) => !this.#secretReferences.has(name))) {
      throw new Error('KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED');
    }
    const credentialsValue = payload.testCredentials === undefined ? null : object(payload.testCredentials, 'testCredentials');
    let testCredentials: JsonObject | null = null;
    if (credentialsValue) {
      const mode = text(credentialsValue.mode, 'testCredentials.mode', 16);
      const secretName = text(credentialsValue.secretName, 'testCredentials.secretName', 253);
      if (mode !== 'generate' || !SECRET_NAME.test(secretName)) {
        throw new Error('KUBERNETES_FIXTURE_TEST_CREDENTIALS_INVALID');
      }
      testCredentials = { mode, secretName, keys: ['username', 'password'],
        readers: [...new Set([this.#credentialReaderSubject, this.#runnerSubject])] };
    }
    const lease = {
      apiVersion: `${this.#apiGroup}/${this.#apiVersion}`, kind: 'BusterNamespaceLease',
      metadata: { name: leaseName, namespace: this.#controllerNamespace,
        labels: { 'openclaw.io/buster-scope': request.resource.canonicalId.replace(/[^A-Za-z0-9._-]/gu, '-').slice(0, 63) } },
      spec: { namespaceName, namespacePrefix, runId: leaseName, project: text(payload.project, 'project', 253),
        purpose: 'gate', serviceName, servicePort, cleanupPolicy: retentionMode,
        ttlSeconds: retentionSeconds, access: [{ subject: this.#runnerSubject, mode: 'deployer' }],
        secretsToCopy: secretReferences, ...(testCredentials ? { testCredentials } : {}), exposure: { provider: 'off' } },
    };
    const leaseBytes = `${JSON.stringify(lease)}\n`;
    const resource = `busternamespaceleases.${this.#apiGroup}`;
    for (const verb of ['create', 'get', 'delete']) {
      const allowed = (await this.#kubectlRun(['auth', 'can-i', verb, resource, '-n', this.#controllerNamespace], null, signal, 15_000)).trim();
      if (allowed !== 'yes') throw new Error(`KUBERNETES_FIXTURE_RBAC_DENIED:${verb}`);
    }
    await this.#kubectlRun(['apply', '--dry-run=server', '-f', '-'], leaseBytes, signal, 15_000);
    await this.#kubectlRun(['apply', '-f', '-'], leaseBytes, signal, 15_000);
    let status: JsonObject;
    try {
      status = await this.#waitLease(leaseName, signal, readinessTimeoutMs);
      const actualNamespace = text(status.namespaceName, 'status.namespaceName', 63);
      if (actualNamespace !== namespaceName) throw new Error('KUBERNETES_FIXTURE_NAMESPACE_MISMATCH');
      await this.#kubectlRun(['apply', '--namespace', namespaceName, '-f', '-'], bytes, signal, readinessTimeoutMs);
      const readinessDeadline = Date.now() + readinessTimeoutMs;
      const podCount = await this.#waitPods(namespaceName, signal, readinessTimeoutMs);
      const serviceReadinessMs = readinessDeadline - Date.now();
      if (serviceReadinessMs <= 0) throw new Error('KUBERNETES_FIXTURE_SERVICE_READINESS_TIMEOUT:Readiness deadline expired.');
      await this.#waitService(namespaceName, serviceName, servicePort, signal, serviceReadinessMs);
      const createdAt = text(status.createdAt, 'status.createdAt', 64);
      if (!Number.isFinite(Date.parse(createdAt))) throw new Error('KUBERNETES_FIXTURE_CREATED_AT_INVALID');
      const expiresAt = typeof status.expiresAt === 'string' ? status.expiresAt : new Date(Date.parse(createdAt) + retentionSeconds * 1_000).toISOString();
      return Object.freeze({ ok: true, leaseName, namespace: namespaceName, createdAt, expiresAt,
        endpoint: `http://${serviceName}.${namespaceName}.svc.cluster.local:${servicePort}`,
        releaseAction: `kubectl delete busternamespacelease ${leaseName} -n ${this.#controllerNamespace}`,
        manifestDigest, immutableImage, secretReferences,
        ...(testCredentials ? { credentialsRef: testCredentials.secretName } : {}),
        resourceCount: facts.resources, workloadCount: facts.workloads, podCount });
    } catch (error) {
      await this.#releaseAfterPrepareFailure(leaseName).catch(() => undefined);
      throw error;
    }
  }

  async #release(leaseName: string, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (!DNS_LABEL.test(leaseName)) throw new Error('KUBERNETES_FIXTURE_LEASE_NAME_INVALID');
    await this.#kubectlRun(['delete', 'busternamespacelease', leaseName, '-n', this.#controllerNamespace,
      '--ignore-not-found=true', '--wait=true', `--timeout=${Math.ceil(this.#maximumExecutionMs / 1_000)}s`], null, signal);
    return Object.freeze({ ok: true, leaseName, released: true });
  }

  async invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'kubernetes.fixture' || request.resource.type !== 'kubernetes.fixture'
      || !/^kubernetes-fixture:attempt:[A-Za-z0-9._:-]+$/u.test(request.resource.canonicalId)) {
      throw new Error('KUBERNETES_FIXTURE_CAPABILITY_REQUEST_INVALID');
    }
    if (request.operation === 'prepare') return this.#prepare(request, signal);
    if (request.operation === 'release') {
      const payload = object(request.payload, 'payload');
      return this.#release(text(payload.leaseName, 'leaseName', 63), signal);
    }
    throw new Error('KUBERNETES_FIXTURE_OPERATION_INVALID');
  }
}

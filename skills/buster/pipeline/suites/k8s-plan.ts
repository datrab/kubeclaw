import path from 'path';
import { selectDefinedValue } from '../optional-absence.ts';
import { createFinding, createSuiteVerdict, SEVERITY, STATUS } from '../services/verdict-schema.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import { buildCleanupKubernetesLabels, trackRuntimeResources } from '../services/resource-cleanup.ts';
import { buildPreviewCredentialCommand, normalizeTestCredentialSpecs } from './k8s-credentials.ts';
import type { TestCredentialSpec } from './k8s-credentials.ts';
import { buildK8sCommandEnv } from './k8s-command-env.ts';
import type { K8sCommandEnv } from './k8s-command-env.ts';
import { resolveRepoScopedPath } from './repo-paths.ts';
import { normalizeK8sConfig } from './k8s-config.ts';
import {
  SAFE_NAMESPACE_PREFIXES, buildBusterNamespaceLease, buildK8sSuiteNamespace, k8sRepoRoot,
  makeCheck, previewCredentialSecretAuthority, resolveK8sLocalRegistry, sanitizeDnsLabel,
  shortId, validateK8sNamespacePrefix, validateK8sServicePort,
} from './k8s-base.ts';
import type { AnyRecord, Check, K8sContext, SuiteLog } from './k8s-base.ts';
import { uniqueStrings } from './k8s-lease.ts';

export interface K8sPlan {
  context: K8sContext; payload: AnyRecord; moduleId: string | undefined; startTime: number; log: SuiteLog;
  commandEnv: K8sCommandEnv; repoRoot: string; sourceImage: string | null; dockerfile: string | null;
  buildContext: string | null; imageName: string; serviceName: string; manifestPaths: string[]; port: number;
  healthPath: string; readyTimeout: number; namespacePrefix: string; secretsToCopy: string[];
  leaseTimeout: number; ttlSeconds: number; cleanupPolicy: 'keep' | 'delete'; purpose: 'final-preview' | 'pretest';
  previewProvider: string; previewPath: string; previewCredentialsRef: string | null; previewCredentialSecretName: string | null;
  previewCredentialsKeys: string[]; previewRevealCredentials: boolean; previewExpectedText: string | null;
  testCredentialSpecs: TestCredentialSpec[]; previewUrlTimeout: number; buildTimeoutMs: number; pushTimeoutMs: number;
  deployTimeoutMs: number; healthRetries: number; healthBaseDelayMs: number; runId: string; namespace: string;
  leaseName: string; previewCredentialCommand: string | null; previewHostname: string; previewExposure: AnyRecord;
  registryTag: string; namespaceLease: AnyRecord; checks: Check[]; criticalFailed: boolean;
}

type PlanResult = { ok: true; plan: K8sPlan } | { ok: false; verdict: SuiteVerdict };

function failure(startTime: number, message: string, rule: string): PlanResult {
  const check = makeCheck(rule, false, message);
  return { ok: false, verdict: createSuiteVerdict('k8s', STATUS.FAIL, { critical: true, duration_ms: Date.now() - startTime,
    checks_total: 1, checks_passed: 0, checks_failed: 1, findings: [createFinding(SEVERITY.CRITICAL, message, { rule })],
    reason: message, metadata: { checks: [check] } }) };
}

function imageInputs(config: AnyRecord, repoRoot: string): { sourceImage: string | null; dockerfile: string | null; buildContext: string | null; manifestPaths: string[] } {
  const sourceImage = typeof config.source_image === 'string' && config.source_image.trim() ? config.source_image.trim() : null;
  const dockerfile = sourceImage ? null : config.dockerfile ? resolveRepoScopedPath(config.dockerfile, { repoDir: repoRoot, field: 'k8s.dockerfile' }) : null;
  const buildContext = sourceImage ? null : config.build_context
    ? resolveRepoScopedPath(config.build_context, { repoDir: repoRoot, field: 'k8s.build_context' })
    : dockerfile ? path.dirname(dockerfile) : null;
  const manifests = Array.isArray(config.manifests) ? config.manifests : [];
  return { sourceImage, dockerfile, buildContext,
    manifestPaths: manifests.map((manifest) => resolveRepoScopedPath(manifest, { repoDir: repoRoot, field: 'k8s.manifests[]' })).filter((value): value is string => Boolean(value)) };
}

function previewInputs(config: AnyRecord, namespace: string, serviceName: string, port: number, payload: AnyRecord, runId: string): Pick<K8sPlan,
  'previewProvider' | 'previewPath' | 'previewCredentialsRef' | 'previewCredentialSecretName' | 'previewCredentialsKeys' |
  'previewRevealCredentials' | 'previewExpectedText' | 'testCredentialSpecs' | 'previewCredentialCommand' | 'previewHostname' | 'previewExposure'> {
  const preview = config.preview;
  const ref = typeof preview.credentials_ref === 'string' ? preview.credentials_ref : null;
  const secret = typeof preview.credentials_secret_name === 'string' ? preview.credentials_secret_name : null;
  const keys = Array.isArray(preview.credentials_keys) ? preview.credentials_keys.filter((key: unknown): key is string => typeof key === 'string' && Boolean(key.trim())) : [];
  const reveal = config.purpose === 'final-preview' && (preview.reveal_credentials === true || preview.credentials_delivery === 'discord');
  const secretName = previewCredentialSecretAuthority(secret, ref);
  const requested = selectDefinedValue(() => preview.hostname, () => `${typeof payload.project === 'string' ? payload.project : 'project'}-${runId}-${serviceName}`);
  const hostname = sanitizeDnsLabel(requested, `${namespace}-${serviceName}`);
  const provider = config.purpose === 'final-preview' ? config.preview_provider : 'off';
  return { previewProvider: provider, previewPath: config.preview_path, previewCredentialsRef: ref, previewCredentialSecretName: secretName,
    previewCredentialsKeys: keys, previewRevealCredentials: reveal,
    previewExpectedText: typeof preview.expected_text === 'string' && preview.expected_text ? preview.expected_text : null,
    testCredentialSpecs: normalizeTestCredentialSpecs(config, { ...preview, credentials_ref: ref, credentials_secret_name: secret, credentials_keys: keys, reveal_credentials: reveal }),
    previewCredentialCommand: reveal ? buildPreviewCredentialCommand(secretName, keys, namespace) : null,
    previewHostname: hostname, previewExposure: { provider, hostname, serviceName, servicePort: port, path: config.preview_path,
      credentialsRef: ref, credentialsSecretName: secret, credentialsKeys: keys, revealCredentials: reveal } };
}

export function prepareK8sPlan(context: K8sContext, startTime: number, log: SuiteLog): PlanResult {
  const payload = context.payload ?? {};
  const config = normalizeK8sConfig(context.config?.k8s);
  const repoRoot = k8sRepoRoot(context);
  const image = imageInputs(config, repoRoot);
  const manifests = Array.isArray(config.manifests) ? config.manifests : [];
  if (!config.image_name || !config.service_name || manifests.length === 0 || image.manifestPaths.length !== manifests.length) return failure(startTime, 'k8s suite requires image_name, service_name, and valid manifests[]', 'k8s-config-required');
  if (!image.sourceImage && !image.dockerfile) return failure(startTime, 'k8s suite requires either source_image or dockerfile', 'k8s-image-source-required');
  if (!image.sourceImage && !image.buildContext) return failure(startTime, 'k8s.build_context is invalid', 'k8s-build-context');
  if (!validateK8sNamespacePrefix(config.namespace_prefix)) return failure(startTime, `Invalid k8s namespace_prefix "${config.namespace_prefix}"; expected one of: ${SAFE_NAMESPACE_PREFIXES.join(', ')}`, 'namespace-prefix');
  if (!validateK8sServicePort(config.port)) return failure(startTime, `Invalid k8s service port ${config.port}; expected integer 1-65535`, 'service-port');
  const runId = shortId();
  const namespace = buildK8sSuiteNamespace(config.namespace_prefix, payload.project, runId);
  const preview = previewInputs(config, namespace, config.service_name, config.port, payload, runId);
  const secretsToCopy = uniqueStrings(config.secrets_to_copy.filter((secret): secret is string => typeof secret === 'string'));
  const registryTag = `${resolveK8sLocalRegistry()}/${config.image_name}:${runId}`;
  trackRuntimeResources(payload, { leases: [namespace] });
  const exposure = preview.previewExposure;
  return { ok: true, plan: { context, payload, moduleId: context.moduleId, startTime, log, commandEnv: buildK8sCommandEnv(config.kubeconfig_path), repoRoot,
    ...image, imageName: config.image_name, serviceName: config.service_name, port: config.port, healthPath: config.health_path,
    readyTimeout: config.ready_timeout_seconds, namespacePrefix: config.namespace_prefix, secretsToCopy, leaseTimeout: config.namespace_lease_timeout_seconds,
    ttlSeconds: config.namespace_ttl_seconds, cleanupPolicy: config.cleanup_policy, purpose: config.purpose, ...preview,
    previewUrlTimeout: config.preview_url_timeout_seconds, buildTimeoutMs: config.build_timeout_seconds * 1000,
    pushTimeoutMs: config.push_timeout_seconds * 1000, deployTimeoutMs: config.deploy_timeout_seconds * 1000,
    healthRetries: config.health_retries, healthBaseDelayMs: config.health_base_delay_ms, runId, namespace, leaseName: namespace,
    registryTag, namespaceLease: buildBusterNamespaceLease({ leaseName: namespace, namespaceName: namespace, namespacePrefix: config.namespace_prefix,
      serviceName: config.service_name, secretsToCopy, payload, ttlSeconds: config.namespace_ttl_seconds, cleanupPolicy: config.cleanup_policy,
      purpose: config.purpose, exposure }), checks: [], criticalFailed: false } };
}

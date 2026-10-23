import { validatePipelineV10Recovery } from './pipeline-v10-recovery.ts';
import { validatePipelineV10Gateway } from './pipeline-v10-gateway.ts';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';

interface Validator { (value: unknown): boolean; errors?: unknown }
const catalog = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-infra-schemas.json', import.meta.url), 'utf8')) as
  Record<string, { targetPath: string; schema: object; dependencies?: { uri: string; schema: object }[] }>;
const Constructor = Ajv2020 as unknown as new (options: object) => { compile(schema: object): Validator; addSchema(schema: object, key: string): void };
const validators = new Map<string, Validator>();
function requireRelation(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`PIPELINE_V10_INFRA_RELATION_INVALID:${reason}`);
}

/** Effect-free prerequisite only. No caller capture, installed source receipt,
 * task authorization, native eligibility or union of grants is produced here.
 * read must retain same-generation no-follow byte observations until closeout.
 */
export function preflightPipelineV10Infrastructure(root: any, components: any, read: (relative: string) => Buffer): void {
  const documents: Record<string, any> = {};
  for (const [name, source] of Object.entries(catalog)) {
    const raw = read(source.targetPath).toString('utf8');
    // JSON is YAML 1.2 too; this also rejects duplicate keys in JSON authors.
    const parsed = parseDocument(raw, { version: '1.2', uniqueKeys: true, strict: true });
    if (parsed.errors.length) throw new Error(`PIPELINE_V10_INFRA_PARSE_INVALID:${name}`);
    const value = parsed.toJS();
    let validator = validators.get(name);
    if (!validator) {
      const ajv = new Constructor({ strict: true, allErrors: true, allowUnionTypes: true });
      (addFormats as unknown as (ajv: unknown) => void)(ajv);
      for (const dependency of source.dependencies ?? []) ajv.addSchema(dependency.schema, dependency.uri);
      validator = ajv.compile(source.schema); validators.set(name, validator);
    }
    if (!validator(value)) throw new Error(`PIPELINE_V10_INFRA_OWNER_INVALID:${name}:${JSON.stringify(validator.errors)}`);
    documents[name] = value;
  }
  for (const p of Object.values(documents.core.profiles) as any[]) {
    const locks = p.settings.runtimeLocks;
    requireRelation(locks.runMutationLockRenewEveryMs < locks.runMutationLockTtlMs, 'CORE_LOCK_RENEWAL');
  }
  for (const [id, p] of Object.entries(documents.chart.profiles) as [string, any][]) {
    requireRelation(id === p.profileId, 'CHART_PROFILE_ID');
    if (p.role !== 'buster') continue;
    const broker = p.settings.busterNamespaceBroker;
    if (!broker.enabled) continue;
    requireRelation(broker.defaultTtlSeconds <= broker.maxTtlSeconds, 'CONTROLLER_TTL');
    requireRelation(!p.readonlyBindings.product.enabled || broker.controller.readiness.enabled, 'PRODUCT_REQUIRES_READY');
  }
  for (const p of Object.values(documents.engine.profiles) as any[]) {
    const window = p.limits.timeoutMs + 4 * p.limits.cleanupTimeoutMs;
    requireRelation(Number.isSafeInteger(window) && p.claimLifetimeMs > window, 'ENGINE_CLAIM_WINDOW');
    requireRelation(p.terminationGraceMs <= p.limits.cleanupTimeoutMs, 'ENGINE_KILL_CLEANUP');
    requireRelation(p.limits.evidenceBytes >= p.limits.logBytes && p.limits.evidenceFiles >= 1, 'ENGINE_LOG_ADEQUACY');
    requireRelation(p.limits.timeoutMs + 30000 <= 2147000000, 'ENGINE_CLI_CLAMP');
  }
  const selected = (name: string, tuple: any, ownerPath: string) => {
    requireRelation(tuple?.ownerPath === ownerPath, `${name}:OWNER_PATH`);
    const profile = documents[name].profiles[tuple.profileId];
    requireRelation(profile, `${name}:PROFILE_REQUIRED`);
    return profile;
  };
  const peer = (owner: string, instanceId: string, role: string) => {
    const matches = root.bindings.filter((b: any) => b.owner === owner && b.instanceId === instanceId && b.role === role);
    requireRelation(matches.length === 1, `${owner}:EXACT_PEER_REQUIRED`);
    return components[owner].profiles[matches[0].profileId].settings;
  };
  selected('core', root.novaCoreSelection, 'nova/core.config.json');
  requireRelation(root.novaCoreSelection.role === 'nova', 'CORE_ROLE');
  for (const tuple of root.engineSelections) {
    selected('engine', tuple, 'engines/prism-agent.config.json');
    requireRelation(tuple.role === 'prism-agent' && tuple.kind === 'service-launcher', 'ENGINE_ROLE');
    peer('prism-control', tuple.controlComponentInstanceId, 'prism');
  }
  for (const tuple of root.deploymentSelections) {
    const profile = selected('chart', tuple, 'charts/kubeclaw/values.yaml');
    requireRelation(profile.role === tuple.role, 'DEPLOYMENT_ROLE_PROFILE');
    if (tuple.consumer === 'namespace-controller') {
      const bs = peer('buster-engine', tuple.busterComponentInstanceId, 'buster');
      const control = peer('prism-control', tuple.controlComponentInstanceId, 'prism');
      if (profile.settings.busterNamespaceBroker.enabled) {
        requireRelation(profile.readonlyBindings.sharedLease.apiGroup === bs.clusterInvokers.shared.leaseApiGroup
          && profile.readonlyBindings.sharedLease.apiVersion === bs.clusterInvokers.shared.leaseApiVersion, 'CONTROLLER_LEASE_SOURCE');
        requireRelation(profile.readonlyBindings.product.enabled === control.productAuthority.enabled, 'CONTROLLER_PRODUCT_SOURCE');
        requireRelation(profile.readonlyBindings.resourceNamePrefix === `agent-${tuple.role}`, 'CONTROLLER_RESOURCE_IDENTITY');
      }
    }
  }
  for (const tuple of root.infrastructureSelections) {
    if (tuple.role === 'secret-provisioning') selected('provisioning', tuple, 'my-values/infra/secret-provisioning.yaml');
    else {
      requireRelation(tuple.role === 'postgresql-recovery', 'INFRA_ROLE');
      selected('recovery', tuple, 'my-values/infra/postgresql-recovery.yaml');
    }
  }
  validatePipelineV10Recovery(documents.recovery);
  validatePipelineV10Gateway(root, documents.chart, read);
  // Recovery quantities/metadata depend on genuine original source context;
  // Gateway managed bootstrap/issuer/revision and per-object provisioning FD9
  // authorizations remain required. The caller retains the final source gate.
}

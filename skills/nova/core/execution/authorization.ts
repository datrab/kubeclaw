import fs from 'node:fs';
import path from 'node:path';
import type { CapabilityGrant, CapabilityInvocation } from '@kubeclaw/plugin-sdk';
import { validateCapabilityConstraints, validateCapabilityInvocationContract } from '@kubeclaw/plugin-foundation/registry/capability-vocabulary';

type Constraints = Readonly<Record<string, readonly string[]>>;
type Handler = (grant: CapabilityGrant, request: CapabilityInvocation, constraints: Constraints) => void;
function allowed(constraints: Constraints, key: string): readonly string[] { const value = constraints[key]; if (!value) throw new Error(`CAPABILITY_CONSTRAINT_INVALID:${key}`); return value; }
function denied(grant: CapabilityGrant, value: string): never { throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${value}`); }
function payloadText(request: CapabilityInvocation, key: string): string { const value = request.payload[key]; if (typeof value !== 'string' || value.length === 0) throw new Error(`CAPABILITY_REQUEST_INVALID:${key}`); return value; }
function canonicalAbsolute(value: string): boolean { return path.isAbsolute(value) && path.normalize(value) === value && !value.includes('\0') && !/[\r\n]/u.test(value); }
function existing(value: string): string | undefined {
  if (!canonicalAbsolute(value)) return undefined;
  try { return fs.realpathSync(value); } catch {
    // INTENTIONAL_NONCRITICAL(canonical_existing_unavailable): Inaccessible paths are denied.
    return undefined;
  }
}
function potential(value: string): string | undefined {
  if (!canonicalAbsolute(value)) return undefined;
  let cursor = value; const suffix: string[] = [];
  while (!fs.existsSync(cursor)) { const parent = path.dirname(cursor); if (parent === cursor) return undefined; suffix.unshift(path.basename(cursor)); cursor = parent; }
  try { return path.join(fs.realpathSync(cursor), ...suffix); } catch {
    // INTENTIONAL_NONCRITICAL(canonical_potential_unavailable): Inaccessible ancestors are denied.
    return undefined;
  }
}
function within(value: string, roots: readonly string[], resolver: (value: string) => string | undefined): boolean {
  const candidate = resolver(value); const canonicalRoots = roots.map(existing);
  return candidate !== undefined && canonicalRoots.every((root): root is string => root !== undefined)
    && canonicalRoots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`));
}
function relative(value: string, prefixes: readonly string[]): boolean {
  const valid = value.length > 0 && !path.posix.isAbsolute(value) && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.includes('\\') && !value.includes('\0') && !/[\r\n]/u.test(value)
    && !value.split('/').includes('..') && path.posix.normalize(value) === value;
  return valid && prefixes.some((prefix) => { const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix; return base === '.' || value === base || value.startsWith(`${base}/`); });
}
function included(grant: CapabilityGrant, value: string, constraints: Constraints, key: string): void { if (!allowed(constraints, key).includes(value)) denied(grant, value); }

const relativeRead: Handler = (grant, request, constraints) => {
  const prefixes = allowed(constraints, 'allowedPrefixes');
  if (request.operation !== 'changed_manifest' && request.operation !== 'freeze_head') {
    if (!relative(request.resource.canonicalId, prefixes)) denied(grant, request.resource.canonicalId);
    return;
  }
  if (request.resource.canonicalId !== '.') denied(grant, request.resource.canonicalId);
  if (request.operation === 'freeze_head') return;
  const requested = request.payload.allowedPrefixes;
  if (!Array.isArray(requested) || requested.length === 0
    || requested.some((entry) => typeof entry !== 'string' || !relative(entry, prefixes))) {
    denied(grant, 'allowedPrefixes');
  }
};
const git: Handler = (grant, request, constraints) => {
  if (!within(request.resource.canonicalId, allowed(constraints, 'allowedRoots'), existing)) denied(grant, request.resource.canonicalId);
  if (grant.capability === 'git.workspace.create' || grant.capability === 'git.workspace.remove') {
    const workspace = payloadText(request, 'workspacePath');
    if (!within(workspace, allowed(constraints, 'allowedWorkspaceRoots'), potential)) denied(grant, workspace);
  }
};
const artifact: Handler = (grant, request, constraints) => included(grant, payloadText(request, 'namespace'), constraints, 'allowedNamespaces');
const agent: Handler = (grant, request, constraints) => included(grant, request.resource.canonicalId, constraints, 'allowedAgents');
const secret: Handler = (grant, request, constraints) => included(grant, request.resource.canonicalId, constraints, 'allowedNames');
const target: Handler = (grant, request, constraints) => included(grant, request.resource.canonicalId, constraints, 'allowedTargets');
const source: Handler = (grant, request, constraints) => included(grant, request.resource.canonicalId, constraints, 'allowedSources');
const network: Handler = (grant, request, constraints) => { let origin: string; try { origin = new URL(request.resource.canonicalId).origin; } catch { throw new Error(`CAPABILITY_RESOURCE_INVALID:${grant.capability}`); } included(grant, origin, constraints, 'allowedOrigins'); };
const command: Handler = (grant, request, constraints) => { included(grant, request.resource.canonicalId, constraints, 'allowedExecutables'); const directory = payloadText(request, 'workingDirectory'); if (!within(directory, allowed(constraints, 'allowedWorkingRoots'), existing)) denied(grant, directory); };
const containerBuild: Handler = (grant, request, constraints) => {
  const repository = payloadText(request, 'repositoryRoot');
  const scratch = payloadText(request, 'scratchRoot');
  const buildContext = payloadText(request, 'buildContext');
  const dockerfile = payloadText(request, 'dockerfile');
  const roots = allowed(constraints, 'allowedWorkspaceRoots');
  if (!within(repository, roots, existing) || !within(scratch, roots, existing)
    || !within(buildContext, [repository], existing)
    || (!within(dockerfile, [repository], existing) && !within(dockerfile, [scratch], existing))) denied(grant, buildContext);
  included(grant, payloadText(request, 'platform'), constraints, 'allowedPlatforms');
};
const kubernetesFixture: Handler = (grant, request, constraints) => {
  included(grant, payloadText(request, 'namespacePrefix'), constraints, 'allowedNamespacePrefixes');
  const manifest = request.payload.manifestPath;
  if (request.operation === 'prepare'
    && (typeof manifest !== 'string'
      || !within(manifest, allowed(constraints, 'allowedWorkspaceRoots'), existing))) {
    denied(grant, String(manifest));
  }
};
const kubernetesExposure: Handler = (grant, request, constraints) => {
  const namespace = payloadText(request, 'namespace');
  if (!allowed(constraints, 'allowedNamespacePrefixes').some((prefix) => namespace === prefix || namespace.startsWith(`${prefix}-`))) {
    denied(grant, namespace);
  }
};
const lint: Handler = (grant, request, constraints) => {
  const directory = payloadText(request, 'workingDirectory'); const policy = payloadText(request, 'policyPath');
  if (!within(directory, allowed(constraints, 'allowedRoots'), existing) || !allowed(constraints, 'allowedProjects').includes(request.resource.canonicalId)) denied(grant, directory);
  if (!within(policy, allowed(constraints, 'allowedPolicyRoots'), existing)) denied(grant, policy);
};
const testPlan: Handler = (grant, request, constraints) => {
  const root = payloadText(request, 'repositoryRoot');
  const allowedRoots = allowed(constraints, 'allowedRoots');
  if (!within(root, allowedRoots, existing)
    || !within(request.resource.canonicalId, allowedRoots, existing)
    || existing(root) !== existing(request.resource.canonicalId)) {
    denied(grant, root);
  }
};
const state: Handler = (grant, request, constraints) => { const value = request.resource.canonicalId; if (!allowed(constraints, 'allowedNamespaces').some((root) => value === root || value.startsWith(root.endsWith('/') ? root : `${root}/`))) denied(grant, value); };
const signal: Handler = (grant, request, constraints) => {
  included(grant, payloadText(request, 'signalType'), constraints, 'allowedSignalTypes');
  const issuer = request.payload.authorizedIssuer; const id = issuer && typeof issuer === 'object' && !Array.isArray(issuer) ? (issuer as Record<string, unknown>).id : undefined;
  if (typeof id !== 'string' || !allowed(constraints, 'allowedIssuerIds').includes(id)) denied(grant, String(id));
};
const telemetry: Handler = (grant, request, constraints) => { if (!allowed(constraints, 'allowedEventPrefixes').some((prefix) => request.resource.canonicalId.startsWith(prefix))) denied(grant, request.resource.canonicalId); };
const HANDLERS: Readonly<Record<string, Handler>> = Object.freeze({
  'git.repository.read':relativeRead,'git.workspace.create':git,'git.workspace.remove':git,'git.commit':git,'git.merge':git,'git.sync':git,
  'artifacts.read':artifact,'artifacts.write':artifact,'runtime.dispatch':agent,'network.http':network,'secrets.read':secret,
  'command.execute':command,'container.build':containerBuild,'kubernetes.fixture':kubernetesFixture,'kubernetes.exposure':kubernetesExposure,'lint.execute':lint,'test.plan.execute':testPlan,'test.plan.evidence':artifact,'state.read':state,'state.append':state,
  'report.evidence.read': (grant, request, constraints) => included(grant, request.resource.canonicalId, constraints, 'allowedRunIds'),
  'operator.request':target,'transport.publish':target,'signal.wait':signal,'telemetry.emit':telemetry,'agent.events.subscribe':source,
});

export function authorizeCapabilityInvocation(grant: CapabilityGrant, request: CapabilityInvocation): void {
  const capability = validateCapabilityInvocationContract(grant.capability, request);
  let constraints: Constraints;
  try { constraints = validateCapabilityConstraints(capability, grant.constraints); } catch { throw new Error(`CAPABILITY_CONSTRAINT_INVALID:${capability}`); }
  const handler = HANDLERS[grant.capability]; if (!handler) throw new Error(`CAPABILITY_HANDLER_MISSING:${grant.capability}`);
  handler(grant, request, constraints);
}

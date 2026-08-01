import type {
  CapabilityGrant,
  CapabilityInvocation,
} from '../../sdk/src/index.ts';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateCapabilityConstraints,
  validateCapabilityInvocationContract,
} from '../registry/capability-vocabulary.ts';

function allowed(
  constraints: Readonly<Record<string, readonly string[]>>,
  key: string,
): readonly string[] {
  const value = constraints[key];
  if (!value) throw new Error(`CAPABILITY_CONSTRAINT_INVALID:${key}`);
  return value;
}

function withinScope(value: string, roots: readonly string[]): boolean {
  return roots.some((root) =>
    value === root
    || value.startsWith(root.endsWith('/') ? root : `${root}/`),
  );
}

function isCanonicalAbsolute(value: string): boolean {
  return path.isAbsolute(value)
    && path.normalize(value) === value
    && !value.includes('\0')
    && !/[\r\n]/u.test(value);
}

function canonicalExisting(value: string): string | undefined {
  if (!isCanonicalAbsolute(value)) return undefined;
  try {
    return fs.realpathSync(value);
  } catch {
    return undefined;
  }
}

function canonicalPotential(value: string): string | undefined {
  if (!isCanonicalAbsolute(value)) return undefined;
  let existing = value;
  const suffix: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return undefined;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    return path.join(fs.realpathSync(existing), ...suffix);
  } catch {
    return undefined;
  }
}

function canonicalRoots(roots: readonly string[]): readonly string[] | undefined {
  const canonical = roots.map(canonicalExisting);
  return canonical.every((root): root is string => root !== undefined) ? canonical : undefined;
}

function withinCanonical(value: string, roots: readonly string[]): boolean {
  return roots.some((root) => value === root || value.startsWith(`${root}${path.sep}`));
}

function withinExisting(value: string, roots: readonly string[]): boolean {
  const canonicalValue = canonicalExisting(value);
  const resolvedRoots = canonicalRoots(roots);
  return canonicalValue !== undefined
    && resolvedRoots !== undefined
    && withinCanonical(canonicalValue, resolvedRoots);
}

function withinPotential(value: string, roots: readonly string[]): boolean {
  const canonicalValue = canonicalPotential(value);
  const resolvedRoots = canonicalRoots(roots);
  return canonicalValue !== undefined
    && resolvedRoots !== undefined
    && withinCanonical(canonicalValue, resolvedRoots);
}

function isCanonicalRelative(value: string): boolean {
  return value.length > 0
    && !path.posix.isAbsolute(value)
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.includes('\\')
    && !value.includes('\0')
    && !/[\r\n]/u.test(value)
    && !value.split('/').includes('..')
    && path.posix.normalize(value) === value;
}

function withinRelative(value: string, prefixes: readonly string[]): boolean {
  if (!isCanonicalRelative(value)) return false;
  return prefixes.some((prefix) => {
    const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return value === base || value.startsWith(`${base}/`);
  });
}

function payloadText(request: CapabilityInvocation, key: string): string {
  const value = request.payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`CAPABILITY_REQUEST_INVALID:${key}`);
  }
  return value;
}

export function authorizeCapabilityInvocation(
  grant: CapabilityGrant,
  request: CapabilityInvocation,
): void {
  const capability = validateCapabilityInvocationContract(grant.capability, request);
  let constraints: Readonly<Record<string, readonly string[]>>;
  try {
    constraints = validateCapabilityConstraints(capability, grant.constraints);
  } catch {
    throw new Error(`CAPABILITY_CONSTRAINT_INVALID:${capability}`);
  }
  switch (grant.capability) {
    case 'git.repository.read': {
      if (!withinRelative(request.resource.canonicalId, allowed(constraints, 'allowedPrefixes'))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'git.workspace.create':
    case 'git.workspace.remove':
    case 'git.commit':
    case 'git.merge':
    case 'git.sync': {
      if (!withinExisting(request.resource.canonicalId, allowed(constraints, 'allowedRoots'))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      if (grant.capability === 'git.workspace.create' || grant.capability === 'git.workspace.remove') {
        const workspacePath = payloadText(request, 'workspacePath');
        if (!withinPotential(workspacePath, allowed(constraints, 'allowedWorkspaceRoots'))) {
          throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${workspacePath}`);
        }
      }
      return;
    }
    case 'artifacts.read':
    case 'artifacts.write': {
      const namespace = payloadText(request, 'namespace');
      if (!allowed(constraints, 'allowedNamespaces').includes(namespace)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${namespace}`);
      }
      return;
    }
    case 'runtime.dispatch': {
      if (!allowed(constraints, 'allowedAgents').includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'network.http': {
      let origin: string;
      try {
        origin = new URL(request.resource.canonicalId).origin;
      } catch {
        throw new Error(`CAPABILITY_RESOURCE_INVALID:${grant.capability}`);
      }
      if (!allowed(constraints, 'allowedOrigins').includes(origin)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${origin}`);
      }
      return;
    }
    case 'secrets.read': {
      if (!allowed(constraints, 'allowedNames').includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'command.execute': {
      if (!allowed(constraints, 'allowedExecutables').includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      const workingDirectory = payloadText(request, 'workingDirectory');
      if (!withinExisting(workingDirectory, allowed(constraints, 'allowedWorkingRoots'))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${workingDirectory}`);
      }
      return;
    }
    case 'lint.execute': {
      const workingDirectory = payloadText(request, 'workingDirectory');
      const policyPath = payloadText(request, 'policyPath');
      if (
        !withinExisting(workingDirectory, allowed(constraints, 'allowedRoots'))
        || !allowed(constraints, 'allowedProjects').includes(request.resource.canonicalId)
      ) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${workingDirectory}`);
      }
      if (!withinExisting(policyPath, allowed(constraints, 'allowedPolicyRoots'))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${policyPath}`);
      }
      return;
    }
    case 'test.suite.execute': {
      const repositoryRoot = payloadText(request, 'repositoryRoot');
      if (!withinExisting(repositoryRoot, allowed(constraints, 'allowedRoots'))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${repositoryRoot}`);
      }
      const suites = request.payload.suites;
      if (
        !Array.isArray(suites)
        || suites.length === 0
        || suites.some(
          (suite) => typeof suite !== 'string'
            || !allowed(constraints, 'allowedSuites').includes(suite),
        )
      ) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:suites`);
      }
      return;
    }
    case 'state.read':
    case 'state.append': {
      if (!withinScope(request.resource.canonicalId, allowed(constraints, 'allowedNamespaces'))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'operator.request':
    case 'transport.publish': {
      if (!allowed(constraints, 'allowedTargets').includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'signal.wait': {
      const signalType = payloadText(request, 'signalType');
      if (!allowed(constraints, 'allowedSignalTypes').includes(signalType)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${String(request.payload.signalType)}`);
      }
      const issuer = request.payload.authorizedIssuer;
      const issuerId = issuer && typeof issuer === 'object' && !Array.isArray(issuer)
        ? (issuer as Record<string, unknown>).id
        : undefined;
      if (typeof issuerId !== 'string' || !allowed(constraints, 'allowedIssuerIds').includes(issuerId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${String(issuerId)}`);
      }
      return;
    }
    case 'telemetry.emit': {
      if (!allowed(constraints, 'allowedEventPrefixes').some(
        (prefix) => request.resource.canonicalId.startsWith(prefix),
      )) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'agent.events.subscribe': {
      if (!allowed(constraints, 'allowedSources').includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
  }
}

import type {
  CapabilityGrant,
  CapabilityInvocation,
} from '../../sdk/src/index.ts';

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`CAPABILITY_CONSTRAINT_INVALID:${label}`);
  }
  return value;
}

export function authorizeCapabilityInvocation(
  grant: CapabilityGrant,
  request: CapabilityInvocation,
): void {
  const constraints = grant.constraints;
  switch (grant.capability) {
    case 'git.repository.read': {
      const prefixes = stringArray(constraints.allowedPrefixes, 'allowedPrefixes');
      if (!prefixes.some((prefix) => request.resource.canonicalId.startsWith(prefix))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'git.workspace.create':
    case 'git.commit':
    case 'git.merge':
    case 'git.sync': {
      const roots = stringArray(constraints.allowedRoots, 'allowedRoots');
      if (!roots.some((root) => request.resource.canonicalId.startsWith(root))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'artifacts.read':
    case 'artifacts.write': {
      const namespace = constraints.namespace;
      if (typeof namespace !== 'string') throw new Error('CAPABILITY_CONSTRAINT_INVALID:namespace');
      if (grant.capability === 'artifacts.write' && request.payload.namespace !== namespace) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${String(request.payload.namespace)}`);
      }
      return;
    }
    case 'runtime.dispatch': {
      const agents = stringArray(constraints.allowedAgents, 'allowedAgents');
      if (!agents.includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'network.http': {
      const origins = stringArray(constraints.allowedOrigins, 'allowedOrigins');
      const origin = new URL(request.resource.canonicalId).origin;
      if (!origins.includes(origin)) throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${origin}`);
      return;
    }
    case 'secrets.read': {
      const names = stringArray(constraints.allowedNames, 'allowedNames');
      if (!names.includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'command.execute': {
      const executables = stringArray(constraints.allowedExecutables, 'allowedExecutables');
      if (!executables.includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'state.read':
    case 'state.append': {
      const namespace = constraints.namespace;
      if (typeof namespace !== 'string' || !request.resource.canonicalId.startsWith(namespace)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'operator.request':
    case 'transport.publish': {
      const targets = stringArray(constraints.allowedTargets, 'allowedTargets');
      if (!targets.includes(request.resource.canonicalId)) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    case 'signal.wait': {
      const signalTypes = stringArray(constraints.allowedSignalTypes, 'allowedSignalTypes');
      if (!signalTypes.includes(String(request.payload.signalType))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${String(request.payload.signalType)}`);
      }
      return;
    }
    case 'telemetry.emit': {
      const eventPrefixes = stringArray(constraints.allowedEventPrefixes, 'allowedEventPrefixes');
      if (!eventPrefixes.some((prefix) => request.resource.canonicalId.startsWith(prefix))) {
        throw new Error(`CAPABILITY_RESOURCE_DENIED:${grant.capability}:${request.resource.canonicalId}`);
      }
      return;
    }
    default:
      return;
  }
}

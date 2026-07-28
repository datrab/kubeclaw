import type { CapabilityInvocation } from '../../sdk/src/index.ts';
import path from 'node:path';
import { RegistryError } from './errors.ts';

interface CapabilityDefinition {
  readonly operations: readonly string[];
  readonly resourceTypes: readonly string[];
  readonly constraintSchema: Readonly<Record<string, unknown>>;
}

const stringList = Object.freeze({
  type: 'array',
  minItems: 1,
  uniqueItems: true,
  items: Object.freeze({ type: 'string', minLength: 1 }),
});

function definition(
  operations: readonly string[],
  resourceTypes: readonly string[],
  requiredConstraints: readonly string[],
): CapabilityDefinition {
  return Object.freeze({
    operations: Object.freeze([...operations]),
    resourceTypes: Object.freeze([...resourceTypes]),
    constraintSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze([...requiredConstraints]),
      properties: Object.freeze(Object.fromEntries(
        requiredConstraints.map((constraint) => [constraint, stringList]),
      )),
    }),
  });
}

export const CAPABILITY_DEFINITIONS = Object.freeze({
  'state.read': definition(['read'], ['state.namespace'], ['allowedNamespaces']),
  'state.append': definition(['append'], ['state.namespace'], ['allowedNamespaces']),
  'artifacts.read': definition(['get_json'], ['artifact.object'], ['allowedNamespaces']),
  'artifacts.write': definition(['put_json'], ['artifact.object'], ['allowedNamespaces']),
  'runtime.dispatch': definition(['dispatch'], ['runtime.agent'], ['allowedAgents']),
  'git.repository.read': definition(['read_text'], ['git.repository.path'], ['allowedPrefixes']),
  'git.workspace.create': definition(
    ['create'],
    ['git.repository'],
    ['allowedRoots', 'allowedWorkspaceRoots'],
  ),
  'git.commit': definition(['commit'], ['git.repository', 'git.workspace'], ['allowedRoots']),
  'git.merge': definition(['merge'], ['git.repository', 'git.workspace'], ['allowedRoots']),
  'git.sync': definition(['sync_paths', 'fetch', 'rebase', 'push'], ['git.repository', 'git.workspace'], ['allowedRoots']),
  'signal.wait': definition(
    ['create', 'read'],
    ['signal.wait'],
    ['allowedSignalTypes', 'allowedIssuerIds'],
  ),
  'operator.request': definition(['publish'], ['operator.target'], ['allowedTargets']),
  'telemetry.emit': definition(['append'], ['telemetry.event'], ['allowedEventPrefixes']),
  'secrets.read': definition(['resolve'], ['secret.name'], ['allowedNames']),
  'network.http': definition(['request'], ['network.url'], ['allowedOrigins']),
  'command.execute': definition(
    ['run'],
    ['command.executable'],
    ['allowedExecutables', 'allowedWorkingRoots'],
  ),
  'lint.execute': definition(
    ['run_report'],
    ['lint.project'],
    ['allowedProjects', 'allowedRoots', 'allowedPolicyRoots'],
  ),
  'transport.publish': definition(['publish'], ['transport.target'], ['allowedTargets']),
  'agent.events.subscribe': definition(['status'], ['agent.events'], ['allowedSources']),
} satisfies Record<string, CapabilityDefinition>);

export const CAPABILITY_IDS = Object.freeze(
  Object.keys(CAPABILITY_DEFINITIONS) as Array<keyof typeof CAPABILITY_DEFINITIONS>,
);
export type CapabilityId = typeof CAPABILITY_IDS[number];

const CORE_ONLY_CAPABILITY_IDS = Object.freeze([
  'lifecycle.write',
  'scheduler.advance',
  'canonical_events.modify',
  'registry.mutate',
] as const);
const coreOnlyCapabilities = new Set<string>(CORE_ONLY_CAPABILITY_IDS);

export function isCoreOnlyCapability(capability: string): boolean {
  return coreOnlyCapabilities.has(capability);
}

export function isKnownCapability(capability: string): capability is CapabilityId {
  return Object.hasOwn(CAPABILITY_DEFINITIONS, capability);
}

function constraintLists(
  capability: CapabilityId,
  constraints: Readonly<Record<string, unknown>>,
): Readonly<Record<string, readonly string[]>> {
  const definition = CAPABILITY_DEFINITIONS[capability];
  const required = definition.constraintSchema.required as readonly string[];
  const sortedRequired = [...required].sort();
  const keys = Object.keys(constraints).sort();
  if (keys.length !== required.length || keys.some((key, index) => key !== sortedRequired[index])) {
    throw new RegistryError(
      'REGISTRY_CAPABILITY_CONSTRAINT_INVALID',
      `Invalid constraints for capability '${capability}'`,
    );
  }
  const resolved: Array<readonly [string, readonly string[]]> = [];
  for (const key of required) {
    const value = constraints[key];
    if (
      !Array.isArray(value)
      || value.length === 0
      || !value.every((entry) => typeof entry === 'string' && entry.length > 0)
      || new Set(value).size !== value.length
    ) {
      throw new RegistryError(
        'REGISTRY_CAPABILITY_CONSTRAINT_INVALID',
        `Invalid constraints for capability '${capability}'`,
      );
    }
    resolved.push([key, Object.freeze([...value])]);
  }
  const normalized = Object.fromEntries(resolved) as Record<string, readonly string[]>;
  for (const key of [
    'allowedRoots',
    'allowedWorkspaceRoots',
    'allowedWorkingRoots',
    'allowedPolicyRoots',
  ]) {
    if (normalized[key]?.some((entry) => !path.isAbsolute(entry) || path.normalize(entry) !== entry)) {
      throw new RegistryError(
        'REGISTRY_CAPABILITY_CONSTRAINT_INVALID',
        `Capability '${capability}' requires absolute paths in '${key}'`,
      );
    }
  }
  if (normalized.allowedExecutables?.some(
    (entry) => !path.isAbsolute(entry) || path.normalize(entry) !== entry,
  )) {
    throw new RegistryError(
      'REGISTRY_CAPABILITY_CONSTRAINT_INVALID',
      `Capability '${capability}' requires absolute executable paths`,
    );
  }
  if (normalized.allowedPrefixes?.some(
    (entry) => {
      const canonical = entry.endsWith('/') ? entry.slice(0, -1) : entry;
      return path.isAbsolute(entry)
        || /^[A-Za-z]:[\\/]/u.test(entry)
        || entry.includes('\\')
        || canonical === '..'
        || canonical.startsWith('../')
        || path.posix.normalize(canonical) !== canonical;
    },
  )) {
    throw new RegistryError(
      'REGISTRY_CAPABILITY_CONSTRAINT_INVALID',
      `Capability '${capability}' requires repository-relative path prefixes`,
    );
  }
  if (normalized.allowedOrigins?.some((entry) => {
    try {
      const url = new URL(entry);
      return !['http:', 'https:'].includes(url.protocol) || url.origin !== entry;
    } catch {
      return true;
    }
  })) {
    throw new RegistryError(
      'REGISTRY_CAPABILITY_CONSTRAINT_INVALID',
      `Capability '${capability}' requires canonical HTTP origins`,
    );
  }
  return Object.freeze(normalized);
}

export function validateCapabilityConstraints(
  capability: string,
  constraints: Readonly<Record<string, unknown>>,
): Readonly<Record<string, readonly string[]>> {
  if (!isKnownCapability(capability)) {
    throw new RegistryError('REGISTRY_CAPABILITY_UNKNOWN', `Unknown capability: ${capability}`);
  }
  return constraintLists(capability, constraints);
}

export function validateCapabilityInvocationContract(
  capability: string,
  request: CapabilityInvocation,
): CapabilityId {
  if (!isKnownCapability(capability)) {
    throw new Error(`CAPABILITY_UNKNOWN:${capability}`);
  }
  const definition = CAPABILITY_DEFINITIONS[capability];
  if (!definition.operations.includes(request.operation)) {
    throw new Error(`CAPABILITY_OPERATION_DENIED:${capability}:${request.operation}`);
  }
  if (!definition.resourceTypes.includes(request.resource.type)) {
    throw new Error(`CAPABILITY_RESOURCE_TYPE_DENIED:${capability}:${request.resource.type}`);
  }
  if (request.resource.canonicalId.length === 0) {
    throw new Error(`CAPABILITY_RESOURCE_INVALID:${capability}`);
  }
  return capability;
}

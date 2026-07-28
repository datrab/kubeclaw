import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginInvocationContext } from '../../sdk/src/index.ts';
import { invokeIsolated } from '../isolation/runner.ts';
import { RegistryError } from './errors.ts';
import { FrozenMap } from './frozen-map.ts';
import type { RegistrySnapshot } from './types.ts';

export interface ActivatedRegistration {
  readonly execute: (...args: readonly unknown[]) => unknown;
}

export interface ActivatedRegistry {
  readonly snapshot: RegistrySnapshot;
  readonly stages: ReadonlyMap<string, ActivatedRegistration>;
  readonly observers: ReadonlyMap<string, ActivatedRegistration>;
  readonly adapters: ReadonlyMap<string, ActivatedRegistration>;
}

async function load(
  surface: 'stage' | 'observer' | 'adapter',
  entry: {
    readonly package: { readonly root: string; readonly provenance: { readonly trustScope: string } };
    readonly registration: { readonly module: string; readonly export: string };
  },
): Promise<ActivatedRegistration> {
  if (entry.package.provenance.trustScope !== 'trusted_first_party') {
    if (surface === 'adapter') {
      throw new RegistryError(
        'REGISTRY_ACTIVATION_FAILED',
        'External capability adapters require a persistent isolated adapter runtime',
      );
    }
    return Object.freeze({
      execute: (argument: unknown, context: unknown) => {
        if (
          !context
          || typeof context !== 'object'
          || !('contract' in context)
          || !('invoke' in context)
        ) {
          throw new RegistryError(
            'REGISTRY_ACTIVATION_FAILED',
            'External registration invocation requires a bounded plugin context',
          );
        }
        return invokeIsolated({
          packageRoot: entry.package.root,
          modulePath: path.join(entry.package.root, entry.registration.module),
          exportName: entry.registration.export,
          surface,
          argument,
          context: context as PluginInvocationContext,
        });
      },
    });
  }
  try {
    const module = await import(pathToFileURL(`${entry.package.root}/${entry.registration.module}`).href);
    const execute = module[entry.registration.export];
    if (typeof execute !== 'function') {
      throw new RegistryError('REGISTRY_EXECUTOR_INVALID', `Registration export is not a function: ${entry.registration.export}`);
    }
    return Object.freeze({ execute });
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError('REGISTRY_ACTIVATION_FAILED', 'Plugin registration activation failed', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function activateRegistry(
  snapshot: RegistrySnapshot,
  enabledRegistrations: ReadonlySet<string>,
): Promise<ActivatedRegistry> {
  const stageEntries = await Promise.all([...snapshot.stages]
    .filter(([, entry]) => enabledRegistrations.has(`${entry.package.manifest.id}:${entry.registration.id}`))
    .map(async ([id, entry]) => [id, await load('stage', entry)] as const));
  const observerEntries = await Promise.all([...snapshot.observers]
    .filter(([id]) => enabledRegistrations.has(id))
    .map(async ([id, entry]) => [id, await load('observer', entry)] as const));
  const adapterEntries = await Promise.all([...snapshot.adapters]
    .filter(([id]) => enabledRegistrations.has(id))
    .map(async ([id, entry]) => [id, await load('adapter', entry)] as const));
  return Object.freeze({
    snapshot,
    stages: new FrozenMap(stageEntries),
    observers: new FrozenMap(observerEntries),
    adapters: new FrozenMap(adapterEntries),
  });
}

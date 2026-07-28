export * from './generated/contracts.ts';
export type {
  CapabilityInvocation,
  AdapterActivationContext,
  AdapterFactory,
  AdapterInstance,
  AdapterInvocation,
  EffectJournal,
  ObserverHandler,
  PluginInvocationContext,
} from './runtime.ts';

export const PLUGIN_API_VERSION = 'pipeline-plugin-v2' as const;

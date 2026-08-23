export * from './generated/contracts.ts';
export * from './values.ts';
export * from './runtime-agent-task.ts';
export type {
  CapabilityInvocation,
  AdapterActivationContext,
  AdapterFactory,
  AdapterInstance,
  AdapterInvocation,
  EffectJournal,
  ObserverHandler,
  PluginInvocationContext,
  TestProviderCapabilityRequest,
  TestProviderExecutionContext,
  TestProviderFactory,
  TestProviderInstance,
  ReportAdapterFunction,
  ReportAdapterInput,
  ReportAdapterLimits,
  ReportAdapterOutput,
} from './runtime.ts';

export const PLUGIN_API_VERSION = 'pipeline-plugin-v2' as const;

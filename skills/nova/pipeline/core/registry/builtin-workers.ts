import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../constants.ts';
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
import { emitBuiltinBridgeTrace, readPluginConfig } from './builtin-bridge.ts';

type AnyRecord = Record<string, any>;

function workerDefinition(workerType: 'module_forge' | 'module_buster') {
  const isBuster = workerType === 'module_buster';
  const stageId = `worker:${workerType}`;
  return {
    manifest: {
      moduleId: `builtin.worker.${workerType}`,
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'worker',
      hookFamily: 'worker.execute',
      stageIds: [stageId],
      capabilities: [
        'read.state',
        'read.artifacts',
        'emit.stream',
        'emit.telemetry',
        'write.artifacts',
        'dispatch.worker_runtime',
        'notify.operator',
      ],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: `Built-in module ${isBuster ? 'Buster' : 'Forge'} worker`,
      description: `Current module ${isBuster ? 'Buster' : 'Forge'} worker execution wired through the startup registry seam.`,
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        await readPluginConfig(ctx);
        const traceData = {
          stageId,
          moduleId: selectTruthyValue(() => input?.ids?.moduleId, () => null),
          attempt: selectDefinedValue(() => input?.ids?.attempt, () => null),
          ...(isBuster
            ? { dispatchId: selectTruthyValue(() => input?.ids?.dispatchId, () => null) }
            : {}),
        };
        await emitBuiltinBridgeTrace(
          ctx,
          `plugin.worker.${workerType}.bridge_invoked`,
          `Invoking built-in module ${isBuster ? 'Buster' : 'Forge'} worker through PluginContextV1`,
          traceData,
        );
        return ctx.workerRuntime.dispatch({
          workerType,
          moduleId: traceData.moduleId,
          attempt: traceData.attempt,
          ...(isBuster ? { dispatchId: traceData.dispatchId } : {}),
        });
      },
    },
    sourceRef: 'builtin:agents/orchestration.ts',
    implementationRef: `agents/orchestration.ts#runModule${isBuster ? 'Buster' : 'Forge'}Worker`,
  };
}

export function getBuiltinWorkerPluginDefinitions() {
  return [workerDefinition('module_forge'), workerDefinition('module_buster')];
}

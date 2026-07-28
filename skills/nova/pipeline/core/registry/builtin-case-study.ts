import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../constants.ts';
import { generateCaseStudy } from '../../services/case-study.ts';
import {
  emitBuiltinBridgeTrace,
  readPluginConfig,
  readPluginDeps,
  readPluginProgress,
} from './builtin-bridge.ts';

type AnyRecord = Record<string, any>;

export function getBuiltinCaseStudyPluginDefinition() {
  return {
    manifest: {
      moduleId: 'builtin.generator.case_study',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: ['generator:case_study'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts', 'emit.telemetry', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in case study generator',
      description: 'Current case-study generator wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (_input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(
          ctx,
          'plugin.generator.case_study.bridge_invoked',
          'Invoking built-in case study generator through PluginContextV1',
          { stageId: 'generator:case_study' },
        );
        return generateCaseStudy(config, progress, { deps: readPluginDeps(ctx) });
      },
    },
    sourceRef: 'builtin:services/case-study.ts',
    implementationRef: 'services/case-study.ts#generateCaseStudy',
  };
}

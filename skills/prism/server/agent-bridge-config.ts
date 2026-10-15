import { rejectLegacyAuthors } from '@kubeclaw/plugin-foundation/config/swarm';
import { projectAgentBridgeSettings } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import type { PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';

export function loadAgentBridgeConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env) {
  rejectLegacyAuthors(environment);
  for (const key of ['PORT', 'PRISM_CONTROL_URL']) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}:use prism-control agentBridge settings`);
  }
  return projectAgentBridgeSettings(capture);
}

import { studioBrowserPolicy } from '../studio/browser-policy.ts';
import { fileURLToPath } from 'node:url';
import { rejectLegacyAuthors } from '@kubeclaw/plugin-foundation/config/swarm';
import { projectStudioSettings } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import type { PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import type { StudioOptions } from './studio-request.ts';

/** Operator settings are one authored snapshot; assets and secrets remain installation inputs. */
export function loadStudioConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env): StudioOptions & { port: number } {
  rejectLegacyAuthors(environment);
  for (const key of ['PORT', 'PRISM_CONTROL_TIMEOUT_MS', 'PRISM_CONTROL_URL']) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}:use prism-studio.config.json settings`);
  }
  const settings = projectStudioSettings(capture);
  return Object.freeze({ browserPolicy: studioBrowserPolicy(settings.browserPolicy), maximumRequestBodyBytes: settings.maximumRequestBodyBytes, port: settings.port, controlTimeoutMs: settings.controlTimeoutMs,
    root: environment.STUDIO_ROOT ?? fileURLToPath(new URL('../dist-studio', import.meta.url)),
    control: new URL(settings.controlUrl), ingressSecret: environment.PRISM_INGRESS_SECRET ?? '' });
}

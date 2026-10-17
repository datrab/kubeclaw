import path from 'node:path';
import { rejectLegacyAuthors } from '@kubeclaw/plugin-foundation/config/swarm';
import { projectIngestionSettings } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import type { PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';

export function loadIngestionConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env) {
  rejectLegacyAuthors(environment);
  for (const key of ['PORT', 'PRISM_QUARANTINE_ROOT', 'PRISM_QUARANTINE_TTL_MS']) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}:use prism-control.config.json settings.ingestionServer`);
  }
  const settings = projectIngestionSettings(capture);
  if (!path.isAbsolute(settings.quarantineRoot) || path.resolve(settings.quarantineRoot) !== settings.quarantineRoot || settings.quarantineRoot === '/') {
    throw new Error('PRISM_INGESTION_QUARANTINE_ROOT_INVALID');
  }
  const secret = environment.PRISM_INGESTION_SECRET;
  if (!secret) throw new Error('PRISM_INGESTION_SECRET is required');
  return Object.freeze({ ...settings, secret });
}
